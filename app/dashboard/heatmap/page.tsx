import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { HeatmapGrid } from "@/components/dashboard/heatmap-grid";
import { LaunchWindowCards, LaunchWindow } from "@/components/dashboard/launch-window-cards";

export const dynamic = "force-dynamic";

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

interface HeatmapAggregateRow {
  day_of_week: number;
  hour_of_day: number;
  total_volume_usd: number;
  top_tokens: string[];
}

interface CategoryTotalRow {
  category: string;
  total_volume_usd: number;
}

interface LaunchScoreRow {
  day_of_week: number;
  hour_of_day: number;
  total_volume_usd: number;
  deployment_count: number;
  launch_score: number;
}

export default async function HeatmapPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceDate = sevenDaysAgo.toISOString().split("T")[0];

  // Both aggregations run as SQL (SUM + top-2-token ranking) inside
  // Postgres via RPC, instead of fetching raw volume_snapshots rows and
  // summing them in JS. Raw-row fetching silently truncated at
  // PostgREST's default 1000-row cap once the table grew past a few
  // hours of 15-minute cron snapshots — this made recent hours "go dark"
  // even though the data existed. Aggregating in the DB keeps the
  // response small (at most 168 rows) no matter how large the raw table
  // gets.
  const [{ data: aggregateRows }, { data: categoryRows }, { data: activity }, { data: launchScoreRows }] =
    await Promise.all([
      supabase.rpc("heatmap_aggregate", { since_date: sinceDate }),
      supabase.rpc("heatmap_category_totals", { since_date: sinceDate }),
      supabase
        .from("wallet_activity")
        .select("wallet_address, action, token_symbol, amount_usd, occurred_at")
        .gte("occurred_at", sevenDaysAgo.toISOString()),
      supabase.rpc("heatmap_launch_score", { since_date: sinceDate }),
    ]);

  const launchWindows: LaunchWindow[] = ((launchScoreRows || []) as LaunchScoreRow[]).map((r) => ({
    dayOfWeek: r.day_of_week,
    hourOfDay: r.hour_of_day,
    totalVolumeUsd: Number(r.total_volume_usd || 0),
    deploymentCount: Number(r.deployment_count || 0),
    launchScore: Number(r.launch_score || 0),
  }));

  const grid: Record<string, number> = {};
  const topTokensByCell: Record<string, string[]> = {};

  for (const row of (aggregateRows || []) as HeatmapAggregateRow[]) {
    const key = `${row.day_of_week}-${row.hour_of_day}`;
    grid[key] = Number(row.total_volume_usd || 0);
    if (row.top_tokens && row.top_tokens.length > 0) {
      topTokensByCell[key] = row.top_tokens;
    }
  }

  let rwaVolume = 0;
  let memeVolume = 0;
  for (const row of (categoryRows || []) as CategoryTotalRow[]) {
    if (row.category === "rwa") rwaVolume += Number(row.total_volume_usd || 0);
    else if (row.category !== "other") memeVolume += Number(row.total_volume_usd || 0);
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

        <div className="px-4 md:px-8 pb-6">
          <LaunchWindowCards windows={launchWindows} />
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
