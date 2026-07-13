import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Wallet, WalletHolding } from "@/types/database";

export const dynamic = "force-dynamic";

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const sign = value >= 0 ? "+" : "";
  if (Math.abs(value) >= 1_000_000) return `${sign}$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${sign}$${(value / 1_000).toFixed(1)}K`;
  return `${sign}$${value.toFixed(0)}`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default async function SmartMoneyPage() {
  const { data: wallets } = await supabase
    .from("wallets")
    .select("*")
    .order("rank", { ascending: true })
    .limit(20);

  const typedWallets = (wallets || []) as Wallet[];
  const topWallet = typedWallets[0];

  let topHoldings: WalletHolding[] = [];
  if (topWallet) {
    const { data } = await supabase
      .from("wallet_holdings")
      .select("*")
      .eq("wallet_address", topWallet.wallet_address)
      .order("value_usd", { ascending: false })
      .limit(5);
    topHoldings = (data || []) as WalletHolding[];
  }

  const lastSynced = topWallet?.last_synced_at ?? null;

  return (
    <>
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto border-r border-[#E4E4E7]">
          <div className="flex items-center justify-between px-8 py-5 border-b border-[#E4E4E7]">
            <div>
              <h1 className="text-xl font-semibold">Smart Money Tracker</h1>
              <p className="text-sm text-gray-500 mt-0.5">Top wallet leaderboard, last 7 days</p>
            </div>
          </div>

          <div className="px-8 py-6">
            <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-[#E4E4E7] text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Rank</th>
                    <th className="px-5 py-3 font-medium">Wallet</th>
                    <th className="px-5 py-3 font-medium">Win Rate</th>
                    <th className="px-5 py-3 font-medium">Realized PnL (7d)</th>
                  </tr>
                </thead>
                <tbody className="mono text-[13px]">
                  {typedWallets.map((wallet, i) => (
                    <tr
                      key={wallet.wallet_address}
                      className={`border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50 ${
                        i === 0 ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className={`px-5 py-3.5 font-bold ${i === 0 ? "text-[#F5A623]" : "text-gray-400"}`}>
                        #{wallet.rank}
                      </td>
                      <td className="px-5 py-3.5 font-sans">{shortenAddress(wallet.wallet_address)}</td>
                      <td className="px-5 py-3.5 text-emerald-600">{wallet.win_rate ?? "—"}%</td>
                      <td className="px-5 py-3.5 text-emerald-600">
                        {formatUsd(wallet.realized_pnl_7d_usd)}
                      </td>
                    </tr>
                  ))}
                  {typedWallets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-gray-400 font-sans">
                        No wallet data yet. Run the cron snapshot endpoint to populate this table.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <aside className="w-80 shrink-0 p-6 overflow-y-auto">
          {topWallet ? (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full bg-[#F5A623] flex items-center justify-center text-black font-bold">
                  #1
                </div>
                <div>
                  <p className="font-semibold mono text-sm">
                    {shortenAddress(topWallet.wallet_address)}
                  </p>
                  <p className="text-xs text-gray-500">Rank #1 — Top Trader</p>
                </div>
              </div>
              <div className="bg-white border border-[#E4E4E7] rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-500 mb-1">Total PnL (7d)</p>
                <p className="text-xl font-bold mono text-emerald-600">
                  {formatUsd(topWallet.realized_pnl_7d_usd)}
                </p>
              </div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current Holdings</p>
              <div className="space-y-2">
                {topHoldings.map((holding) => (
                  <div
                    key={holding.id}
                    className="bg-white border border-[#E4E4E7] rounded-lg p-3 flex justify-between items-center text-sm"
                  >
                    <span className="font-medium">{holding.token_symbol}</span>
                    <span className="mono text-gray-400">{formatUsd(holding.value_usd)}</span>
                  </div>
                ))}
                {topHoldings.length === 0 && (
                  <p className="text-xs text-gray-400">No holdings data yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">No wallet data yet.</p>
          )}
        </aside>
      </div>
      <DashboardFooter lastSyncedAt={lastSynced} />
    </>
  );
}
