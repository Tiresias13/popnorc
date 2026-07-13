"use client";

import { useMemo, useState } from "react";
import { Pool } from "@/types/database";
import { Badge } from "@/components/dashboard/badge";
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

function riskTone(level: string): "emerald" | "amber" | "red" | "gray" {
  if (level === "low") return "emerald";
  if (level === "medium") return "amber";
  if (level === "high") return "red";
  return "gray";
}

function categoryTone(category: string): "blue" | "purple" | "gray" {
  if (category === "rwa") return "blue";
  if (category === "meme") return "purple";
  return "gray";
}

export function LpStrategyTabs({ pools }: { pools: Pool[] }) {
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  active
                    ? "bg-[#0A0A0B] text-white"
                    : "bg-white border border-[#E4E4E7] text-gray-600 hover:border-gray-300"
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
          className="px-3 py-2 rounded-lg text-sm border border-[#E4E4E7] bg-white text-gray-600 self-start"
        >
          <option value="all">All categories</option>
          <option value="rwa">RWA</option>
          <option value="meme">Meme</option>
          <option value="other">Other</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-5">{preset.description}</p>

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-[#E4E4E7] text-xs uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Token</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Liquidity</th>
              <th className="px-5 py-3 font-medium">24h Volume</th>
              <th className="px-5 py-3 font-medium">Risk</th>
              <th className="px-5 py-3 font-medium">Suggested Min Price</th>
              <th className="px-5 py-3 font-medium">Est. APR ({preset.label})</th>
            </tr>
          </thead>
          <tbody className="mono text-[13px]">
            {pageItems.map(({ pool, minPrice, estApr }) => {
              const suspicious = isSuspiciousVolumeRatio(pool.liquidity_usd, pool.volume_24h_usd);
              return (
                <tr
                  key={pool.pool_address}
                  className="border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50"
                >
                  <td className="px-5 py-3.5 font-sans font-medium">
                    <button
                      onClick={() => addressModal.open("token", pool.base_token_address)}
                      className="hover:underline hover:text-[#B45309]"
                    >
                      {pool.base_token_symbol}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={categoryTone(pool.category)}>{pool.category.toUpperCase()}</Badge>
                  </td>
                  <td className="px-5 py-3.5">{formatUsd(pool.liquidity_usd)}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1.5">
                      {formatUsd(pool.volume_24h_usd)}
                      {suspicious && (
                        <span
                          title="Volume is 10x+ the pool's liquidity — a common signature of wash trading. Treat this APR estimate with caution."
                          className="text-amber-500 cursor-help"
                        >
                          ⚠
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={riskTone(pool.risk_level)}>{pool.risk_level}</Badge>
                  </td>
                  <td className="px-5 py-3.5">{formatPrice(minPrice)}</td>
                  <td className="px-5 py-3.5 font-semibold text-[#B45309]">{formatApr(estApr)}</td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400 font-sans">
                  No pools currently qualify for the {preset.label} strategy. Check back after the
                  next sync.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500 font-sans">
          <span>
            Page {currentPage} of {totalPages} — {opportunities.length} opportunit
            {opportunities.length === 1 ? "y" : "ies"}
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

      <p className="text-xs text-gray-400 font-sans mt-4 max-w-2xl leading-relaxed">
        One-sided range starting at current price, extending down {(preset.rangePct * 100).toFixed(0)}%.
        APR estimates are backward-looking (trailing 24h volume) and exclude impermanent loss.
        <span className="text-amber-500">⚠</span> flags pools where 24h volume exceeds 10x liquidity —
        a sign of possible wash trading, meaning the APR estimate may not reflect sustainable, organic activity.
      </p>

      <AddressModal state={addressModal.state} onClose={addressModal.close} />
    </div>
  );
}

