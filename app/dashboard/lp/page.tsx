import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Pool } from "@/types/database";
import { LpMonitorTabs } from "@/components/dashboard/lp-monitor-tabs";

export const dynamic = "force-dynamic";

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default async function LpMonitorPage() {
  const { data: pools } = await supabase
    .from("pools")
    .select("*")
    .order("liquidity_usd", { ascending: false })
    .limit(200);

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
      <main className="flex-1 overflow-y-auto bg-[#0A0A0B]">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#1F1F22]">
          <div>
            <h1 className="text-xl font-semibold text-white">lp monitor</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              watching {totalPools} pools on robinhood chain, live
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-8 py-6">
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">pools tracked</p>
            <p className="text-2xl font-bold mono text-white">{totalPools}</p>
          </div>
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">high risk</p>
            <p className="text-2xl font-bold mono text-red-400">{highRisk}</p>
          </div>
          <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">rwa tokens</p>
            <p className="text-2xl font-bold mono text-emerald-400">{verifiedCount}</p>
          </div>
          <div className="bg-[#131315] border border-[rgba(245,166,35,0.3)] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">avg liquidity</p>
            <p className="text-2xl font-bold mono text-[#F5A623]">{formatUsd(avgLiquidity)}</p>
          </div>
        </div>

        <LpMonitorTabs pools={typedPools} />
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} dark />
    </>
  );
}
