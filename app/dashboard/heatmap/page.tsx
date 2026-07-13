import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { HeatmapGrid } from "@/components/dashboard/heatmap-grid";

export const dynamic = "force-dynamic";

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default async function HeatmapPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: snapshots } = await supabase
    .from("volume_snapshots")
    .select("day_of_week, hour_of_day, volume_usd, category")
    .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0]);

  const grid: Record<string, number> = {};
  let rwaVolume = 0;
  let memeVolume = 0;
  let otherVolume = 0;

  for (const row of snapshots || []) {
    const key = `${row.day_of_week}-${row.hour_of_day}`;
    const vol = Number(row.volume_usd || 0);
    grid[key] = (grid[key] || 0) + vol;

    if (row.category === "rwa") rwaVolume += vol;
    else if (row.category === "other") otherVolume += vol;
    else memeVolume += vol;
  }

  const maxVolume = Math.max(0, ...Object.values(grid));

  let peakKey = "";
  let peakVolume = 0;
  for (const [key, volume] of Object.entries(grid)) {
    if (volume > peakVolume) {
      peakVolume = volume;
      peakKey = key;
    }
  }
  const peakHour = peakKey ? parseInt(peakKey.split("-")[1], 10) : null;
  const hasData = Object.keys(grid).length > 0;

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">Volume Heatmap</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Busiest trading hours across tracked pools — last 7 days (UTC)
            </p>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-6">
            {hasData ? (
              <HeatmapGrid grid={grid} maxVolume={maxVolume} />
            ) : (
              <div className="text-center text-gray-400 py-16">
                <p className="text-sm font-medium text-gray-500 mb-1">No volume data yet.</p>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  This heatmap fills in as the snapshot sync runs over the next few hours and
                  interval volume data accumulates.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 md:px-8 pb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Peak Hour (UTC)</p>
            <p className="text-xl font-bold mono text-[#B45309]">
              {peakHour !== null ? `${peakHour}:00–${peakHour + 1}:00` : "—"}
            </p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">RWA Volume (7d)</p>
            <p className="text-xl font-bold mono">{formatUsd(rwaVolume)}</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Meme Volume (7d)</p>
            <p className="text-xl font-bold mono">{formatUsd(memeVolume)}</p>
          </div>
        </div>

        <p className="px-4 md:px-8 pb-8 text-xs text-gray-400 font-sans max-w-2xl leading-relaxed">
          Volume is measured as the change in each pool's rolling 24h volume between snapshots
          (roughly every 15 minutes), not a raw sum — this avoids double-counting the same trades
          across multiple snapshots. Click any cell for the exact figure.
        </p>
      </main>
      <DashboardFooter lastSyncedAt={null} />
    </>
  );
}

