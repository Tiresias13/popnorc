import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchPools, extractTokenAddress } from "@/lib/api/geckoterminal";
import {
  categorizeToken,
  computeRiskScore,
  riskScoreToLevel,
  findClosestOfficialTicker,
} from "@/lib/risk-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// This endpoint is called periodically by cron-job.org to:
// 1. Pull the latest pool data from GeckoTerminal
// 2. Categorize tokens (RWA vs meme vs other) and score liquidity risk
// 3. Flag potential imposter tickers
// 4. Persist everything to Supabase (pools, pool_history, tokens, volume_snapshots)
//
// Protected by a shared secret passed via the Authorization header:
//   Authorization: Bearer <CRON_SECRET>
//
// All writes are batched (one upsert/insert call per table) instead of
// per-pool, to stay well within cron-job.org's timeout window even when
// processing 50-100+ pools.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const now = new Date();

  try {
    const [poolsPage1, poolsPage2] = await Promise.all([
      fetchPools(1),
      fetchPools(2).catch(() => []),
    ]);
    const pools = [...poolsPage1, ...poolsPage2];

    // GeckoTerminal's volume_usd.h24 is a rolling 24h figure re-fetched every
    // run (every ~15 min). Summing that raw value across snapshots massively
    // over-counts actual volume. To build an accurate heatmap, we instead
    // store the DELTA between this run's rolling volume and the previous
    // run's, which approximates the volume traded in the interval between
    // snapshots. Fetch the previous known volume per pool in one batched query.
    const poolAddresses = pools.map((p) => p.attributes.address);
    const { data: previousPools } = await supabase
      .from("pools")
      .select("pool_address, volume_24h_usd")
      .in("pool_address", poolAddresses);

    const previousVolumeByPool = new Map<string, number>(
      (previousPools || []).map((p) => [p.pool_address, Number(p.volume_24h_usd || 0)])
    );

    const poolRows: Record<string, unknown>[] = [];
    const historyRows: Record<string, unknown>[] = [];
    const tokenRows: Record<string, unknown>[] = [];
    const volumeRows: Record<string, unknown>[] = [];

    for (const pool of pools) {
      const attrs = pool.attributes;
      const baseTokenAddress = extractTokenAddress(pool.relationships.base_token.data.id);
      const quoteTokenAddress = extractTokenAddress(pool.relationships.quote_token.data.id);
      const dexId = pool.relationships.dex.data.id;

      const liquidityUsd = parseFloat(attrs.reserve_in_usd || "0");
      const volume24hUsd = parseFloat(attrs.volume_usd?.h24 || "0");
      const priceChange24h = parseFloat(attrs.price_change_percentage?.h24 || "0");
      const baseTokenPriceUsd = attrs.base_token_price_usd
        ? parseFloat(attrs.base_token_price_usd)
        : null;
      const marketCapUsd = attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : null;
      const fdvUsd = attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : null;
      const poolCreatedAt = attrs.pool_created_at ? new Date(attrs.pool_created_at) : null;
      const poolAgeHours = poolCreatedAt
        ? (now.getTime() - poolCreatedAt.getTime()) / (1000 * 60 * 60)
        : 999999;

      // Derive a symbol from the pool name, e.g. "TSLA-hood / WETH" -> "TSLA-hood"
      const baseSymbol = attrs.name.split("/")[0]?.trim() || attrs.name;
      const category = categorizeToken(baseSymbol);
      const riskScore = computeRiskScore({ liquidityUsd, poolAgeHours, volume24hUsd });
      const riskLevel = riskScoreToLevel(riskScore);

      poolRows.push({
        pool_address: attrs.address,
        pool_name: attrs.name,
        base_token_address: baseTokenAddress,
        base_token_symbol: baseSymbol,
        quote_token_address: quoteTokenAddress,
        quote_token_symbol: attrs.name.split("/")[1]?.trim() || null,
        dex_id: dexId,
        category,
        liquidity_usd: liquidityUsd,
        volume_24h_usd: volume24hUsd,
        price_change_24h: priceChange24h,
        base_token_price_usd: baseTokenPriceUsd,
        market_cap_usd: marketCapUsd,
        fdv_usd: fdvUsd,
        pool_created_at: poolCreatedAt?.toISOString() ?? null,
        risk_score: riskScore,
        risk_level: riskLevel,
        last_synced_at: now.toISOString(),
      });

      historyRows.push({
        pool_address: attrs.address,
        liquidity_usd: liquidityUsd,
        volume_24h_usd: volume24hUsd,
        price_usd: baseTokenPriceUsd,
        recorded_at: now.toISOString(),
      });

      if (category === "rwa") {
        const { closestMatch, similarity } = findClosestOfficialTicker(baseSymbol);
        const isExactMatch = closestMatch === baseSymbol;

        let verificationStatus: "verified" | "imposter" | "reviewing" = "reviewing";
        let flaggedReason: string | null = null;

        if (isExactMatch) {
          verificationStatus = "verified";
        } else if (similarity >= 80) {
          verificationStatus = "imposter";
          flaggedReason = `Mimics official ticker "${closestMatch}" (${similarity}% name similarity), but does not match exactly.`;
        } else {
          verificationStatus = "reviewing";
          flaggedReason = "Does not closely match any known official ticker. Needs manual review.";
        }

        tokenRows.push({
          token_address: baseTokenAddress,
          symbol: baseSymbol,
          name: baseSymbol,
          category,
          verification_status: verificationStatus,
          matches_official_docs: isExactMatch,
          liquidity_locked_pct: liquidityUsd > 50_000 ? 90 : liquidityUsd > 10_000 ? 40 : 5,
          name_similarity_score: similarity,
          flagged_reason: flaggedReason,
          verified_at: verificationStatus === "verified" ? now.toISOString() : null,
          updated_at: now.toISOString(),
        });
      }

      // Delta-based interval volume: how much the rolling 24h figure moved
      // since the last snapshot. Negative deltas (old volume rolling off
      // the 24h window with no new trades) are floored at 0 — they don't
      // represent negative trading activity.
      const previousVolume = previousVolumeByPool.get(attrs.address);
      const intervalVolume =
        previousVolume === undefined ? 0 : Math.max(0, volume24hUsd - previousVolume);

      volumeRows.push({
        token_address: baseTokenAddress,
        token_symbol: baseSymbol,
        category,
        volume_usd: intervalVolume,
        day_of_week: now.getUTCDay(),
        hour_of_day: now.getUTCHours(),
        snapshot_date: now.toISOString().split("T")[0],
      });
    }

    const [poolsResult, tokensResult] = await Promise.all([
      poolRows.length
        ? supabase.from("pools").upsert(poolRows, { onConflict: "pool_address" })
        : Promise.resolve({ error: null }),
      tokenRows.length
        ? supabase.from("tokens").upsert(tokenRows, { onConflict: "token_address" })
        : Promise.resolve({ error: null }),
    ]);

    const [historyResult, volumeResult] = await Promise.all([
      historyRows.length
        ? supabase.from("pool_history").insert(historyRows)
        : Promise.resolve({ error: null }),
      volumeRows.length
        ? supabase.from("volume_snapshots").insert(volumeRows)
        : Promise.resolve({ error: null }),
    ]);

    if (poolsResult.error) console.error("pools upsert error:", poolsResult.error);
    if (tokensResult.error) console.error("tokens upsert error:", tokensResult.error);
    if (historyResult.error) console.error("pool_history insert error:", historyResult.error);
    if (volumeResult.error) console.error("volume_snapshots insert error:", volumeResult.error);

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      poolsProcessed: pools.length,
      poolsUpserted: poolsResult.error ? 0 : poolRows.length,
      tokensUpserted: tokensResult.error ? 0 : tokenRows.length,
      volumeSnapshotsInserted: volumeResult.error ? 0 : volumeRows.length,
    });
  } catch (err) {
    console.error("Cron snapshot failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
