const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export interface LaunchWindow {
  dayOfWeek: number;
  hourOfDay: number;
  totalVolumeUsd: number;
  deploymentCount: number;
  launchScore: number;
}

// "Best Launch Window" — surfaces hours with high trading demand but
// comparatively few new token deployments, i.e. where a new launch isn't
// competing with a flood of same-hour competitors for attention/liquidity.
// launch_score = total_volume_usd / (deployment_count + 1), computed in
// Postgres (see heatmap_launch_score RPC) from on-chain launchpad_deployments
// (flap.sh, Pons, bow.fun — verified directly via Blockscout getLogs, not
// GeckoTerminal's top-200 pools, so this isn't subject to survivorship bias).
export function LaunchWindowCards({ windows }: { windows: LaunchWindow[] }) {
  const top3 = windows
    .filter((w) => w.totalVolumeUsd > 0)
    .sort((a, b) => b.launchScore - a.launchScore)
    .slice(0, 3);

  if (top3.length === 0) {
    return (
      <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-6 text-center text-gray-500">
        <p className="text-sm font-medium text-gray-300 mb-1">no launch window data yet.</p>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          syncs from on-chain flap.sh, pons, and bow.fun deployments — check back once a
          full day of data has come in.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">best launch window</h2>
        <span className="text-[10px] text-gray-500 mono uppercase tracking-wide">
          demand ÷ competition
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {top3.map((w, i) => (
          <div
            key={`${w.dayOfWeek}-${w.hourOfDay}`}
            className="bg-[#131315] border border-emerald-900/40 rounded-xl p-4 relative overflow-hidden"
          >
            {i === 0 && (
              <span className="absolute top-3 right-3 text-[10px] font-semibold text-emerald-400 mono uppercase tracking-wide">
                #1
              </span>
            )}
            <p className="text-xs text-gray-500 mb-1">
              {DAYS[w.dayOfWeek]} · {w.hourOfDay}:00–{w.hourOfDay + 1}:00 utc
            </p>
            <p className="text-xl font-bold mono text-emerald-400">{formatUsd(w.totalVolumeUsd)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {w.deploymentCount} launch{w.deploymentCount === 1 ? "" : "es"} competing
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-600 mt-2">
        volume vs. launch competition, last 7 days · thin-data hours can look artificially
        good — check the deployment count before picking a window.
      </p>
    </div>
  );
}
