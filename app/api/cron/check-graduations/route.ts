import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchLaunchpadLogs } from "@/lib/api/blockscout-logs";
import { checkPonsGraduated, checkBowGraduated } from "@/lib/api/blockscout-rpc";
import { LAUNCHPADS, FLAP_GRADUATION_TOPIC0, decodeFlapGraduationLog } from "@/lib/launchpad-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Populates launchpad_deployments.graduated from real on-chain state.
//
// flap.sh: event-based, same pattern as the deployment cron — scans the
// factory's LaunchedToDEX event over the same block range the deployment
// cron just advanced past, and flips `graduated` for any matching token.
// Full history, cheap.
//
// Pons & bow.fun: no global graduation event exists (see
// memory/2026-07-20.md for the on-chain research behind this), so each
// token has to be checked individually via eth_call
// (graduationStatus(token) for Pons, migrated() for bow.fun). This is
// throttled to CHECK_LIMIT tokens per launchpad per run, oldest-checked
// first (graduation_checked_at nulls first), so:
//   - the backlog of ~8,500+ existing Pons tokens gets worked down over
//     many runs instead of hammering the RPC endpoint in one go
//   - newly deployed tokens enter the queue and get their first check
//     within a few runs
//   - tokens that already graduated are skipped forever (never
//     re-checked, since `graduated` only flips one way)
//
// Recommended schedule: every 10 minutes, same as the deployment cron.
const CHECK_LIMIT = 200;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const results: Record<string, { checked: number; graduated: number }> = {};

  try {
    results.flap = await checkFlapGraduations(supabase);
    results.pons = await checkPerTokenGraduations(supabase, "pons", checkPonsGraduatedWrapper);
    results.bow = await checkPerTokenGraduations(supabase, "bow", checkBowGraduatedWrapper);

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results });
  } catch (err) {
    console.error("Check-graduations cron failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function checkPonsGraduatedWrapper(tokenAddress: string): Promise<boolean> {
  const ponsConfig = LAUNCHPADS.find((l) => l.id === "pons")!;
  return checkPonsGraduated(ponsConfig.contractAddress, tokenAddress);
}

async function checkBowGraduatedWrapper(tokenAddress: string): Promise<boolean> {
  return checkBowGraduated(tokenAddress);
}

// flap.sh: scan LaunchedToDEX over the same window covered by the
// deployment cron's sync cursor, and flip `graduated` for any token
// addresses found.
async function checkFlapGraduations(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ checked: number; graduated: number }> {
  const flapConfig = LAUNCHPADS.find((l) => l.id === "flap")!;

  const { data: syncState } = await supabase
    .from("launchpad_sync_state")
    .select("last_block")
    .eq("launchpad", "flap")
    .single();

  if (!syncState) return { checked: 0, graduated: 0 };

  const toBlock = syncState.last_block as number;
  const fromBlock = Math.max(0, toBlock - flapConfig.chunkBlocks + 1);

  const logs = await fetchLaunchpadLogs(flapConfig.contractAddress, FLAP_GRADUATION_TOPIC0, fromBlock, toBlock);
  const graduations = logs.map(decodeFlapGraduationLog);

  let graduated = 0;
  for (const g of graduations) {
    const { error, count } = await supabase
      .from("launchpad_deployments")
      .update({ graduated: true, graduated_at: g.graduatedAt.toISOString() }, { count: "exact" })
      .eq("launchpad", "flap")
      .eq("token_address", g.tokenAddress)
      .eq("graduated", false);

    if (!error && count) graduated += count;
  }

  return { checked: graduations.length, graduated };
}

// Pons/bow.fun: per-token eth_call, throttled to CHECK_LIMIT rows per
// run, oldest-checked-first so the backlog shrinks over time.
async function checkPerTokenGraduations(
  supabase: ReturnType<typeof createServerClient>,
  launchpad: "pons" | "bow",
  checkFn: (tokenAddress: string) => Promise<boolean>
): Promise<{ checked: number; graduated: number }> {
  const { data: rows } = await supabase
    .from("launchpad_deployments")
    .select("id, token_address")
    .eq("launchpad", launchpad)
    .eq("graduated", false)
    .order("graduation_checked_at", { ascending: true, nullsFirst: true })
    .limit(CHECK_LIMIT);

  if (!rows || rows.length === 0) return { checked: 0, graduated: 0 };

  let graduated = 0;
  const checkedAt = new Date().toISOString();

  // Concurrency-limited: fire in small batches rather than all at once,
  // to avoid hammering the Blockscout RPC endpoint.
  const BATCH_SIZE = 10;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const outcomes = await Promise.all(
      batch.map(async (row) => ({
        id: row.id as string,
        isGraduated: await checkFn(row.token_address as string),
      }))
    );

    for (const outcome of outcomes) {
      if (outcome.isGraduated) {
        await supabase
          .from("launchpad_deployments")
          .update({ graduated: true, graduated_at: checkedAt, graduation_checked_at: checkedAt })
          .eq("id", outcome.id);
        graduated++;
      } else {
        await supabase
          .from("launchpad_deployments")
          .update({ graduation_checked_at: checkedAt })
          .eq("id", outcome.id);
      }
    }
  }

  return { checked: rows.length, graduated };
}
