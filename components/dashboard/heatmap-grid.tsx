"use client";

import { useState } from "react";
import { AddressModal, useAddressModal } from "@/components/dashboard/address-modal";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function intensityColor(volume: number, max: number): string {
  if (max === 0) return "#1c1c1c";
  const ratio = volume / max;
  if (ratio < 0.05) return "#1c1c1c";
  if (ratio < 0.3) return "#5a3d14";
  if (ratio < 0.65) return "#a8701c";
  return "#F5A623";
}

// Cells with more volume render visually bigger, not just brighter — makes
// the busy blocks pop out of the grid instead of just changing shade.
function cellScale(volume: number, max: number): number {
  if (max === 0 || volume <= 0) return 1;
  const ratio = volume / max;
  if (ratio > 0.75) return 1.35;
  if (ratio > 0.4) return 1.15;
  return 1;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface Cell {
  day: number;
  hour: number;
  volume: number;
}

interface Mover {
  walletAddress: string;
  action: string;
  tokenSymbol: string | null;
  amountUsd: number;
}

export function HeatmapGrid({
  grid,
  maxVolume,
  topTokensByCell,
  moverByCell,
}: {
  grid: Record<string, number>;
  maxVolume: number;
  topTokensByCell: Record<string, string[]>;
  moverByCell: Record<string, Mover>;
}) {
  const [selected, setSelected] = useState<Cell | null>(null);
  const addressModal = useAddressModal();

  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  let peakKey = "";
  let peakVolume = 0;
  for (const [key, volume] of Object.entries(grid)) {
    if (volume > peakVolume) {
      peakVolume = volume;
      peakKey = key;
    }
  }

  const selectedKey = selected ? `${selected.day}-${selected.hour}` : null;
  const selectedTokens = selectedKey ? topTokensByCell[selectedKey] : undefined;
  const selectedMover = selectedKey ? moverByCell[selectedKey] : undefined;

  return (
    <div className="relative bg-[#0A0A0B] rounded-xl p-5 -m-6">
      <div className="flex gap-2 mb-3 pl-12">
        <span className="flex-1 flex justify-between text-[10px] text-gray-500 mono">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>{i * 3}h</span>
          ))}
        </span>
      </div>

      {/* Scan line — sweeps left to right continuously to signal the tape
          is being actively watched, not a dead snapshot. */}
      <div className="relative overflow-hidden rounded-lg">
        <div className="scan-line" />

        <div className="space-y-2">
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center gap-1.5">
              <span className="w-9 text-xs text-gray-400 mono">{day}</span>
              <div className="flex-1 flex gap-1.5 py-1">
                {Array.from({ length: 24 }, (_, hour) => {
                  const key = `${dayIndex}-${hour}`;
                  const volume = grid[key] || 0;
                  const isSelected = selected?.day === dayIndex && selected?.hour === hour;
                  const isNow = dayIndex === currentDay && hour === currentHour;
                  const isPeak = key === peakKey && peakVolume > 0;
                  const scale = cellScale(volume, maxVolume);

                  return (
                    <button
                      key={hour}
                      onClick={() => setSelected({ day: dayIndex, hour, volume })}
                      className={`flex-1 rounded transition-all hover:z-10 ${
                        isPeak ? "peak-cell" : ""
                      } ${isNow ? "now-cell" : ""}`}
                      style={{
                        height: "22px",
                        background: intensityColor(volume, maxVolume),
                        transform: `scale(${scale})`,
                        outline: isSelected ? "2px solid #F5A623" : "none",
                        outlineOffset: "1px",
                        boxShadow: isPeak ? "0 0 12px 2px rgba(245, 166, 35, 0.55)" : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#141414] border border-[#232323] text-white rounded-2xl px-6 py-5 shadow-xl text-sm max-w-xs w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-4 text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
            <p className="font-semibold">
              {DAYS[selected.day]} · {selected.hour}:00–{selected.hour + 1}:00 utc
            </p>
            <p className="mono text-[#F5A623] text-2xl font-bold mt-2">
              {formatUsd(selected.volume)}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {selectedTokens && selectedTokens.length > 0
                ? `mostly ${selectedTokens.join(" & ")} · last 7 days`
                : "no dominant token yet · last 7 days"}
            </p>

            <div className="border-t border-[#232323] mt-4 pt-4">
              {selectedMover ? (
                <>
                  <p className="text-xs text-gray-500 mb-1.5">biggest mover</p>
                  <button
                    onClick={() => addressModal.open("wallet", selectedMover.walletAddress)}
                    className="mono text-sm text-[#F5A623] hover:underline"
                  >
                    {shortenAddress(selectedMover.walletAddress)}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedMover.action} ${formatUsd(selectedMover.amountUsd)}{" "}
                    {selectedMover.tokenSymbol ?? ""}
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-500">no wallet activity tracked for this hour yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-5 justify-end text-xs text-gray-500">
        <span>quiet tape</span>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#1c1c1c" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#5a3d14" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#a8701c" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#F5A623" }} />
        <span>busy tape</span>
      </div>

      <AddressModal state={addressModal.state} onClose={addressModal.close} />
    </div>
  );
}

