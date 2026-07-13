"use client";

import { useState } from "react";
import { Wallet, WalletHolding, WalletActivity } from "@/types/database";
import { AddressModal, useAddressModal } from "@/components/dashboard/address-modal";

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatSignedUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatUsd(value)}`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface WalletDetail extends Wallet {
  holdings: WalletHolding[];
  recent_activity: WalletActivity[];
}

export function SmartMoneyTable({ wallets }: { wallets: Wallet[] }) {
  const [selected, setSelected] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const addressModal = useAddressModal();

  async function openWallet(address: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/wallets/${address}`);
      const json = await res.json();
      if (json.data) setSelected(json.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">
      <main className="flex-1 md:overflow-y-auto md:border-r border-[#E4E4E7]">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">Smart Money Tracker</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Top wallets by position size, ranked from real on-chain holdings
            </p>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6">
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-[#E4E4E7] text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Rank</th>
                  <th className="px-5 py-3 font-medium">Wallet</th>
                  <th className="px-5 py-3 font-medium">Total Holdings</th>
                  <th className="px-5 py-3 font-medium">Net Position Change (7d)</th>
                </tr>
              </thead>
              <tbody className="mono text-[13px]">
                {wallets.map((wallet, i) => {
                  const net = wallet.net_position_change_7d_usd ?? 0;
                  const trend = net > 0 ? "accumulating" : net < 0 ? "distributing" : "no activity";
                  const trendColor =
                    net > 0 ? "text-emerald-600" : net < 0 ? "text-red-500" : "text-gray-400";
                  return (
                    <tr
                      key={wallet.wallet_address}
                      onClick={() => openWallet(wallet.wallet_address)}
                      className={`border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50 cursor-pointer ${
                        i === 0 ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className={`px-5 py-3.5 font-bold ${i === 0 ? "text-[#F5A623]" : "text-gray-400"}`}>
                        #{wallet.rank}
                      </td>
                      <td className="px-5 py-3.5 font-sans">{shortenAddress(wallet.wallet_address)}</td>
                      <td className="px-5 py-3.5">{formatUsd(wallet.total_holdings_usd)}</td>
                      <td className={`px-5 py-3.5 ${trendColor}`}>
                        {formatSignedUsd(net)}
                        <span className="ml-1.5 text-[10px] font-sans text-gray-400">{trend}</span>
                      </td>
                    </tr>
                  );
                })}
                {wallets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-16 text-center text-gray-400 font-sans">
                      <p className="text-sm font-medium text-gray-500 mb-1">No wallet data yet.</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto">
                        This table populates once the wallet tracking sync runs and pulls top holder
                        activity from Robinhood Chain.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 font-sans mt-4 max-w-2xl leading-relaxed">
            Ranked by real on-chain position size in tokens actively traded on Robinhood Chain
            (contract addresses and stablecoin/wrapped-asset holdings excluded, minimum $10K to
            qualify). "Net Position Change" is the USD value of buys minus sells over the last 7
            days, valued at current price. Click a row for full holdings and activity.
          </p>
        </div>
      </main>

      {(loading || selected) && (
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setSelected(null)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-white p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="mb-4 text-xs text-gray-400 font-sans"
            >
              ✕ Close
            </button>
            {loading && <p className="text-xs text-gray-400">Loading...</p>}
            {!loading && selected && (
              <WalletDetailContent selected={selected} onTokenClick={(addr) => addressModal.open("token", addr)} />
            )}
          </aside>
        </div>
      )}

      <aside className="hidden md:block w-80 shrink-0 p-6 overflow-y-auto">
        {loading && <p className="text-xs text-gray-400">Loading...</p>}
        {!loading && selected ? (
          <WalletDetailContent selected={selected} onTokenClick={(addr) => addressModal.open("token", addr)} />
        ) : (
          !loading && (
            <p className="text-xs text-gray-400">Click a wallet row to see holdings and activity.</p>
          )
        )}
      </aside>

      <AddressModal state={addressModal.state} onClose={addressModal.close} />
    </div>
  );
}

function WalletDetailContent({
  selected,
  onTokenClick,
}: {
  selected: WalletDetail;
  onTokenClick: (tokenAddress: string) => void;
}) {
  return (
    <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-[#F5A623] flex items-center justify-center text-black font-bold">
                #{selected.rank}
              </div>
              <div>
                <p className="font-semibold mono text-sm">{shortenAddress(selected.wallet_address)}</p>
                <p className="text-xs text-gray-500">Rank #{selected.rank}</p>
              </div>
            </div>
            <div className="bg-white border border-[#E4E4E7] rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 mb-1">Total Holdings</p>
              <p className="text-xl font-bold mono">{formatUsd(selected.total_holdings_usd)}</p>
            </div>
            <div className="bg-white border border-[#E4E4E7] rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 mb-1">Net Position Change (7d)</p>
              <p
                className={`text-xl font-bold mono ${
                  (selected.net_position_change_7d_usd ?? 0) > 0
                    ? "text-emerald-600"
                    : (selected.net_position_change_7d_usd ?? 0) < 0
                    ? "text-red-500"
                    : "text-gray-400"
                }`}
              >
                {formatSignedUsd(selected.net_position_change_7d_usd)}
              </p>
            </div>

            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current Holdings</p>
            <div className="space-y-2 mb-5">
              {selected.holdings.map((holding) => (
                <div
                  key={holding.id}
                  className="bg-white border border-[#E4E4E7] rounded-lg p-3 flex justify-between items-center text-sm"
                >
                  <button
                    onClick={() => onTokenClick(holding.token_address)}
                    className="font-medium hover:underline hover:text-[#B45309]"
                  >
                    {holding.token_symbol}
                  </button>
                  <span className="mono text-gray-400">{formatUsd(holding.value_usd)}</span>
                </div>
              ))}
              {selected.holdings.length === 0 && (
                <p className="text-xs text-gray-400">No holdings data.</p>
              )}
            </div>

            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recent Activity</p>
            <div className="space-y-2">
              {selected.recent_activity.map((activity) => (
                <div
                  key={activity.id}
                  className="bg-white border border-[#E4E4E7] rounded-lg p-3 text-sm"
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-xs font-semibold uppercase ${
                        activity.action === "buy" ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {activity.action}
                    </span>
                    <span className="mono text-gray-400 text-xs">{timeAgo(activity.occurred_at)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    {activity.token_address ? (
                      <button
                        onClick={() => onTokenClick(activity.token_address!)}
                        className="font-medium text-sm hover:underline hover:text-[#B45309]"
                      >
                        {activity.token_symbol}
                      </button>
                    ) : (
                      <span className="font-medium text-sm">{activity.token_symbol}</span>
                    )}
                    <span className="mono text-gray-500 text-sm">{formatUsd(activity.amount_usd)}</span>
                  </div>
                </div>
              ))}
              {selected.recent_activity.length === 0 && (
                <p className="text-xs text-gray-400">No recent activity.</p>
              )}
            </div>
    </>
  );
}

