"use client";

import { useMemo, useState } from "react";
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

const PAGE_SIZE = 10;

export function SmartMoneyTable({ wallets }: { wallets: Wallet[] }) {
  const [selected, setSelected] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const addressModal = useAddressModal();

  const sortedWallets = useMemo(
    () =>
      [...wallets].sort(
        (a, b) =>
          Math.abs(b.net_position_change_7d_usd ?? 0) - Math.abs(a.net_position_change_7d_usd ?? 0)
      ),
    [wallets]
  );

  const totalPages = Math.max(1, Math.ceil(sortedWallets.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => sortedWallets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedWallets, currentPage]
  );

  async function openWallet(address: string) {
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/v1/wallets/${address}`);
      const json = await res.json();
      if (json.data) setSelected(json.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#E4E4E7]">
        <h1 className="text-xl font-semibold">Smart Money Tracker</h1>
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
              {pageItems.map((wallet, i) => {
                const net = wallet.net_position_change_7d_usd ?? 0;
                const trend = net > 0 ? "buying more" : net < 0 ? "selling off" : "just holding";
                const trendColor =
                  net > 0 ? "text-emerald-600" : net < 0 ? "text-red-500" : "text-gray-400";
                return (
                  <tr
                    key={wallet.wallet_address}
                    onClick={() => openWallet(wallet.wallet_address)}
                    className={`border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50 cursor-pointer ${
                      currentPage === 1 && i === 0 ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <td
                      className={`px-5 py-3.5 font-bold ${
                        currentPage === 1 && i === 0 ? "text-[#F5A623]" : "text-gray-400"
                      }`}
                    >
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 font-sans">
            <span>
              Page {currentPage} of {totalPages} — {wallets.length} wallet
              {wallets.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-300"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#E4E4E7] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-300"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {(loading || selected) && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6"
          onClick={() => {
            setSelected(null);
            setLoading(false);
          }}
        >
          <div
            className="bg-white rounded-2xl px-6 py-5 shadow-xl text-sm max-w-sm w-full max-h-[85vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setSelected(null);
                setLoading(false);
              }}
              className="absolute top-3 right-4 text-gray-400 hover:text-black text-xs"
            >
              ✕
            </button>
            {loading && <p className="text-xs text-gray-400 py-6 text-center">loading...</p>}
            {!loading && selected && (
              <WalletDetailContent
                selected={selected}
                onTokenClick={(addr) => addressModal.open("token", addr)}
              />
            )}
          </div>
        </div>
      )}

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
      <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl p-4 mb-4">
        <p className="text-xs text-gray-500 mb-1">Total Holdings</p>
        <p className="text-xl font-bold mono">{formatUsd(selected.total_holdings_usd)}</p>
      </div>
      <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl p-4 mb-4">
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
            className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-lg p-3 flex justify-between items-center text-sm"
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
        {selected.holdings.length === 0 && <p className="text-xs text-gray-400">No holdings data.</p>}
      </div>

      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recent Activity</p>
      <div className="space-y-2">
        {selected.recent_activity.map((activity) => (
          <div key={activity.id} className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-lg p-3 text-sm">
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

