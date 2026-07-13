import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchTokenHolders, fetchTokenTransfers, fetchTokenInfo } from "@/lib/api/blockscout";
import { aggregateHoldings, computeNetPositionChange } from "@/lib/wallet-tracking";
import { Pool } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
// Only the top N pools by liquidity are scanned for holders/transfers to
// keep this well within the timeout window — Blockscout calls are the
// bottleneck here, not Supabase writes.
const TOKENS_TO_SCAN = 12;

// Populates the wallets / wallet_holdings / wallet_activity tables from
// real on-chain data (Blockscout), for the top N tokens by liquidity.
//
// Methodology (see /docs for the public explanation):
//  - Contract addresses (pools, routers, vaults) are excluded — this tracks
//    real wallets, not DEX infrastructure.
//  - "Holdings" = current on-chain token balance x current price. Accurate.
//  - "Net position change (7d)" = net USD value of buys minus sells in the
//    last 7 days, valued at CURRENT price (not historical price at time of
//    trade, which isn't available without a dedicated price-history indexer).
//    This is a directional signal (accumulating vs. distributing), not a
//    precise realized PnL figure.
//
// Protected by CRON_SECRET, same as /api/cron/snapshot.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const now = new Date();
  const sinceMs = now.getTime() - SEVEN_DAYS_MS;

  try {
    const { data: pools } = await supabase
      .from("pools")
      .select("*")
      .order("liquidity_usd", { ascending: false })
      .limit(TOKENS_TO_SCAN * 2); // fetch extra since multiple pools can share a token

    const allPools = (pools || []) as Pool[];

    // The same token can have multiple pools (different fee tiers / pair
    // sides, e.g. CASHCAT/WETH 0.3% and CASHCAT/WETH 1%) — dedupe by token
    // address first, keeping the highest-liquidity pool as the representative
    // one (for symbol/price), so we don't scan + double-count the same token.
    const tokenMap = new Map<string, Pool>();
    for (const pool of allPools) {
      if (!pool.base_token_address) continue;
      if (!tokenMap.has(pool.base_token_address)) {
        tokenMap.set(pool.base_token_address, pool);
      }
    }
    const topPools = Array.from(tokenMap.values()).slice(0, TOKENS_TO_SCAN);

    const holdersByToken: {
      tokenAddress: string;
      priceUsd: number;
      decimals: number;
      holders: Awaited<ReturnType<typeof fetchTokenHolders>>;
    }[] = [];
    const netChangeByWallet = new Map<string, number>();

    await Promise.all(
      topPools.map(async (pool) => {
        const tokenAddress = pool.base_token_address;
        const priceUsd = pool.base_token_price_usd ?? 0;
        if (!tokenAddress || priceUsd <= 0) return;

        const [info, holders, transfers] = await Promise.all([
          fetchTokenInfo(tokenAddress),
          fetchTokenHolders(tokenAddress, 15),
          fetchTokenTransfers(tokenAddress, 2),
        ]);

        const decimals = info?.decimals ?? 18;
        holdersByToken.push({ tokenAddress, priceUsd, decimals, holders });

        const netMap = computeNetPositionChange(transfers, priceUsd, sinceMs);
        for (const [wallet, net] of netMap.entries()) {
          netChangeByWallet.set(wallet, (netChangeByWallet.get(wallet) || 0) + net);
        }
      })
    );

    const positions = aggregateHoldings(holdersByToken);

    // Rank by holdings value, keep the top 50 non-contract wallets.
    const rankedWallets = Array.from(positions.values())
      .sort((a, b) => b.holdingsUsd - a.holdingsUsd)
      .slice(0, 50);

    const walletRows = rankedWallets.map((w, i) => ({
      wallet_address: w.walletAddress,
      is_contract: false,
      total_holdings_usd: w.holdingsUsd,
      net_position_change_7d_usd: netChangeByWallet.get(w.walletAddress) ?? 0,
      rank: i + 1,
      last_synced_at: now.toISOString(),
    }));

    const holdingRows: Record<string, unknown>[] = [];
    for (const { tokenAddress, priceUsd, decimals, holders } of holdersByToken) {
      for (const holder of holders) {
        if (holder.address.is_contract) continue;
        if (!rankedWallets.find((w) => w.walletAddress === holder.address.hash)) continue;

        const amount = Number(holder.value || "0") / Math.pow(10, decimals);
        const usdValue = amount * priceUsd;
        if (usdValue <= 0) continue;

        const pool = topPools.find((p) => p.base_token_address === tokenAddress);
        holdingRows.push({
          wallet_address: holder.address.hash,
          token_address: tokenAddress,
          token_symbol: pool?.base_token_symbol ?? null,
          value_usd: usdValue,
          updated_at: now.toISOString(),
        });
      }
    }

    const activityRows: Record<string, unknown>[] = [];
    await Promise.all(
      topPools.map(async (pool) => {
        const tokenAddress = pool.base_token_address;
        const priceUsd = pool.base_token_price_usd ?? 0;
        if (!tokenAddress || priceUsd <= 0) return;

        const transfers = await fetchTokenTransfers(tokenAddress, 2);
        for (const t of transfers) {
          const ts = new Date(t.timestamp).getTime();
          if (ts < sinceMs) continue;

          const decimals = Number(t.total?.decimals ?? 18);
          const amount = Number(t.total?.value || "0") / Math.pow(10, decimals);
          const usdValue = amount * priceUsd;
          if (usdValue <= 0) continue;

          if (!t.to.is_contract && rankedWallets.find((w) => w.walletAddress === t.to.hash)) {
            activityRows.push({
              wallet_address: t.to.hash,
              action: "buy",
              token_symbol: pool.base_token_symbol,
              token_address: tokenAddress,
              amount_usd: usdValue,
              tx_hash: t.transaction_hash,
              occurred_at: t.timestamp,
            });
          }
          if (!t.from.is_contract && rankedWallets.find((w) => w.walletAddress === t.from.hash)) {
            activityRows.push({
              wallet_address: t.from.hash,
              action: "sell",
              token_symbol: pool.base_token_symbol,
              token_address: tokenAddress,
              amount_usd: usdValue,
              tx_hash: t.transaction_hash,
              occurred_at: t.timestamp,
            });
          }
        }
      })
    );

    // Remove wallets that no longer make the top-50 cut (e.g. dropped out of
    // ranking, or were previously included before a filter like the burn-
    // address exclusion was added) — otherwise stale rows linger forever
    // since upsert only adds/updates, never removes.
    const newWalletAddressSet = new Set(rankedWallets.map((w) => w.walletAddress));
    const { data: existingWallets } = await supabase.from("wallets").select("wallet_address");
    const staleAddresses = (existingWallets || [])
      .map((w) => w.wallet_address as string)
      .filter((addr) => !newWalletAddressSet.has(addr));

    if (staleAddresses.length) {
      await supabase.from("wallets").delete().in("wallet_address", staleAddresses);
    }

    // wallets must be upserted before holdings/activity due to the FK constraint.
    const walletsResult = walletRows.length
      ? await supabase.from("wallets").upsert(walletRows, { onConflict: "wallet_address" })
      : { error: null };

    if (walletsResult.error) {
      console.error("wallets upsert error:", walletsResult.error);
      return NextResponse.json(
        { ok: false, error: walletsResult.error.message },
        { status: 500 }
      );
    }

    const walletAddressList = rankedWallets.map((w) => w.walletAddress);

    // Delete stale holdings/activity rows for these wallets BEFORE inserting
    // fresh ones (must be sequential, not parallel, to avoid a race where
    // the delete wipes out rows that were just inserted).
    await Promise.all([
      walletAddressList.length
        ? supabase.from("wallet_holdings").delete().in("wallet_address", walletAddressList)
        : Promise.resolve({ error: null }),
      walletAddressList.length
        ? supabase.from("wallet_activity").delete().in("wallet_address", walletAddressList)
        : Promise.resolve({ error: null }),
    ]);

    const [holdingsResult, activityResult] = await Promise.all([
      holdingRows.length
        ? supabase.from("wallet_holdings").insert(holdingRows)
        : Promise.resolve({ error: null }),
      activityRows.length
        ? supabase.from("wallet_activity").insert(activityRows)
        : Promise.resolve({ error: null }),
    ]);

    if (holdingsResult.error) console.error("wallet_holdings insert error:", holdingsResult.error);
    if (activityResult.error) console.error("wallet_activity insert error:", activityResult.error);

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      tokensScanned: holdersByToken.length,
      walletsUpserted: walletRows.length,
      holdingsInserted: holdingRows.length,
      activityInserted: activityRows.length,
    });
  } catch (err) {
    console.error("Wallet cron failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
