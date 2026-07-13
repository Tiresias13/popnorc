import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function intensityColor(volume: number, max: number): string {
  if (max === 0) return "#F1F1F2";
  const ratio = volume / max;
  if (ratio < 0.05) return "#F1F1F2";
  if (ratio < 0.25) return "#4a2f0d";
  if (ratio < 0.5) return "#8a5a12";
  if (ratio < 0.75) return "#d38a18";
  return "#F5A623";
}

export default async function HeatmapPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: snapshots } = await supabase
    .from("volume_snapshots")
    .select("day_of_week, hour_of_day, volume_usd, category")
    .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0]);

  const grid: Record<string, number> = {};
  let cryptoNativeVolume = 0;
  let stockTokenVolume = 0;

  for (const row of snapshots || []) {
    const key = `${row.day_of_week}-${row.hour_of_day}`;
    grid[key] = (grid[key] || 0) + Number(row.volume_usd || 0);

    if (row.category === "rwa") stockTokenVolume += Number(row.volume_usd || 0);
    else cryptoNativeVolume += Number(row.volume_usd || 0);
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

  function formatUsd(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">Volume Heatmap</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Busiest hours per token — last 7 days (UTC)
            </p>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-6">
            <div className="flex gap-2 mb-2 pl-14">
              <span className="flex-1 flex justify-between text-[10px] text-gray-400 mono">
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i}>{i * 3}h</span>
                ))}
              </span>
            </div>
            <div className="space-y-1.5">
              {DAYS.map((day, dayIndex) => (
                <div key={day} className="flex items-center gap-1.5">
                  <span className="w-10 text-xs text-gray-500 mono">{day}</span>
                  <div className="flex-1 flex gap-1.5">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const volume = grid[`${dayIndex}-${hour}`] || 0;
                      return (
                        <div
                          key={hour}
                          className="flex-1 rounded"
                          style={{
                            height: "22px",
                            background: intensityColor(volume, maxVolume),
                          }}
                          title={`${day} ${hour}:00 UTC — ${formatUsd(volume)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-5 justify-end text-xs text-gray-500">
              <span>Less</span>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#F1F1F2" }} />
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#4a2f0d" }} />
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#8a5a12" }} />
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#d38a18" }} />
              <div style={{ width: 22, height: 22, borderRadius: 4, background: "#F5A623" }} />
              <span>More</span>
            </div>
          </div>
        </div>

        <div className="px-8 pb-8 grid grid-cols-3 gap-4">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Peak Hour (UTC)</p>
            <p className="text-xl font-bold mono text-[#B45309]">
              {peakHour !== null ? `${peakHour}:00–${peakHour + 1}:00` : "—"}
            </p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Crypto-native Volume</p>
            <p className="text-xl font-bold mono">{formatUsd(cryptoNativeVolume)}</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Stock-token Volume</p>
            <p className="text-xl font-bold mono">{formatUsd(stockTokenVolume)}</p>
          </div>
        </div>
      </main>
      <DashboardFooter lastSyncedAt={null} />
    </>
  );
}
