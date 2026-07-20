import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchLaunchpadLogs } from "@/lib/api/blockscout-logs";
import { fetchTokenInfo } from "@/lib/api/blockscout";
import { LAUNCHPADS, decodeDeploymentLog, DecodedDeployment } from "@/lib/launchpad-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-off backfill for launchpad_deployments. The regular cron
// (launchpad-deployments/route.ts) only started scanning 20,000 blocks
// back from whenever it first ran, which is ~33 minutes of chain time at
// Robinhood Chain's ~0.1s block time — nowhere near the 7-day window the
// heatmap UI aggregates over. This endpoint walks BACKWARD in chunks from
// whatever the earliest block already stored is, filling in history
// older than that, down to a target block (default: ~7 days back).
//
// Safe to call repeatedly (manually, many times in a row) — each call
// picks up from the earliest block currently in the table and moves the
// window further back, same idempotent upsert-on-tx_hash as the forward
// cron. Stop calling once a call's `results[x].reachedTarget` is true for
// all launchpads.
//
// IMPORTANT — sizing history: an earlier version defaulted blocksPerCall
// to 300,000, sized around flap.sh/bow.fun's log density. Pons is much
// denser AND every Pons log needs a separate fetchTokenInfo lookup (no
// name/symbol in the event itself, unlike flap.sh) — a 300k-block Pons
// range can contain 2,000+ unique tokens needing metadata lookups, which
// blew through Vercel's 60s limit even with batched concurrency. This
// version uses TWO safeguards instead of trusting a fixed block count to
// stay cheap:
//   1. blocksPerCall default is much smaller (20,000, matching the
//      regular cron's chunk size, which is proven to run comfortably
//      within the timeout).
//   2. Metadata lookups are additionally capped by their own time
//      budget (METADATA_TIME_BUDGET_MS) — if a range still has an
//      unusually dense token count, remaining tokens are inserted with
//      null name/symbol rather than blocking the whole request. (name/
//      symbol are cosmetic — graduation tracking and the heatmap don't
//      depend on them.)
//
// Not meant to run on a schedule — this is a manual, run-many-times op.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const url = new URL(req.url);
  const blocksPerCall = parseInt(url.searchParams.get("blocksPerCall") || "20000", 10);
  const targetBlocksBack = parseInt(url.searchParams.get("targetBlocksBack") || "5990000", 10); // ~7 days
  const runDeadline = Date.now() + 45_000;

  try {
    const currentBlock = await fetchCurrentBlockNumber();
    const targetBlock = Math.max(0, currentBlock - targetBlocksBack);

    const results: Record<
      string,
      { fetched: number; inserted: number; fromBlock: number; toBlock: number; reachedTarget: boolean }
    > = {};

    for (const config of LAUNCHPADS) {
      if (Date.now() >= runDeadline) {
        results[config.id] = { fetched: 0, inserted: 0, fromBlock: 0, toBlock: 0, reachedTarget: false };
        continue;
      }

      const { data: earliestRow } = await supabase
        .from("launchpad_deployments")
        .select("block_number")
        .eq("launchpad", config.id)
        .order("block_number", { ascending: true })
        .limit(1)
        .single();

      const earliestKnown = earliestRow ? (earliestRow.block_number as number) : currentBlock;

      if (earliestKnown <= targetBlock) {
        results[config.id] = { fetched: 0, inserted: 0, fromBlock: earliestKnown, toBlock: earliestKnown, reachedTarget: true };
        continue;
      }

      const toBlock = earliestKnown - 1;
      const fromBlock = Math.max(targetBlock, toBlock - blocksPerCall + 1);

      if (fromBlock > toBlock) {
        results[config.id] = { fetched: 0, inserted: 0, fromBlock, toBlock, reachedTarget: true };
        continue;
      }

      const logs = await fetchLaunchpadLogs(config.contractAddress, config.topic0, fromBlock, toBlock);
      const decoded = logs.map((log) => decodeDeploymentLog(config.id, log));

      await fillMissingTokenMetadata(decoded, runDeadline);

      const rows = decoded.map((d) => {
        const dayOfWeek = d.deployedAt.getUTCDay();
        const hourOfDay = d.deployedAt.getUTCHours();
        return {
          launchpad: d.launchpad,
          token_address: d.tokenAddress,
          token_symbol: d.tokenSymbol,
          token_name: d.tokenName,
          deployer_address: d.deployerAddress,
          day_of_week: dayOfWeek,
          hour_of_day: hourOfDay,
          deployed_at: d.deployedAt.toISOString(),
          block_number: d.blockNumber,
          tx_hash: d.txHash,
        };
      });

      let inserted = 0;
      if (rows.length) {
        const { error } = await supabase
          .from("launchpad_deployments")
          .upsert(rows, { onConflict: "tx_hash", ignoreDuplicates: true });
        if (error) {
          console.error(`${config.id} backfill insert error:`, error);
        } else {
          inserted = rows.length;
        }
      }

      results[config.id] = { fetched: logs.length, inserted, fromBlock, toBlock, reachedTarget: fromBlock <= targetBlock };
    }

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), targetBlock, results });
  } catch (err) {
    console.error("Launchpad deployments backfill failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function fetchCurrentBlockNumber(): Promise<number> {
  const base = process.env.BLOCKSCOUT_LEGACY_API_BASE || "https://robinhoodchain.blockscout.com/api";

  // Retries with backoff on 429 (Blockscout rate limits fairly
  // aggressively) instead of silently propagating NaN downstream, which
  // previously corrupted every subsequent block-range calculation with
  // no error thrown until the getLogs call failed with a confusing
  // "[NaN-14294582]" range.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${base}?module=block&action=eth_block_number`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    const json = await res.json();
    const block = parseInt(json.result, 16);
    if (!Number.isNaN(block)) return block;

    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }

  throw new Error("Failed to fetch current block number after retries");
}

