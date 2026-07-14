"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AddressModal, useAddressModal } from "@/components/dashboard/address-modal";

export interface WalletNode {
  address: string;
  holdingsUsd: number;
  heldTokens: string[];
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

// Simple deterministic pseudo-random generator seeded by address, so the
// scattered layout + float animation phase stays stable across re-renders
// (no layout "jump" every time React re-renders the component).
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

const WIDTH = 640;
const HEIGHT = 420;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD = 4;
const MARGIN = 40;

export function WalletBubbleMap({ nodes, edges }: { nodes: WalletNode[]; edges: WalletEdge[] }) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragPositions, setDragPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const [floatOffsets, setFloatOffsets] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragState = useRef<{
    address: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const pinchState = useRef<{ startDist: number; startZoom: number } | null>(null);
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

  const nodeByAddress = useMemo(() => {
    const map = new Map<string, WalletNode>();
    for (const n of visibleNodes) map.set(n.address, n);
    return map;
  }, [visibleNodes]);

  const maxHoldings = Math.max(0, ...visibleNodes.map((n) => n.holdingsUsd));

  // Organic scatter layout with basic overlap avoidance — deterministic per
  // wallet address so it doesn't reshuffle on every render, but reads as
  // "randomly placed" rather than a perfect circle.
  const basePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const placed: { x: number; y: number; r: number }[] = [];
    for (const node of visibleNodes) {
      const rand = seededRandom(node.address);
      const r = bubbleRadius(node.holdingsUsd, maxHoldings);
      let x = CENTER_X;
      let y = CENTER_Y;
      for (let attempt = 0; attempt < 40; attempt++) {
        x = MARGIN + r + rand() * (WIDTH - 2 * (MARGIN + r));
        y = MARGIN + r + rand() * (HEIGHT - 2 * (MARGIN + r));
        const collides = placed.some(
          (p) => Math.hypot(x - p.x, y - p.y) < p.r + r + 6
        );
        if (!collides) break;
      }
      map.set(node.address, { x, y });
      placed.push({ x, y, r });
    }
    return map;
  }, [visibleNodes, maxHoldings]);

  // Per-wallet float animation parameters (phase/speed/amplitude),
  // deterministic per address.
  const floatParams = useMemo(() => {
    const map = new Map<string, { phase: number; speed: number; amp: number }>();
    for (const node of visibleNodes) {
      const rand = seededRandom(`float-${node.address}`);
      map.set(node.address, {
        phase: rand() * Math.PI * 2,
        speed: 0.5 + rand() * 0.5,
        amp: 3 + rand() * 4,
      });
    }
    return map;
  }, [visibleNodes]);

  // Gentle idle float loop — each bubble drifts slowly around its anchor
  // point, pausing while it's being dragged.
  useEffect(() => {
    let frame: number;
    let t = 0;
    function tick() {
      t += 0.016;
      setFloatOffsets(() => {
        const next = new Map<string, { x: number; y: number }>();
        for (const node of visibleNodes) {
          if (dragState.current?.address === node.address) continue;
          const params = floatParams.get(node.address);
          if (!params) continue;
          next.set(node.address, {
            x: Math.sin(t * params.speed + params.phase) * params.amp,
            y: Math.cos(t * params.speed * 0.8 + params.phase) * params.amp,
          });
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visibleNodes, floatParams]);

  function getPosition(address: string): { x: number; y: number } {
    const dragged = dragPositions.get(address);
    if (dragged) return dragged;
    const base = basePositions.get(address) ?? { x: CENTER_X, y: CENTER_Y };
    const float = floatOffsets.get(address) ?? { x: 0, y: 0 };
    return { x: base.x + float.x, y: base.y + float.y };
  }

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

  function handlePointerDown(e: React.PointerEvent, address: string) {
    e.stopPropagation();
    const pos = getPosition(address);
    dragState.current = {
      address,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: pos.x,
      startY: pos.y,
      moved: false,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / zoom / rect.width;
    const scaleY = HEIGHT / zoom / rect.height;

    const dxClient = e.clientX - drag.startClientX;
    const dyClient = e.clientY - drag.startClientY;

    if (!drag.moved && Math.hypot(dxClient, dyClient) > DRAG_THRESHOLD) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const dx = dxClient * scaleX;
    const dy = dyClient * scaleY;

    setDragPositions((prev) => {
      const next = new Map(prev);
      next.set(drag.address, { x: drag.startX + dx, y: drag.startY + dy });
      return next;
    });
  }

  function handlePointerUp(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved) {
      // A tap/click without a drag — toggle the highlight.
      setActiveAddress((current) => (current === drag.address ? null : drag.address));
    }
    dragState.current = null;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  }

  function handleTouchStartCapture(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchState.current = { startDist: dist, startZoom: zoom };
    }
  }

  function handleTouchMoveCapture(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchState.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / pinchState.current.startDist;
      setZoom(
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(pinchState.current.startZoom * ratio).toFixed(2)))
      );
    }
  }

  function handleTouchEndCapture(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchState.current = null;
  }

  if (visibleNodes.length === 0) {
    return (
      <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">whale overlap map</h2>
        <p className="text-xs text-gray-500 py-10 text-center">
          no shared positions yet — this fills in once two or more tracked wallets hold the same
          token.
        </p>
      </div>
    );
  }

  const viewBoxWidth = WIDTH / zoom;
  const viewBoxHeight = HEIGHT / zoom;
  const viewBoxX = CENTER_X - viewBoxWidth / 2;
  const viewBoxY = CENTER_Y - viewBoxHeight / 2;

  const activeNode = activeAddress ? nodeByAddress.get(activeAddress) : undefined;

  return (
    <div className="bg-[#131315] border border-[#1F1F22] rounded-xl p-4 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white">whale overlap map</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.2).toFixed(2)))}
            className="w-6 h-6 rounded bg-[#1F1F22] text-gray-300 text-xs hover:text-white"
            aria-label="zoom out"
          >
            −
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.2).toFixed(2)))}
            className="w-6 h-6 rounded bg-[#1F1F22] text-gray-300 text-xs hover:text-white"
            aria-label="zoom in"
          >
            +
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        lines connect wallets holding the same token · drag bubbles apart · tap to see what they
        hold · pinch or scroll to zoom
      </p>

      <svg
        ref={svgRef}
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full touch-none select-none"
        style={{ maxHeight: 420 }}
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStartCapture={handleTouchStartCapture}
        onTouchMoveCapture={handleTouchMoveCapture}
        onTouchEndCapture={handleTouchEndCapture}
      >
        {edges.map((edge, i) => {
          const from = getPosition(edge.source);
          const to = getPosition(edge.target);
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
              stroke={isActive ? "#F5A623" : "#3F3F46"}
              strokeWidth={isActive ? 2 : 1}
              opacity={isDimmed ? 0.15 : isActive ? 0.9 : 0.5}
            />
          );
        })}

        {visibleNodes.map((node) => {
          const pos = getPosition(node.address);
          const r = bubbleRadius(node.holdingsUsd, maxHoldings);
          const isActive = activeAddress === node.address;
          const isNeighbor = activeAddress && activeNeighborAddresses.has(node.address);
          const isDimmed = activeAddress && !isActive && !isNeighbor;

          return (
            <g
              key={node.address}
              className="cursor-grab active:cursor-grabbing"
              opacity={isDimmed ? 0.3 : 1}
              onPointerDown={(e) => handlePointerDown(e, node.address)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={isActive ? "#FFC15E" : "#F5A623"}
                stroke={isActive ? "#FFDFA6" : "#B45309"}
                strokeWidth={isActive ? 2.5 : 1}
                style={{
                  filter: isActive ? "drop-shadow(0 0 8px rgba(245,166,35,0.85))" : "none",
                }}
              />
              <text
                x={pos.x}
                y={pos.y + r + 12}
                textAnchor="middle"
                className="mono"
                fontSize="9"
                fill="#9CA3AF"
              >
                {shortenAddress(node.address)}
              </text>
            </g>
          );
        })}
      </svg>

      {activeAddress && activeNode && (
        <div className="mt-4 border-t border-[#1F1F22] pt-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => addressModal.open("wallet", activeAddress)}
              className="mono text-sm text-[#F5A623] hover:underline"
            >
              {shortenAddress(activeAddress)}
            </button>
            <button
              onClick={() => setActiveAddress(null)}
              className="text-xs text-gray-500 hover:text-white"
            >
              clear
            </button>
          </div>

          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
            holding right now
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {activeNode.heldTokens.length > 0 ? (
              activeNode.heldTokens.map((symbol) => (
                <span
                  key={symbol}
                  className="text-[11px] font-medium px-2 py-1 rounded-md bg-[#1F1F22] text-gray-200"
                >
                  {symbol}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500">no holdings data.</span>
            )}
          </div>

          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">overlaps with</p>
          {activeEdges.length === 0 ? (
            <p className="text-xs text-gray-500">no overlaps for this wallet.</p>
          ) : (
            <div className="space-y-1.5">
              {activeEdges.map((edge, i) => {
                const other = edge.source === activeAddress ? edge.target : edge.source;
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <button
                      onClick={() => addressModal.open("wallet", other)}
                      className="mono text-gray-400 hover:underline hover:text-[#F5A623]"
                    >
                      {shortenAddress(other)}
                    </button>
                    <span className="text-gray-500">shares {edge.tokens.join(", ")}</span>
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
