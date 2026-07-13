"use client";

import { useState } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function intensityColor(volume: number, max: number): string {
  if (max === 0) return "#F1F1F2";
  const ratio = volume / max;
  if (ratio < 0.05) return "#F1F1F2";
  if (ratio < 0.25) return "#4a2f0d";
  if (ratio < 0.5) return "#8a5a12";
  if (ratio < 0.75) return "#d38a18";
  return "#F5A623";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

interface Cell {
  day: number;
  hour: number;
  volume: number;
}

export function HeatmapGrid({ grid, maxVolume }: { grid: Record<string, number>; maxVolume: number }) {
  const [selected, setSelected] = useState<Cell | null>(null);

  return (
    <div className="relative">
      <div className="flex gap-2 mb-2 pl-14">
        <span className="flex-1 flex justify-between text-[10px] text-gray-400 mono">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>{i * 3}h</span>
          ))}
        </span>
      </div>
      <div className="space-y-1.5">
        {DAYS.map((day, dayIndex) => (
          <div key={day} className="flex items-center gap-1.5">
            <span className="w-10 text-xs text-gray-500 mono">{day}</span>
            <div className="flex-1 flex gap-1.5">
              {Array.from({ length: 24 }, (_, hour) => {
                const volume = grid[`${dayIndex}-${hour}`] || 0;
                const isSelected = selected?.day === dayIndex && selected?.hour === hour;
                return (
                  <button
                    key={hour}
                    onClick={() => setSelected({ day: dayIndex, hour, volume })}
                    className="flex-1 rounded transition-transform hover:scale-110 hover:z-10"
                    style={{
                      height: "22px",
                      background: intensityColor(volume, maxVolume),
                      outline: isSelected ? "2px solid #F5A623" : "none",
                      outlineOffset: "1px",
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-40" onClick={() => setSelected(null)}>
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#0A0A0B] text-white rounded-xl px-5 py-3 shadow-xl text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold">
              {DAYS[selected.day]} {selected.hour}:00–{selected.hour + 1}:00 UTC
            </p>
            <p className="mono text-[#F5A623] text-lg font-bold mt-1">
              {formatUsd(selected.volume)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Volume traded in this hour, last 7 days</p>
            <button
              onClick={() => setSelected(null)}
              className="absolute top-2 right-2 text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-5 justify-end text-xs text-gray-500">
        <span>Less</span>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#F1F1F2" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#4a2f0d" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#8a5a12" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#d38a18" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#F5A623" }} />
        <span>More</span>
      </div>
    </div>
  );
}
