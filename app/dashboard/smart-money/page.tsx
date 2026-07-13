import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Wallet } from "@/types/database";
import { SmartMoneyTable } from "@/components/dashboard/smart-money-table";

export const dynamic = "force-dynamic";

export default async function SmartMoneyPage() {
  const { data: wallets } = await supabase
    .from("wallets")
    .select("*")
    .order("rank", { ascending: true })
    .limit(50);

  const typedWallets = (wallets || []) as Wallet[];
  const lastSynced = typedWallets[0]?.last_synced_at ?? null;

  return (
    <>
      <SmartMoneyTable wallets={typedWallets} />
      <DashboardFooter lastSyncedAt={lastSynced} />
    </>
  );
}
