"use client";

import { useState } from "react";
import { Pool } from "@/types/database";
import { Badge } from "@/components/dashboard/badge";
import {
  LP_STRATEGY_PRESETS,
  LpStrategyKey,
  getOpportunitiesForStrategy,
} from "@/lib/lp-strategy";

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
  const preset = LP_STRATEGY_PRESETS[activeKey];
  const opportunities = getOpportunitiesForStrategy(pools, activeKey);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(Object.keys(LP_STRATEGY_PRESETS) as LpStrategyKey[]).map((key) => {
          const p = LP_STRATEGY_PRESETS[key];
          const active = key === activeKey;
          return (
            <button
              key={key}
              onClick={() => setActiveKey(key)}
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

      <p className="text-sm text-gray-500 mb-5">{preset.description}</p>

      <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
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
            {opportunities.map(({ pool, minPrice, estApr }) => (
              <tr
                key={pool.pool_address}
                className="border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50"
              >
                <td className="px-5 py-3.5 font-sans font-medium">{pool.base_token_symbol}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={categoryTone(pool.category)}>{pool.category.toUpperCase()}</Badge>
                </td>
                <td className="px-5 py-3.5">{formatUsd(pool.liquidity_usd)}</td>
                <td className="px-5 py-3.5">{formatUsd(pool.volume_24h_usd)}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={riskTone(pool.risk_level)}>{pool.risk_level}</Badge>
                </td>
                <td className="px-5 py-3.5">{formatPrice(minPrice)}</td>
                <td className="px-5 py-3.5 font-semibold text-[#B45309]">{formatApr(estApr)}</td>
              </tr>
            ))}
            {opportunities.length === 0 && (
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

      <p className="text-xs text-gray-400 font-sans mt-4 max-w-2xl leading-relaxed">
        One-sided range starting at current price, extending down {(preset.rangePct * 100).toFixed(0)}%.
        APR estimates are backward-looking (trailing 24h volume) and exclude impermanent loss.
      </p>
    </div>
  );
}
