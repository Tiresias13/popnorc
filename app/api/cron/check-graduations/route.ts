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
// Full history, cheap, fast (getLogs is reliably fast, unlike eth_call —
// see below).
//
// Pons & bow.fun: no global graduation event exists, so each token has
// to be checked individually via eth_call (graduationStatus(token) for
// Pons, migrated() for bow.fun).
//
// IMPORTANT — Blockscout's eth_call endpoint is slow and inconsistent in
// practice: direct testing showed single-call latency ranging from ~1s
// to ~9s, even at low concurrency (not just under heavy load, and not
// predictable enough to size a fixed per-run token limit around). Two
// earlier versions of this cron (CHECK_LIMIT 200 then 150, concurrency
// 20 then unthrottled) both blew through Vercel's 60s function timeout
// in production. This version uses a TIME BUDGET instead of guessing a
// fixed token count: it tracks elapsed wall-clock time and stops
// starting new batches once it's within a safety margin of maxDuration,
// leaving whatever wasn't reached for the next run (graduation_checked_at
// ordering means the queue naturally picks up where it left off).
// Low concurrency per batch (RPC_CONCURRENCY) so a handful of slow calls
// can't stall everything at once, and Pons/bow.fun run sequentially, not
// in parallel, so they don't compete for the same slow endpoint at once.
// Each individual eth_call also has its own hard timeout (see
// blockscout-rpc.ts) — tokens that time out are left unchecked (not
// marked graduated=false, graduation_checked_at not advanced) so they're
// retried on a future run instead of silently skipped.
//
// Recommended schedule: every 10 minutes, same as the deployment cron.
const RPC_CONCURRENCY = 5;
const TIME_BUDGET_MS = 45_000; // stop starting new work past this, leaving margin under the 60s hard limit

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const runStart = Date.now();

  try {
    const flap = await checkFlapGraduations(supabase);

    // Split the remaining time budget evenly between Pons and bow.fun so
    // Pons's much larger backlog (~8,500+ tokens) can't starve bow.fun of
    // every run's time slice. Each gets a deadline computed relative to
    // when IT starts, not a shared fixed point from before Pons ran —
    // otherwise bow.fun's deadline would already be in the past the
    // moment it starts, since Pons would have consumed its full slice
    // first.
    const afterFlapBudget = TIME_BUDGET_MS - (Date.now() - runStart);
    const halfBudget = Math.max(0, afterFlapBudget / 2);

    const ponsStart = Date.now();
    const pons = await checkPerTokenGraduations(supabase, "pons", checkPonsGraduatedWrapper, ponsStart + halfBudget);

    const bowStart = Date.now();
    const bow = await checkPerTokenGraduations(supabase, "bow", checkBowGraduated, bowStart + halfBudget);

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results: { flap, pons, bow },
    });
  } catch (err) {
    console.error("Check-graduations cron failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function checkPonsGraduatedWrapper(tokenAddress: string): Promise<boolean | null> {
  const ponsConfig = LAUNCHPADS.find((l) => l.id === "pons")!;
  return checkPonsGraduated(ponsConfig.contractAddress, tokenAddress);
}

// flap.sh: scan LaunchedToDEX over the same window covered by the
// deployment cron's sync cursor, and flip `graduated` for any token
// addresses found. Single batched update via `.in("token_address", [...])`
// rather than one call per graduated token. getLogs is fast and reliable
// (unlike eth_call), so this doesn't need time-budget throttling.
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

  if (graduations.length === 0) return { checked: 0, graduated: 0 };

  const byAddress = new Map<string, Date>();
  for (const g of graduations) byAddress.set(g.tokenAddress, g.graduatedAt);

  const tokenAddresses = Array.from(byAddress.keys());

  const { data: updated, error } = await supabase
    .from("launchpad_deployments")
    .update({ graduated: true, graduated_at: new Date().toISOString() })
    .eq("launchpad", "flap")
    .eq("graduated", false)
    .in("token_address", tokenAddresses)
    .select("id");

  if (error) {
    console.error("flap graduation update error:", error);
    return { checked: graduations.length, graduated: 0 };
  }

  return { checked: graduations.length, graduated: updated?.length ?? 0 };
}

// Pons/bow.fun: per-token eth_call, processed in small concurrent batches
// until either the queue is exhausted or the shared time budget runs out
// (whichever first). Tokens that time out (checkFn returns null) are
// left unchecked — not marked graduated=false, not stamped with
// graduation_checked_at — so they're retried on a future run.
async function checkPerTokenGraduations(
  supabase: ReturnType<typeof createServerClient>,
  launchpad: "pons" | "bow",
  checkFn: (tokenAddress: string) => Promise<boolean | null>,
  deadline: number
): Promise<{ checked: number; graduated: number; timedOut: number }> {
  if (Date.now() >= deadline) return { checked: 0, graduated: 0, timedOut: 0 };

  // Fetch a generous candidate pool up front (cheap single query) and
  // only process as many batches as the time budget allows.
  const { data: rows } = await supabase
    .from("launchpad_deployments")
    .select("id, token_address")
    .eq("launchpad", launchpad)
    .eq("graduated", false)
    .order("graduation_checked_at", { ascending: true, nullsFirst: true })
    .limit(300);

  if (!rows || rows.length === 0) return { checked: 0, graduated: 0, timedOut: 0 };

  const checkedAt = new Date().toISOString();
  const graduatedIds: string[] = [];
  const pendingIds: string[] = [];
  let timedOut = 0;
  let processed = 0;

  for (let i = 0; i < rows.length; i += RPC_CONCURRENCY) {
    if (Date.now() >= deadline) break;

    const batch = rows.slice(i, i + RPC_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (row) => ({
        id: row.id as string,
        result: await checkFn(row.token_address as string),
      }))
    );

    for (const outcome of outcomes) {
      processed++;
      if (outcome.result === null) {
        timedOut++;
      } else if (outcome.result === true) {
        graduatedIds.push(outcome.id);
      } else {
        pendingIds.push(outcome.id);
      }
    }
  }

  if (graduatedIds.length > 0) {
    await supabase
      .from("launchpad_deployments")
      .update({ graduated: true, graduated_at: checkedAt, graduation_checked_at: checkedAt })
      .in("id", graduatedIds);
  }

  if (pendingIds.length > 0) {
    await supabase
      .from("launchpad_deployments")
      .update({ graduation_checked_at: checkedAt })
      .in("id", pendingIds);
  }

  return { checked: processed, graduated: graduatedIds.length, timedOut };
}
