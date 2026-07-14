"use client";

import { useMemo, useState } from "react";
import { AddressModal, useAddressModal } from "@/components/dashboard/address-modal";

export interface WalletNode {
  address: string;
  holdingsUsd: number;
}

export interface WalletEdge {
  source: string;
  target: string;
  tokens: string[];
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Bubble radius scales with holdings value, clamped to a readable range.
function bubbleRadius(holdingsUsd: number, maxHoldings: number): number {
  if (maxHoldings <= 0) return 10;
  const ratio = Math.sqrt(Math.max(holdingsUsd, 0) / maxHoldings);
  return 8 + ratio * 22;
}

const WIDTH = 640;
const HEIGHT = 420;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

export function WalletBubbleMap({ nodes, edges }: { nodes: WalletNode[]; edges: WalletEdge[] }) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const addressModal = useAddressModal();

  // Only show wallets that actually have at least one connection — an
  // isolated bubble with no edges doesn't tell you anything about shared
  // positioning, so it'd just be visual noise.
  const connectedAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const edge of edges) {
      set.add(edge.source);
      set.add(edge.target);
    }
    return set;
  }, [edges]);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => connectedAddresses.has(n.address)),
    [nodes, connectedAddresses]
  );

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const radius = Math.min(WIDTH, HEIGHT) / 2 - 50;
    visibleNodes.forEach((node, i) => {
      const angle = (i / Math.max(visibleNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      map.set(node.address, {
        x: CENTER_X + radius * Math.cos(angle),
        y: CENTER_Y + radius * Math.sin(angle),
      });
    });
    return map;
  }, [visibleNodes]);

  const maxHoldings = Math.max(0, ...visibleNodes.map((n) => n.holdingsUsd));

  const activeEdges = useMemo(
    () =>
      activeAddress
        ? edges.filter((e) => e.source === activeAddress || e.target === activeAddress)
        : [],
    [edges, activeAddress]
  );

  const activeNeighborAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const e of activeEdges) {
      set.add(e.source);
      set.add(e.target);
    }
    return set;
  }, [activeEdges]);

  if (visibleNodes.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-1">whale overlap map</h2>
        <p className="text-xs text-gray-400 py-10 text-center">
          no shared positions yet — this fills in once two or more tracked wallets hold the same
          token.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-4 md:p-6">
      <h2 className="text-sm font-semibold mb-1">whale overlap map</h2>
      <p className="text-xs text-gray-400 mb-4">
        lines connect wallets holding the same token · tap a wallet to see its overlaps
      </p>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full min-w-[560px]"
          style={{ maxHeight: 420 }}
        >
          {edges.map((edge, i) => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;
            const isActive =
              activeAddress && (edge.source === activeAddress || edge.target === activeAddress);
            const isDimmed = activeAddress && !isActive;
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isActive ? "#F5A623" : "#D4D4D8"}
                strokeWidth={isActive ? 2 : 1}
                opacity={isDimmed ? 0.15 : isActive ? 0.9 : 0.5}
              />
            );
          })}

          {visibleNodes.map((node) => {
            const pos = positions.get(node.address);
            if (!pos) return null;
            const r = bubbleRadius(node.holdingsUsd, maxHoldings);
            const isActive = activeAddress === node.address;
            const isNeighbor = activeAddress && activeNeighborAddresses.has(node.address);
            const isDimmed = activeAddress && !isActive && !isNeighbor;

            return (
              <g
                key={node.address}
                className="cursor-pointer"
                opacity={isDimmed ? 0.3 : 1}
                onClick={() =>
                  setActiveAddress(activeAddress === node.address ? null : node.address)
                }
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={isActive ? "#F5A623" : "#0A0A0B"}
                  stroke={isActive ? "#B45309" : "#E4E4E7"}
                  strokeWidth={isActive ? 2 : 1}
                />
                <text
                  x={pos.x}
                  y={pos.y + r + 12}
                  textAnchor="middle"
                  className="mono"
                  fontSize="9"
                  fill="#6B7280"
                >
                  {shortenAddress(node.address)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {activeAddress && (
        <div className="mt-4 border-t border-[#E4E4E7] pt-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => addressModal.open("wallet", activeAddress)}
              className="mono text-sm text-[#B45309] hover:underline"
            >
              {shortenAddress(activeAddress)}
            </button>
            <button
              onClick={() => setActiveAddress(null)}
              className="text-xs text-gray-400 hover:text-black"
            >
              clear
            </button>
          </div>
          {activeEdges.length === 0 ? (
            <p className="text-xs text-gray-400">no overlaps for this wallet.</p>
          ) : (
            <div className="space-y-1.5">
              {activeEdges.map((edge, i) => {
                const other = edge.source === activeAddress ? edge.target : edge.source;
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <button
                      onClick={() => addressModal.open("wallet", other)}
                      className="mono text-gray-600 hover:underline hover:text-[#B45309]"
                    >
                      {shortenAddress(other)}
                    </button>
                    <span className="text-gray-400">shares {edge.tokens.join(", ")}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AddressModal state={addressModal.state} onClose={addressModal.close} />
    </div>
  );
}
