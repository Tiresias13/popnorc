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
// Safe to call repeatedly (e.g. manually, a few times) — each call picks
// up from the earliest block currently in the table and moves the
// window further back, same idempotent upsert-on-tx_hash as the forward
// cron. Stop calling once a call's `results[x].reachedTarget` is true for
// all launchpads, or once fetched counts are consistently 0.
//
// Not meant to run on a schedule — this is a manual, run-a-few-times op.
// Query param `blocksPerCall` (default 300000, ~8.4 hours of chain time)
// controls how far back each call walks, kept small enough to comfortably
// finish inside Vercel's 60s limit even on dense ranges.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const url = new URL(req.url);
  const blocksPerCall = parseInt(url.searchParams.get("blocksPerCall") || "300000", 10);
  const targetBlocksBack = parseInt(url.searchParams.get("targetBlocksBack") || "5990000", 10); // ~7 days

  try {
    const currentBlock = await fetchCurrentBlockNumber();
    const targetBlock = Math.max(0, currentBlock - targetBlocksBack);

    const results: Record<
      string,
      { fetched: number; inserted: number; fromBlock: number; toBlock: number; reachedTarget: boolean }
    > = {};

    for (const config of LAUNCHPADS) {
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

      await fillMissingTokenMetadata(decoded);

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
// hundreds of concurrent lookups at once (e.g. on a wide backfill range
// with many unique Pons/bow.fun tokens) still isn't great for Blockscout's
// rate limits, so this batches lookups instead of a single unbounded
// Promise.all.
const METADATA_CONCURRENCY = 15;

async function fillMissingTokenMetadata(decoded: DecodedDeployment[]): Promise<void> {
  const needsLookup = decoded.filter((d) => !d.tokenSymbol);
  const uniqueAddresses = Array.from(new Set(needsLookup.map((d) => d.tokenAddress)));

  const infoByAddress = new Map<string, { symbol: string | null; name: string | null }>();

  for (let i = 0; i < uniqueAddresses.length; i += METADATA_CONCURRENCY) {
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
