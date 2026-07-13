import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Badge } from "@/components/dashboard/badge";
import { Pool } from "@/types/database";

export const dynamic = "force-dynamic";

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function riskTone(level: string): "emerald" | "amber" | "red" | "gray" {
  if (level === "low") return "emerald";
  if (level === "medium") return "amber";
  if (level === "high") return "red";
  return "gray";
}

function categoryTone(category: string): "blue" | "purple" | "gray" {
  if (category === "rwa") return "blue";
  if (category === "meme") return "purple";
  return "gray";
}

export default async function LpMonitorPage() {
  const debugUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "UNDEFINED";
  const debugKeyLen = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").length;
  const debugKeyStart = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").slice(0, 20);

  const { data: pools, error, status, statusText } = await supabase
    .from("pools")
    .select("*")
    .order("liquidity_usd", { ascending: false })
    .limit(50);

  const typedPools = (pools || []) as Pool[];

  const totalPools = typedPools.length;
  const highRisk = typedPools.filter((p) => p.risk_level === "high").length;
  const verifiedCount = typedPools.filter((p) => p.category === "rwa").length;
  const avgLiquidity =
    totalPools > 0
      ? typedPools.reduce((sum, p) => sum + (p.liquidity_usd || 0), 0) / totalPools
      : 0;
  const lastSynced = typedPools[0]?.last_synced_at ?? null;

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">LP Quality Monitor</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Tracking {totalPools} active pools on Robinhood Chain
            </p>
          </div>
        </div>

        <div className="mx-8 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs font-mono whitespace-pre-wrap">
          DEBUG: url={debugUrl} | keyLen={debugKeyLen} | keyStart={debugKeyStart} | status={status} {statusText} | dataLen={pools ? pools.length : "null"} | error={error ? JSON.stringify(error) : "none"}
        </div>

        <div className="grid grid-cols-4 gap-4 px-8 py-6">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Pools Tracked</p>
            <p className="text-2xl font-bold mono">{totalPools}</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">High Risk</p>
            <p className="text-2xl font-bold mono text-red-600">{highRisk}</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">RWA Tokens</p>
            <p className="text-2xl font-bold mono text-emerald-600">{verifiedCount}</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-4 shadow-[0_4px_24px_rgba(245,166,35,0.15)]">
            <p className="text-xs text-gray-500 mb-1">Avg Liquidity</p>
            <p className="text-2xl font-bold mono text-[#B45309]">{formatUsd(avgLiquidity)}</p>
          </div>
        </div>

        <div className="px-8 pb-8">
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-[#E4E4E7] text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Token</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Pool</th>
                  <th className="px-5 py-3 font-medium">Liquidity</th>
                  <th className="px-5 py-3 font-medium">24h Volume</th>
                  <th className="px-5 py-3 font-medium">Risk Score</th>
                </tr>
              </thead>
              <tbody className="mono text-[13px]">
                {typedPools.map((pool) => (
                  <tr
                    key={pool.pool_address}
                    className="border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-5 py-3.5 font-sans font-medium">
                      {pool.base_token_symbol}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={categoryTone(pool.category)}>
                        {pool.category.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{pool.pool_name}</td>
                    <td className="px-5 py-3.5">{formatUsd(pool.liquidity_usd)}</td>
                    <td className="px-5 py-3.5">{formatUsd(pool.volume_24h_usd)}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={riskTone(pool.risk_level)}>
                        {pool.risk_level} · {pool.risk_score}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {typedPools.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-400 font-sans">
                      No pool data yet. Run the cron snapshot endpoint to populate this table.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} />
    </>
  );
}
