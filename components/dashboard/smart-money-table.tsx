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
      <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#1F1F22]">
        <h1 className="text-xl font-semibold text-white">smart money</h1>
      </div>

      <div className="px-4 md:px-8 py-6">
        <div className="flex flex-col gap-2">
          {pageItems.map((wallet, i) => {
            const net = wallet.net_position_change_7d_usd ?? 0;
            const trend = net > 0 ? "buying more" : net < 0 ? "selling off" : "just holding";
            const trendColor = net > 0 ? "text-emerald-400" : net < 0 ? "text-red-400" : "text-gray-500";
            const isTopRow = currentPage === 1 && i === 0;
            return (
              <button
                key={wallet.wallet_address}
                onClick={() => openWallet(wallet.wallet_address)}
                className={`rounded-xl border px-4 py-3 text-left ${
                  isTopRow
                    ? "bg-[rgba(245,166,35,0.06)] border-[rgba(245,166,35,0.3)]"
                    : "bg-[#131315] border-[#1F1F22]"
                } hover:border-gray-600`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        isTopRow ? "bg-[#F5A623] text-black" : "bg-[#1F1F22] text-gray-400"
                      }`}
                    >
                      #{wallet.rank}
                    </span>
                    <span className="mono text-sm text-white font-medium">
                      {shortenAddress(wallet.wallet_address)}
                    </span>
                  </div>
                  <span className={`text-[11px] font-semibold ${trendColor}`}>{trend}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">holdings</span>
                    <span className="mono text-xs text-gray-200">{formatUsd(wallet.total_holdings_usd)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 items-end">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">7d net change</span>
                    <span className={`mono text-xs font-medium ${trendColor}`}>{formatSignedUsd(net)}</span>
                  </div>
                </div>
              </button>
            );
          })}
          {wallets.length === 0 && (
            <div className="rounded-xl border border-[#1F1F22] bg-[#131315] px-5 py-16 text-center">
              <p className="text-sm font-medium text-gray-300 mb-1">no wallets tracked yet.</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                this fills in once the wallet sync runs and pulls top holder activity from
                robinhood chain.
              </p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400 font-sans">
            <span>
              page {currentPage} of {totalPages} — {wallets.length} wallet
              {wallets.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-[#1F1F22] bg-[#131315] text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-600"
              >
                previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#1F1F22] bg-[#131315] text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-600"
              >
                next
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
            className="bg-[#0A0A0B] text-white rounded-2xl px-6 py-5 shadow-xl text-sm max-w-sm w-full max-h-[85vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setSelected(null);
                setLoading(false);
              }}
              className="absolute top-3 right-4 text-gray-500 hover:text-white text-xs"
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
          <p className="font-semibold mono text-sm text-white">{shortenAddress(selected.wallet_address)}</p>
          <p className="text-xs text-gray-500">rank #{selected.rank}</p>
        </div>
      </div>
      <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4 mb-4">
        <p className="text-xs text-gray-500 mb-1">total holdings</p>
        <p className="text-xl font-bold mono text-white">{formatUsd(selected.total_holdings_usd)}</p>
      </div>
      <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4 mb-4">
        <p className="text-xs text-gray-500 mb-1">net change (7d)</p>
        <p
          className={`text-xl font-bold mono ${
            (selected.net_position_change_7d_usd ?? 0) > 0
              ? "text-emerald-400"
              : (selected.net_position_change_7d_usd ?? 0) < 0
              ? "text-red-400"
              : "text-gray-500"
          }`}
        >
          {formatSignedUsd(selected.net_position_change_7d_usd)}
        </p>
      </div>

      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">current holdings</p>
      <div className="space-y-2 mb-5">
        {selected.holdings.map((holding) => (
          <div
            key={holding.id}
            className="bg-[#131315] border border-[#1F1F22] rounded-lg p-3 flex justify-between items-center text-sm"
          >
            <button
              onClick={() => onTokenClick(holding.token_address)}
              className="font-medium text-white hover:underline hover:text-[#F5A623]"
            >
              {holding.token_symbol}
            </button>
            <span className="mono text-gray-500">{formatUsd(holding.value_usd)}</span>
          </div>
        ))}
        {selected.holdings.length === 0 && <p className="text-xs text-gray-500">no holdings data.</p>}
      </div>

      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">recent activity</p>
      <div className="space-y-2">
        {selected.recent_activity.map((activity) => (
          <div key={activity.id} className="bg-[#131315] border border-[#1F1F22] rounded-lg p-3 text-sm">
            <div className="flex justify-between items-center">
              <span
                className={`text-xs font-semibold uppercase ${
                  activity.action === "buy" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {activity.action}
              </span>
              <span className="mono text-gray-500 text-xs">{timeAgo(activity.occurred_at)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              {activity.token_address ? (
                <button
                  onClick={() => onTokenClick(activity.token_address!)}
                  className="font-medium text-sm text-white hover:underline hover:text-[#F5A623]"
                >
                  {activity.token_symbol}
                </button>
              ) : (
                <span className="font-medium text-sm text-white">{activity.token_symbol}</span>
              )}
              <span className="mono text-gray-400 text-sm">{formatUsd(activity.amount_usd)}</span>
            </div>
          </div>
        ))}
        {selected.recent_activity.length === 0 && (
          <p className="text-xs text-gray-500">no recent activity.</p>
        )}
      </div>
    </>
  );
}
