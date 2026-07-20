import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { LaunchWindowCards, LaunchWindow } from "@/components/dashboard/launch-window-cards";
import { LaunchScoreGrid } from "@/components/dashboard/launch-score-grid";

export const dynamic = "force-dynamic";

interface GraduationRateRow {
  day_of_week: number;
  hour_of_day: number;
  deployment_count: number;
  graduated_count: number;
  graduation_rate: number;
}

export default async function LaunchWindowPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceDate = sevenDaysAgo.toISOString().split("T")[0];

  // Aggregated in Postgres (see heatmap_graduation_rate RPC) from real
  // on-chain launchpad_deployments + graduation status (flap.sh via its
  // LaunchedToDEX event, Pons/bow.fun via per-token eth_call — see
  // memory/2026-07-20.md for the verification behind this). This is an
  // actual outcome metric (did tokens launched in this hour succeed),
  // not a volume/competition proxy.
  const { data: graduationRows } = await supabase.rpc("heatmap_graduation_rate", {
    since_date: sinceDate,
  });

  const launchWindows: LaunchWindow[] = ((graduationRows || []) as GraduationRateRow[]).map((r) => ({
    dayOfWeek: r.day_of_week,
    hourOfDay: r.hour_of_day,
    deploymentCount: Number(r.deployment_count || 0),
    graduatedCount: Number(r.graduated_count || 0),
    graduationRate: Number(r.graduation_rate || 0),
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
              hours with the highest actual graduation rate — from on-chain flap.sh, pons,
              and bow.fun deployment + graduation data
            </p>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6">
          <LaunchWindowCards windows={launchWindows} />
        </div>

        <div className="px-4 md:px-8 pb-8">
          {launchWindows.length > 0 ? (
            <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-6">
              <LaunchScoreGrid
                entries={launchWindows.map((w) => ({
                  dayOfWeek: w.dayOfWeek,
                  hourOfDay: w.hourOfDay,
                  deploymentCount: w.deploymentCount,
                  graduatedCount: w.graduatedCount,
                  graduationRate: w.graduationRate,
                }))}
              />
            </div>
          ) : (
            <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-6 text-center text-gray-500 py-16">
              <p className="text-sm font-medium text-gray-300 mb-1">nothing cooking yet.</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                the launch heatmap fills in as on-chain deployment and graduation data
                syncs over the next few hours.
              </p>
            </div>
          )}
        </div>
      </main>
      <DashboardFooter lastSyncedAt={null} dark />
    </>
  );
}
