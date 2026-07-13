import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Pool } from "@/types/database";
import { LpStrategyTabs } from "@/components/dashboard/lp-strategy-tabs";

export const dynamic = "force-dynamic";

const MIN_SIGNAL_USD = 1_000;

export default async function LpStrategyPage() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [{ data: pools }, { data: wallets }] = await Promise.all([
    supabase
      .from("pools")
      .select("*")
      .order("liquidity_usd", { ascending: false })
      .limit(100),
    supabase.from("wallets").select("wallet_address"),
  ]);

  const typedPools = (pools || []) as Pool[];
  const lastSynced = typedPools[0]?.last_synced_at ?? null;

  // Cross-link with Smart Money: pull the same tracked wallets' recent
  // activity and net it out per token, so LP Strategy can flag pools where
  // real smart-money wallets are actively piling in or bailing out.
  const smartMoneyAddresses = (wallets || []).map((w) => w.wallet_address.toLowerCase());
  const smartMoneySignal: Record<string, number> = {};

  if (smartMoneyAddresses.length > 0) {
    const { data: activity } = await supabase
      .from("wallet_activity")
      .select("wallet_address, action, token_address, amount_usd, occurred_at")
      .in("wallet_address", smartMoneyAddresses)
      .gte("occurred_at", sevenDaysAgo.toISOString());

    for (const row of activity || []) {
      if (!row.token_address) continue;
      const key = row.token_address.toLowerCase();
      const amount = Number(row.amount_usd || 0);
      const signed = row.action === "buy" ? amount : -amount;
      smartMoneySignal[key] = (smartMoneySignal[key] || 0) + signed;
    }
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">LP Strategy</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pools worth adding liquidity to, classified by holding horizon
            </p>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6">
          <LpStrategyTabs pools={typedPools} smartMoneySignal={smartMoneySignal} minSignalUsd={MIN_SIGNAL_USD} />
        </div>
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} />
    </>
  );
}

