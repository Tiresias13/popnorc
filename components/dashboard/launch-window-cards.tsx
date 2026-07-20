const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface LaunchWindow {
  dayOfWeek: number;
  hourOfDay: number;
  deploymentCount: number;
  graduatedCount: number;
  graduationRate: number; // 0-1
}

// "Best Launch Window" — surfaces hours with the highest actual
// graduation rate (graduated_count / deployment_count), not a volume/
// competition proxy. This is a real outcome metric: did tokens deployed
// in this hour actually succeed, based on on-chain graduation tracking
// (flap.sh LaunchedToDEX event; Pons graduationStatus() / bow.fun
// migrated() per-token checks — see heatmap_graduation_rate RPC).
//
// Hours with very few deployments are excluded below a minimum sample
// size, since a 1/1 = 100% rate from a single lucky token isn't a
// meaningful signal.
const MIN_SAMPLE_SIZE = 5;

export function LaunchWindowCards({ windows }: { windows: LaunchWindow[] }) {
  const top3 = windows
    .filter((w) => w.deploymentCount >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b.graduationRate - a.graduationRate)
    .slice(0, 3);

  if (top3.length === 0) {
    return (
      <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-6 text-center text-gray-500">
        <p className="text-sm font-medium text-gray-300 mb-1">no launch window data yet.</p>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          syncs from on-chain flap.sh, pons, and bow.fun deployments and graduation
          checks — check back once enough data has come in.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">best launch window</h2>
        <span className="text-[10px] text-gray-500 mono uppercase tracking-wide">
          graduation rate
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
            <p className="text-xl font-bold mono text-emerald-400">
              {(w.graduationRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {w.graduatedCount}/{w.deploymentCount} tokens graduated
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-600 mt-2">
        graduated ÷ deployed, last 7 days · only hours with {MIN_SAMPLE_SIZE}+ deployments
        shown, to avoid small-sample noise
      </p>
    </div>
  );
}
