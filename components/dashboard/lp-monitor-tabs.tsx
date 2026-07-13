"use client";

import { useMemo, useState } from "react";
import { Pool, TokenCategory } from "@/types/database";
import { Badge } from "@/components/dashboard/badge";

const PAGE_SIZE = 10;

const CATEGORY_TABS: { key: TokenCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rwa", label: "RWA" },
  { key: "meme", label: "Meme" },
  { key: "other", label: "Other" },
];

function formatUsd(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
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

export function LpMonitorTabs({ pools }: { pools: Pool[] }) {
  const [activeTab, setActiveTab] = useState<TokenCategory | "all">("all");
  const [page, setPage] = useState(1);

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
                  ? "bg-[#0A0A0B] text-white"
                  : "bg-white border border-[#E4E4E7] text-gray-600 hover:border-gray-300"
              }`}
            >
              {tab.label} ({counts[tab.key] ?? 0})
            </button>
          );
        })}
      </div>

      <div className="px-4 md:px-8 pb-8">
        <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#E4E4E7] text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Token</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Pool</th>
                <th className="px-5 py-3 font-medium">Liquidity</th>
                <th className="px-5 py-3 font-medium">24h Volume</th>
                <th className="px-5 py-3 font-medium">Risk Score</th>
              </tr>
            </thead>
            <tbody className="mono text-[13px]">
              {pageItems.map((pool) => (
                <tr
                  key={pool.pool_address}
                  className="border-b border-[#F0F0F1] last:border-0 hover:bg-gray-50"
                >
                  <td className="px-5 py-3.5 font-sans font-medium">{pool.base_token_symbol}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={categoryTone(pool.category)}>{pool.category.toUpperCase()}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{pool.pool_name}</td>
                  <td className="px-5 py-3.5">{formatUsd(pool.liquidity_usd)}</td>
                  <td className="px-5 py-3.5">{formatUsd(pool.volume_24h_usd)}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={riskTone(pool.risk_level)}>
                      {pool.risk_level} · {pool.risk_score}
                    </Badge>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400 font-sans">
                    No pools in this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 font-sans">
            <span>
              Page {currentPage} of {totalPages} — {filtered.length} pool
              {filtered.length === 1 ? "" : "s"}
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
    </div>
  );
}

                  <td className="px-5 py-3.5 text-gray-500">{pool.pool_name}</td>
                  <td className="px-5 py-3.5">{formatUsd(pool.liquidity_usd)}</td>
                  <td className="px-5 py-3.5">{formatUsd(pool.volume_24h_usd)}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={riskTone(pool.risk_level)}>
                      {pool.risk_level} · {pool.risk_score}
                    </Badge>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400 font-sans">
                    No pools in this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 font-sans">
            <span>
              Page {currentPage} of {totalPages} — {filtered.length} pool
              {filtered.length === 1 ? "" : "s"}
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
    </div>
  );
}
