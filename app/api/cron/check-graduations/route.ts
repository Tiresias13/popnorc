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
// IMPORTANT: DB writes are batched (2 update calls per launchpad — one
// for newly-graduated ids, one for still-pending ids — via `.in("id",
// [...])`) instead of one round-trip per token. An earlier version did a
// sequential update per token (up to ~400 round-trips across both
// launchpads) and blew through Vercel's 60s function timeout in
// production. Pons and bow.fun are also checked concurrently with
// Promise.all rather than one after another.
//
// Recommended schedule: every 10 minutes, same as the deployment cron.
const CHECK_LIMIT = 150;
const RPC_CONCURRENCY = 20;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  try {
    const [flap, pons, bow] = await Promise.all([
      checkFlapGraduations(supabase),
      checkPerTokenGraduations(supabase, "pons", checkPonsGraduatedWrapper),
      checkPerTokenGraduations(supabase, "bow", checkBowGraduated),
    ]);

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

async function checkPonsGraduatedWrapper(tokenAddress: string): Promise<boolean> {
  const ponsConfig = LAUNCHPADS.find((l) => l.id === "pons")!;
  return checkPonsGraduated(ponsConfig.contractAddress, tokenAddress);
}

// flap.sh: scan LaunchedToDEX over the same window covered by the
// deployment cron's sync cursor, and flip `graduated` for any token
// addresses found. Single batched update via `.in("token_address", [...])`
// rather than one call per graduated token.
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

  // Most recent graduatedAt wins if a token somehow appears twice in the
  // window; dedupe by address.
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

// Pons/bow.fun: per-token eth_call, throttled to CHECK_LIMIT rows per
// run, oldest-checked-first so the backlog shrinks over time. Results are
// written back in two batched updates (graduated ids, non-graduated ids)
// instead of one round-trip per row.
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

  const checkedAt = new Date().toISOString();
  const graduatedIds: string[] = [];
  const pendingIds: string[] = [];

  for (let i = 0; i < rows.length; i += RPC_CONCURRENCY) {
    const batch = rows.slice(i, i + RPC_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (row) => ({
        id: row.id as string,
        isGraduated: await checkFn(row.token_address as string),
      }))
    );

    for (const outcome of outcomes) {
      if (outcome.isGraduated) graduatedIds.push(outcome.id);
      else pendingIds.push(outcome.id);
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

  return { checked: rows.length, graduated: graduatedIds.length };
}