// fetchTokenInfo never throws (see lib/api/blockscout.ts), but firing off
// hundreds of concurrent lookups at once (e.g. on a dense Pons range,
// which unlike flap.sh needs a metadata lookup for every single token)
// still isn't great for Blockscout's rate limits, so this batches lookups
// instead of a single unbounded Promise.all — AND respects the shared
// run deadline, leaving any remaining tokens with null name/symbol rather
// than risking the whole request timing out. Those tokens still get
// inserted (graduation tracking doesn't need name/symbol), just without
// cosmetic metadata; a later backfill call re-decoding the same block
// range would just no-op on tx_hash conflict anyway, so this isn't
// "fixed forever as null" in practice, though a targeted metadata-only
// re-pass isn't implemented here.
const METADATA_CONCURRENCY = 15;

async function fillMissingTokenMetadata(decoded: DecodedDeployment[], deadline: number): Promise<void> {
  const needsLookup = decoded.filter((d) => !d.tokenSymbol);
  const uniqueAddresses = Array.from(new Set(needsLookup.map((d) => d.tokenAddress)));

  const infoByAddress = new Map<string, { symbol: string | null; name: string | null }>();

  for (let i = 0; i < uniqueAddresses.length; i += METADATA_CONCURRENCY) {
    if (Date.now() >= deadline) break;

    const batch = uniqueAddresses.slice(i, i + METADATA_CONCURRENCY);
    await Promise.all(
      batch.map(async (addr) => {
        const info = await fetchTokenInfo(addr);
        infoByAddress.set(addr, { symbol: info?.symbol ?? null, name: info?.name ?? null });
      })
    );
  }

  for (const d of needsLookup) {
    const info = infoByAddress.get(d.tokenAddress);
    if (info) {
      d.tokenSymbol = info.symbol;
      d.tokenName = info.name;
    }
  }
}
