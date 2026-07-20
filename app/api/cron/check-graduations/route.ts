import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchLaunchpadLogs } from "@/lib/api/blockscout-logs";
import { checkPonsGraduated } from "@/lib/api/blockscout-rpc";
import { fetchAllBowGraduationStatus } from "@/lib/api/bowfun";
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
// Pons: no global graduation event exists (confirmed against Pons's own
// docs — "There is no migration event. Poll graduationStatus(token) for
// graduation." — this is the protocol's own recommended approach, not a
// workaround), so each token has to be checked individually via eth_call.
//
// bow.fun: unlike Pons, bow.fun exposes a bulk public API
// (bow.fun/api/tokens, paginated) that includes `graduated` directly per
// token — confirmed via direct testing to be fast and tolerate high
// concurrency (unlike Blockscout's eth-rpc endpoint). This entirely
// replaces the old per-token eth_call approach for bow.fun, and covers
// its full token list in a few seconds instead of being limited by a time
// budget.
//
// IMPORTANT — Blockscout's eth_call endpoint (still used for Pons) is
// slow and inconsistent in practice: direct testing showed single-call
// latency ranging from ~1s to ~9s, even at low concurrency. Earlier
// versions of this cron that used eth_call for both Pons and bow.fun with
// a fixed per-run token-count limit blew through Vercel's 60s function
// timeout in production. Pons still uses a TIME BUDGET instead of
// guessing a fixed token count: track elapsed wall-clock time, stop
// starting new batches once within a safety margin of maxDuration, leave
// whatever wasn't reached for the next run. Tokens that time out are left
// unchecked (not marked graduated=false, graduation_checked_at not
// advanced) so they're retried on a future run instead of silently
// skipped.
//
// Recommended schedule: every 10 minutes, same as the deployment cron.
const RPC_CONCURRENCY = 5;
const TIME_BUDGET_MS = 45_000; // stop starting new Pons work past this, leaving margin under the 60s hard limit

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

    // bow.fun's bulk API sync is fast (seconds, not budget-limited in
    // practice), so it gets its own generous slice of the remaining
    // budget but rarely needs all of it. Whatever's left after both
    // flap.sh and bow.fun goes to Pons, which is the one actually
    // constrained by per-token eth_call throughput.
    const bowDeadline = runStart + TIME_BUDGET_MS * 0.4;
    const bow = await syncBowGraduations(supabase, bowDeadline);

    const ponsDeadline = runStart + TIME_BUDGET_MS;
    const pons = await checkPerTokenGraduations(supabase, "pons", checkPonsGraduatedWrapper, ponsDeadline);

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

// bow.fun: pages through the bulk API, then batch-updates
// launchpad_deployments for any token whose graduated status is now true
// (mirrors the flap.sh event-scan pattern — a handful of batched
// `.in("token_address", [...])` calls, not one per token).
async function syncBowGraduations(
  supabase: ReturnType<typeof createServerClient>,
  deadline: number
): Promise<{ checked: number; graduated: number }> {
  const statusByToken = await fetchAllBowGraduationStatus(deadline);

  if (statusByToken.size === 0) return { checked: 0, graduated: 0 };

  const graduatedAddresses = Array.from(statusByToken.entries())
    .filter(([, graduated]) => graduated)
    .map(([addr]) => addr);

  if (graduatedAddresses.length === 0) return { checked: statusByToken.size, graduated: 0 };

  const { data: updated, error } = await supabase
    .from("launchpad_deployments")
    .update({ graduated: true, graduated_at: new Date().toISOString(), graduation_checked_at: new Date().toISOString() })
    .eq("launchpad", "bow")
    .eq("graduated", false)
    .in("token_address", graduatedAddresses)
    .select("id");

  if (error) {
    console.error("bow graduation update error:", error);
    return { checked: statusByToken.size, graduated: 0 };
  }

  return { checked: statusByToken.size, graduated: updated?.length ?? 0 };
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
