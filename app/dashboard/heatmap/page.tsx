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

  const [{ data: snapshots }, { data: activity }] = await Promise.all([
    supabase
      .from("volume_snapshots")
      .select("day_of_week, hour_of_day, volume_usd, category, token_symbol")
      .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0]),
    supabase
      .from("wallet_activity")
      .select("wallet_address, action, token_symbol, amount_usd, occurred_at")
      .gte("occurred_at", sevenDaysAgo.toISOString()),
  ]);

  const grid: Record<string, number> = {};
  const tokenBreakdown: Record<string, Record<string, number>> = {};
  let rwaVolume = 0;
  let memeVolume = 0;
  let otherVolume = 0;

  for (const row of snapshots || []) {
    const key = `${row.day_of_week}-${row.hour_of_day}`;
    const vol = Number(row.volume_usd || 0);
    grid[key] = (grid[key] || 0) + vol;

    if (row.token_symbol && vol > 0) {
      if (!tokenBreakdown[key]) tokenBreakdown[key] = {};
      tokenBreakdown[key][row.token_symbol] = (tokenBreakdown[key][row.token_symbol] || 0) + vol;
    }

    if (row.category === "rwa") rwaVolume += vol;
    else if (row.category === "other") otherVolume += vol;
    else memeVolume += vol;
  }

  // Reduce each cell's token breakdown to its top 2 symbols, for the
  // "dominated by X & Y" insight line on click.
  const topTokensByCell: Record<string, string[]> = {};
  for (const [key, symbols] of Object.entries(tokenBreakdown)) {
    topTokensByCell[key] = Object.entries(symbols)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([symbol]) => symbol);
  }

  // Find the single biggest real transaction per day+hour bucket, from real
  // wallet_activity rows (buy/sell). No fabricated data — if a bucket has no
  // matching activity yet, it's simply omitted and the UI says so.
  const moverByCell: Record<
    string,
    { walletAddress: string; action: string; tokenSymbol: string | null; amountUsd: number }
  > = {};
  for (const row of activity || []) {
    const occurred = new Date(row.occurred_at);
    const key = `${occurred.getUTCDay()}-${occurred.getUTCHours()}`;
    const amount = Number(row.amount_usd || 0);
    const current = moverByCell[key];
    if (!current || amount > current.amountUsd) {
      moverByCell[key] = {
        walletAddress: row.wallet_address,
        action: row.action,
        tokenSymbol: row.token_symbol,
        amountUsd: amount,
      };
    }
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
      <main className="flex-1 overflow-y-auto bg-[#0A0A0B]">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#1F1F22]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white">the heatmap</h1>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 mono uppercase tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                live
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              where the volume's at, hour by hour — so you know when to watch and when to sleep
            </p>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6">
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-6">
            {hasData ? (
              <HeatmapGrid
                grid={grid}
                maxVolume={maxVolume}
                topTokensByCell={topTokensByCell}
                moverByCell={moverByCell}
              />
            ) : (
              <div className="text-center text-gray-500 py-16">
                <p className="text-sm font-medium text-gray-300 mb-1">nothing cooking yet.</p>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  the heatmap fills in as data syncs over the next few hours. check back soon.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 md:px-8 pb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">peak hour (utc)</p>
            <p className="text-xl font-bold mono text-[#F5A623]">
              {peakHour !== null ? `${peakHour}:00–${peakHour + 1}:00` : "—"}
            </p>
          </div>
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">rwa volume (7d)</p>
            <p className="text-xl font-bold mono text-white">{formatUsd(rwaVolume)}</p>
          </div>
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">meme volume (7d)</p>
            <p className="text-xl font-bold mono text-white">{formatUsd(memeVolume)}</p>
          </div>
        </div>
      </main>
      <DashboardFooter lastSyncedAt={null} dark />
    </>
  );
}
