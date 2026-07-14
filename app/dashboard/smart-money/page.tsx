import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Wallet } from "@/types/database";
import { SmartMoneyTable } from "@/components/dashboard/smart-money-table";
import { WalletBubbleMap, WalletNode, WalletEdge } from "@/components/dashboard/wallet-bubble-map";

export const dynamic = "force-dynamic";

export default async function SmartMoneyPage() {
  const { data: wallets } = await supabase
    .from("wallets")
    .select("*")
    .order("rank", { ascending: true })
    .limit(50);

  const typedWallets = (wallets || []) as Wallet[];
  const lastSynced = typedWallets[0]?.last_synced_at ?? null;

  // Build the wallet bubble map: nodes are tracked wallets, edges connect
  // any two wallets that hold the same token — a simple, honest way to show
  // which whales are moving in similar tokens. Only real wallet_holdings
  // data is used, no simulated connections.
  const { data: holdings } = await supabase
    .from("wallet_holdings")
    .select("wallet_address, token_address, token_symbol")
    .in("wallet_address", typedWallets.map((w) => w.wallet_address));

  const heldTokensByWallet = new Map<string, string[]>();
  for (const row of holdings || []) {
    if (!row.token_symbol) continue;
    const list = heldTokensByWallet.get(row.wallet_address) ?? [];
    if (!list.includes(row.token_symbol)) list.push(row.token_symbol);
    heldTokensByWallet.set(row.wallet_address, list);
  }

  const nodes: WalletNode[] = typedWallets.map((w) => ({
    address: w.wallet_address,
    holdingsUsd: w.total_holdings_usd ?? 0,
    heldTokens: heldTokensByWallet.get(w.wallet_address) ?? [],
  }));

  const walletsByToken = new Map<string, { address: string; symbol: string | null }[]>();
  for (const row of holdings || []) {
    const list = walletsByToken.get(row.token_address) ?? [];
    list.push({ address: row.wallet_address, symbol: row.token_symbol });
    walletsByToken.set(row.token_address, list);
  }

  const edgeMap = new Map<string, WalletEdge>();
  for (const holders of walletsByToken.values()) {
    if (holders.length < 2) continue;
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        const [a, b] = [holders[i], holders[j]].sort((x, y) =>
          x.address.localeCompare(y.address)
        );
        const key = `${a.address}::${b.address}`;
        const existing = edgeMap.get(key);
        const symbol = holders[i].symbol ?? "unknown";
        if (existing) {
          if (!existing.tokens.includes(symbol)) existing.tokens.push(symbol);
        } else {
          edgeMap.set(key, { source: a.address, target: b.address, tokens: [symbol] });
        }
      }
    }
  }

  const edges = Array.from(edgeMap.values());

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-[#0A0A0B]">
        <SmartMoneyTable wallets={typedWallets} />
        <div className="px-4 md:px-8 pb-8">
          <WalletBubbleMap nodes={nodes} edges={edges} />
        </div>
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} dark />
    </>
  );
}
