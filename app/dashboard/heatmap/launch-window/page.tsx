import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { LaunchWindowCards, LaunchWindow } from "@/components/dashboard/launch-window-cards";

export const dynamic = "force-dynamic";

interface LaunchScoreRow {
  day_of_week: number;
  hour_of_day: number;
  total_volume_usd: number;
  deployment_count: number;
  launch_score: number;
}

export default async function LaunchWindowPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceDate = sevenDaysAgo.toISOString().split("T")[0];

  // Aggregated in Postgres (see heatmap_launch_score RPC) from real
  // on-chain launchpad_deployments (flap.sh, Pons, bow.fun — verified
  // directly via Blockscout getLogs, not GeckoTerminal's top-200 pools,
  // so this isn't subject to survivorship bias) joined with the existing
  // volume_snapshots table.
  const { data: launchScoreRows } = await supabase.rpc("heatmap_launch_score", {
    since_date: sinceDate,
  });

  const launchWindows: LaunchWindow[] = ((launchScoreRows || []) as LaunchScoreRow[]).map((r) => ({
    dayOfWeek: r.day_of_week,
    hourOfDay: r.hour_of_day,
    totalVolumeUsd: Number(r.total_volume_usd || 0),
    deploymentCount: Number(r.deployment_count || 0),
    launchScore: Number(r.launch_score || 0),
  }));

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-[#0A0A0B]">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#1F1F22]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white">launch window heatmap</h1>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 mono uppercase tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                live
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              hours with real demand but few competing launches — from on-chain flap.sh,
              pons, and bow.fun deployment data
            </p>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6 pb-8">
          <LaunchWindowCards windows={launchWindows} />
        </div>
      </main>
      <DashboardFooter lastSyncedAt={null} dark />
    </>
  );
}
