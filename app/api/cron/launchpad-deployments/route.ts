import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchLaunchpadLogs } from "@/lib/api/blockscout-logs";
import { fetchTokenInfo } from "@/lib/api/blockscout";
import { LAUNCHPADS, decodeDeploymentLog, DecodedDeployment } from "@/lib/launchpad-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Populates launchpad_deployments from real on-chain data (Blockscout
// getLogs) for flap.sh, Pons, and bow.fun — direct, unbiased deployment
// history, not the survivorship-biased "currently top-200 trending pools"
// view that `pools` gives us. See memory/2026-07-20.md for the on-chain
// verification behind this (contract addresses, event ABIs, cross-checked
// against Pons's own public Dune dashboard: our count vs theirs was within
// ~2% for a rolling 24h window, the gap fully explained by window
// boundaries not lining up).
//
// Cursor-based polling: each launchpad's last processed block is stored in
// launchpad_sync_state, so a run picks up from where the previous one left
// off instead of re-scanning or risking gaps if a run fails/is delayed.
//
// Recommended schedule: every 10 minutes. At ~470 tokens/hour on the
// busiest launchpad (Pons) that is ~78 tokens per run, far under the
// 1000-row-per-call truncation cap, and chunkBlocks (20,000, ~2000
// seconds of chain time) comfortably covers a 10-minute gap even if a
// run is briefly delayed.
//
// Protected by CRON_SECRET, same pattern as the other crons.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  try {
    const currentBlock = await fetchCurrentBlockNumber();

    const { data: syncStates } = await supabase.from("launchpad_sync_state").select("*");
    const syncStateMap = new Map((syncStates || []).map((s) => [s.launchpad, s.last_block as number]));

    const results: Record<string, { fetched: number; inserted: number; toBlock: number }> = {};

    for (const config of LAUNCHPADS) {
      // First run for a launchpad: start 20,000 blocks back instead of
      // scanning the whole chain from block 0.
      const fromBlock = (syncStateMap.get(config.id) ?? currentBlock - 20000) + 1;
      const toBlock = Math.min(fromBlock + config.chunkBlocks - 1, currentBlock);

      if (fromBlock > toBlock) {
        results[config.id] = { fetched: 0, inserted: 0, toBlock: fromBlock - 1 };
        continue;
      }

      const logs = await fetchLaunchpadLogs(config.contractAddress, config.topic0, fromBlock, toBlock);
      const decoded = logs.map((log) => decodeDeploymentLog(config.id, log));

      // flap.sh includes name/symbol directly; Pons and bow.fun don't, so
      // look those up via a follow-up ERC-20 metadata call per unique
      // token address (deduped, since deployers can appear across
      // multiple logs but each token is deployed exactly once here).
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
        // Idempotent: tx_hash is unique, so re-processing overlapping
        // ranges (e.g. after a failed run) just no-ops on duplicates
        // instead of erroring or double-counting.
        const { error } = await supabase
          .from("launchpad_deployments")
          .upsert(rows, { onConflict: "tx_hash", ignoreDuplicates: true });
        if (error) {
          console.error(`${config.id} insert error:`, error);
        } else {
          inserted = rows.length;
        }
      }

      await supabase
        .from("launchpad_sync_state")
        .upsert({ launchpad: config.id, last_block: toBlock, updated_at: new Date().toISOString() }, { onConflict: "launchpad" });

      results[config.id] = { fetched: logs.length, inserted, toBlock };
    }

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results });
  } catch (err) {
    console.error("Launchpad deployments cron failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function fetchCurrentBlockNumber(): Promise<number> {
  const base = process.env.BLOCKSCOUT_LEGACY_API_BASE || "https://robinhoodchain.blockscout.com/api";
  const res = await fetch(`${base}?module=block&action=eth_block_number`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  const json = await res.json();
  return parseInt(json.result, 16);
}

// Mutates `decoded` in place, filling tokenName/tokenSymbol for entries
// missing them (Pons, bow.fun) via Blockscout's ERC-20 token-info endpoint.
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
