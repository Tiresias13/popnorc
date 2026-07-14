"use client";

import { useMemo, useState } from "react";
import { Pool } from "@/types/database";
import {
  LP_STRATEGY_PRESETS,
  LpStrategyKey,
  getOpportunitiesForStrategy,
} from "@/lib/lp-strategy";
import { isSuspiciousVolumeRatio } from "@/lib/risk-scoring";
import { AddressModal, useAddressModal } from "@/components/dashboard/address-modal";

const PAGE_SIZE = 10;

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(3)}`;
}

function formatApr(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

function riskRowStyle(level: string): string {
  if (level === "high") return "bg-[rgba(248,113,113,0.08)] border-[rgba(248,113,113,0.35)]";
  return "bg-[#131315] border-[#1F1F22]";
}

function riskTextColor(level: string): string {
  if (level === "high") return "text-red-400";
  return "text-gray-200";
}

export function LpStrategyTabs({
  pools,
  smartMoneySignal,
  minSignalUsd,
}: {
  pools: Pool[];
  smartMoneySignal?: Record<string, number>;
  minSignalUsd?: number;
}) {
  const [activeKey, setActiveKey] = useState<LpStrategyKey>("degen");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "rwa" | "meme" | "other">("all");
  const [page, setPage] = useState(1);
  const addressModal = useAddressModal();

  const preset = LP_STRATEGY_PRESETS[activeKey];
  const allOpportunities = useMemo(
    () => getOpportunitiesForStrategy(pools, activeKey),
    [pools, activeKey]
  );

  const opportunities = useMemo(
    () =>
      categoryFilter === "all"
        ? allOpportunities
        : allOpportunities.filter((o) => o.pool.category === categoryFilter),
    [allOpportunities, categoryFilter]
  );

  const totalPages = Math.max(1, Math.ceil(opportunities.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = opportunities.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function selectStrategy(key: LpStrategyKey) {
    setActiveKey(key);
    setPage(1);
  }

  function selectCategory(cat: "all" | "rwa" | "meme" | "other") {
    setCategoryFilter(cat);
    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          {(Object.keys(LP_STRATEGY_PRESETS) as LpStrategyKey[]).map((key) => {
            const p = LP_STRATEGY_PRESETS[key];
            const active = key === activeKey;
            return (
              <button
                key={key}
                onClick={() => selectStrategy(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  active
                    ? "bg-[#F5A623] text-black"
                    : "bg-[#131315] border border-[#1F1F22] text-gray-400 hover:border-gray-600"
                }`}
              >
                {p.label} (-{(p.rangePct * 100).toFixed(0)}%)
              </button>
            );
          })}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => selectCategory(e.target.value as "all" | "rwa" | "meme" | "other")}
          className="px-3 py-2 rounded-lg text-sm border border-[#1F1F22] bg-[#131315] text-gray-300 self-start"
        >
          <option value="all">all categories</option>
          <option value="rwa">rwa</option>
          <option value="meme">meme</option>
          <option value="other">other</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-5">{preset.description}</p>

      <div className="flex flex-col gap-2">
        {pageItems.map(({ pool, minPrice, estApr }) => {
          const suspicious = isSuspiciousVolumeRatio(pool.liquidity_usd, pool.volume_24h_usd);
          const signal = smartMoneySignal?.[pool.base_token_address.toLowerCase()] ?? 0;
          const threshold = minSignalUsd ?? 1000;
          const signalBadge =
            signal >= threshold ? (
              <span
                title="Smart money wallets are net buying this token (last 7 days)"
                className="text-xs cursor-help"
              >
                🔥
              </span>
            ) : signal <= -threshold ? (
              <span
                title="Smart money wallets are net selling this token (last 7 days)"
                className="text-xs cursor-help"
              >
                ⚠
              </span>
            ) : null;

          return (
            <div
              key={pool.pool_address}
              className={`rounded-xl border px-4 py-3 ${riskRowStyle(pool.risk_level)}`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={() => addressModal.open("token", pool.base_token_address)}
                    className="flex items-center gap-2 text-white font-semibold text-sm hover:text-[#F5A623]"
                  >
                    <span className="w-7 h-7 rounded-full bg-[#1F1F22] flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                      {pool.base_token_symbol?.charAt(0) ?? "?"}
                    </span>
                    {pool.base_token_symbol}
                  </button>
                  {signalBadge}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-200">
                  {pool.category}
                </span>
              </div>
              <div className="flex justify-between gap-2 mb-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">liquidity</span>
                  <span className="mono text-xs text-gray-200">{formatUsd(pool.liquidity_usd)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">24h vol</span>
                  <span className="mono text-xs text-gray-200 flex items-center gap-1">
                    {formatUsd(pool.volume_24h_usd)}
                    {suspicious && (
                      <span
                        title="Volume is 10x+ the pool's liquidity — a common signature of wash trading. Treat this APR estimate with caution."
                        className="text-amber-400 cursor-help"
                      >
                        ⚠
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">risk</span>
                  <span className={`mono text-xs font-medium ${riskTextColor(pool.risk_level)}`}>
                    {pool.risk_level}
                  </span>
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">min price</span>
                  <span className="mono text-xs text-gray-200">{formatPrice(minPrice)}</span>
                </div>
                <div className="flex flex-col gap-0.5 items-end">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    est. apr ({preset.label})
                  </span>
                  <span className="mono text-xs font-bold text-[#F5A623]">{formatApr(estApr)}</span>
                </div>
              </div>
            </div>
          );
        })}
        {pageItems.length === 0 && (
          <div className="rounded-xl border border-[#1F1F22] bg-[#131315] px-5 py-10 text-center text-gray-500 font-sans text-sm">
            nothing qualifies for {preset.label} right now. check back after the next sync.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400 font-sans">
          <span>
            page {currentPage} of {totalPages} — {opportunities.length} opportunit
            {opportunities.length === 1 ? "y" : "ies"}
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

      <p className="text-xs text-gray-500 font-sans mt-4 max-w-2xl leading-relaxed">
        one-sided range from current price, down {(preset.rangePct * 100).toFixed(0)}%. apr is a
        backward-looking estimate from trailing 24h volume, excludes impermanent loss.{" "}
        <span className="text-amber-400">⚠</span> means volume looks like wash trading — treat that
        apr number with a grain of salt.
      </p>

      <AddressModal state={addressModal.state} onClose={addressModal.close} />
    </div>
  );
}
