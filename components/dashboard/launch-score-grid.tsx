"use client";

import { useState } from "react";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function intensityColor(score: number, max: number): string {
  if (max === 0) return "#1c1c1c";
  const ratio = score / max;
  if (ratio < 0.05) return "#1c1c1c";
  if (ratio < 0.3) return "#14442f";
  if (ratio < 0.65) return "#1c7a4f";
  return "#34D399";
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
  deploymentCount: number;
  launchScore: number;
}

export interface LaunchScoreGridEntry {
  dayOfWeek: number;
  hourOfDay: number;
  totalVolumeUsd: number;
  deploymentCount: number;
  launchScore: number;
}

// Grid version of the launch-window data — same 7x24 layout as the volume
// heatmap, but cell intensity is driven by launch_score (volume ÷
// competing launches) instead of raw volume, so a quiet-but-uncontested
// hour can visually stand out even if its dollar volume is modest.
export function LaunchScoreGrid({ entries }: { entries: LaunchScoreGridEntry[] }) {
  const [selected, setSelected] = useState<Cell | null>(null);

  const grid: Record<string, LaunchScoreGridEntry> = {};
  for (const e of entries) {
    grid[`${e.dayOfWeek}-${e.hourOfDay}`] = e;
  }

  const maxScore = Math.max(0, ...entries.map((e) => e.launchScore));

  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  let peakKey = "";
  let peakScore = 0;
  for (const [key, e] of Object.entries(grid)) {
    if (e.launchScore > peakScore) {
      peakScore = e.launchScore;
      peakKey = key;
    }
  }

  return (
    <div className="relative bg-[#0A0A0B] rounded-xl p-5 -m-6">
      <div className="flex gap-2 mb-3 pl-12">
        <span className="flex-1 flex justify-between text-[10px] text-gray-500 mono">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>{i * 3}h</span>
          ))}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg">
        <div className="space-y-2">
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center gap-1.5">
              <span className="w-9 text-xs text-gray-400 mono">{day}</span>
              <div className="flex-1 flex gap-1.5 py-1">
                {Array.from({ length: 24 }, (_, hour) => {
                  const key = `${dayIndex}-${hour}`;
                  const entry = grid[key];
                  const score = entry?.launchScore || 0;
                  const isSelected = selected?.day === dayIndex && selected?.hour === hour;
                  const isNow = dayIndex === currentDay && hour === currentHour;
                  const isPeak = key === peakKey && peakScore > 0;

                  return (
                    <button
                      key={hour}
                      onClick={() =>
                        setSelected({
                          day: dayIndex,
                          hour,
                          volume: entry?.totalVolumeUsd || 0,
                          deploymentCount: entry?.deploymentCount || 0,
                          launchScore: score,
                        })
                      }
                      className={`flex-1 rounded transition-colors hover:z-10 hover:brightness-125 ${
                        isNow ? "now-cell" : ""
                      }`}
                      style={{
                        height: "22px",
                        background: intensityColor(score, maxScore),
                        outline: isSelected ? "2px solid #34D399" : "none",
                        outlineOffset: "1px",
                        boxShadow: isPeak ? "0 0 12px 2px rgba(52, 211, 153, 0.55)" : "none",
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
            <p className="mono text-emerald-400 text-2xl font-bold mt-2">
              {formatUsd(selected.volume)}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {selected.deploymentCount} launch{selected.deploymentCount === 1 ? "" : "es"} competing
              · last 7 days
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-5 justify-end text-xs text-gray-500">
        <span>bad window</span>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#1c1c1c" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#14442f" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#1c7a4f" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#34D399" }} />
        <span>best window</span>
      </div>
    </div>
  );
}
