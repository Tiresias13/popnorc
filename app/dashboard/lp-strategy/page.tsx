import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Pool } from "@/types/database";
import { LpStrategyTabs } from "@/components/dashboard/lp-strategy-tabs";

export const dynamic = "force-dynamic";

export default async function LpStrategyPage() {
  const { data: pools } = await supabase
    .from("pools")
    .select("*")
    .order("liquidity_usd", { ascending: false })
    .limit(100);

  const typedPools = (pools || []) as Pool[];
  const lastSynced = typedPools[0]?.last_synced_at ?? null;

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">LP Strategy</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pools worth adding liquidity to, classified by holding horizon
            </p>
          </div>
        </div>

        <div className="px-8 py-6">
          <LpStrategyTabs pools={typedPools} />
        </div>
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} />
    </>
  );
}
