"use client";

import { useMemo, useState } from "react";
import { Pool, TokenCategory } from "@/types/database";
import { AddressModal, useAddressModal } from "@/components/dashboard/address-modal";

const PAGE_SIZE = 10;

const CATEGORY_TABS: { key: TokenCategory | "all"; label: string }[] = [
  { key: "all", label: "all" },
  { key: "rwa", label: "rwa" },
  { key: "meme", label: "meme" },
  { key: "other", label: "other" },
];

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function riskRowStyle(level: string): string {
  if (level === "high") return "bg-[rgba(248,113,113,0.08)] border-[rgba(248,113,113,0.35)]";
  return "bg-[#131315] border-[#1F1F22]";
}

function riskTextColor(level: string): string {
  if (level === "high") return "text-red-400";
  return "text-gray-200";
}

export function LpMonitorTabs({ pools }: { pools: Pool[] }) {
  const [activeTab, setActiveTab] = useState<TokenCategory | "all">("all");
  const [page, setPage] = useState(1);
  const addressModal = useAddressModal();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: pools.length, rwa: 0, meme: 0, other: 0, unknown: 0 };
    for (const p of pools) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [pools]);

  const filtered = useMemo(
    () => (activeTab === "all" ? pools : pools.filter((p) => p.category === activeTab)),
    [pools, activeTab]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function selectTab(key: TokenCategory | "all") {
    setActiveTab(key);
    setPage(1);
  }

  return (
    <div>
      <div className="flex gap-2 px-4 md:px-8 mb-4">
        {CATEGORY_TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                active
                  ? "bg-[#F5A623] text-black"
                  : "bg-[#131315] border border-[#1F1F22] text-gray-400 hover:border-gray-600"
              }`}
            >
              {tab.label} ({counts[tab.key] ?? 0})
            </button>
          );
        })}
      </div>

      <div className="px-4 md:px-8 pb-8">
        <div className="flex flex-col gap-2">
          {pageItems.map((pool) => (
            <div
              key={pool.pool_address}
              className={`rounded-xl border px-4 py-3 ${riskRowStyle(pool.risk_level)}`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <button
                  onClick={() => addressModal.open("token", pool.base_token_address)}
                  className="flex items-center gap-2 text-white font-semibold text-sm hover:text-[#F5A623]"
                >
                  <span className="w-7 h-7 rounded-full bg-[#1F1F22] flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                    {pool.base_token_symbol?.charAt(0) ?? "?"}
                  </span>
                  {pool.base_token_symbol}
                </button>
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-200">
                  {pool.category}
                </span>
              </div>
              <div className="flex justify-between text-right gap-2">
                <div className="flex flex-col gap-0.5 text-left">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">pool</span>
                  <button
                    onClick={() => addressModal.open("pool", pool.pool_address)}
                    className="mono text-xs text-gray-400 hover:text-[#F5A623] hover:underline text-left"
                  >
                    {pool.pool_name}
                  </button>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">liquidity</span>
                  <span className="mono text-xs text-gray-200">{formatUsd(pool.liquidity_usd)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">24h vol</span>
                  <span className="mono text-xs text-gray-200">{formatUsd(pool.volume_24h_usd)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">risk</span>
                  <span className={`mono text-xs font-medium ${riskTextColor(pool.risk_level)}`}>
                    {pool.risk_level} · {pool.risk_score}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {pageItems.length === 0 && (
            <div className="rounded-xl border border-[#1F1F22] bg-[#131315] px-5 py-10 text-center text-gray-500 font-sans text-sm">
              nothing here yet.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400 font-sans">
            <span>
              page {currentPage} of {totalPages} — {filtered.length} pool
              {filtered.length === 1 ? "" : "s"}
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

      <AddressModal state={addressModal.state} onClose={addressModal.close} />
    </div>
  );
}
