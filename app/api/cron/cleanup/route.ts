import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Both volume_snapshots and pool_history grow forever (~160 new rows every
// ~15 min from the snapshot cron = ~15k rows/day/table). Neither table
// needs data older than what the dashboard actually displays:
//   - the heatmap only ever looks at the last 7 days
//   - the pool detail sparkline only ever looks at the last 168 hourly rows
// so anything older than 14 days (a safety margin past both) is pure
// storage bloat with no feature depending on it. This runs on its own,
// slower cron schedule (e.g. once a day) and deletes it.
//
// Protected by the same shared secret as the snapshot cron:
//   Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffIso = cutoff.toISOString();
  const cutoffDate = cutoffIso.split("T")[0];

  try {
    const [volumeResult, historyResult] = await Promise.all([
      supabase
        .from("volume_snapshots")
        .delete({ count: "exact" })
        .lt("snapshot_date", cutoffDate),
      supabase
        .from("pool_history")
        .delete({ count: "exact" })
        .lt("recorded_at", cutoffIso),
    ]);

    if (volumeResult.error) console.error("volume_snapshots cleanup error:", volumeResult.error);
    if (historyResult.error) console.error("pool_history cleanup error:", historyResult.error);

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      cutoffDate,
      volumeSnapshotsDeleted: volumeResult.error ? "error" : (volumeResult.count ?? "unknown"),
      poolHistoryDeleted: historyResult.error ? "error" : (historyResult.count ?? "unknown"),
    });
  } catch (err) {
    console.error("Cron cleanup failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
