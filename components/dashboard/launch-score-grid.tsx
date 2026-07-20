"use client";

import { useState } from "react";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MIN_SAMPLE_SIZE = 5;

function intensityColor(rate: number, hasEnoughData: boolean): string {
  if (!hasEnoughData) return "#1c1c1c";
  if (rate < 0.05) return "#1c1c1c";
  if (rate < 0.15) return "#14442f";
  if (rate < 0.3) return "#1c7a4f";
  return "#34D399";
}

interface Cell {
  day: number;
  hour: number;
  deploymentCount: number;
  graduatedCount: number;
  graduationRate: number;
}

export interface LaunchScoreGridEntry {
  dayOfWeek: number;
  hourOfDay: number;
  deploymentCount: number;
  graduatedCount: number;
  graduationRate: number;
}

// Grid version of the launch-window data — same 7x24 layout as the volume
// heatmap, but cell intensity is driven by actual graduation_rate
// (graduated ÷ deployed) instead of raw volume, so hours that reliably
// produce successful launches stand out, not just busy hours.
export function LaunchScoreGrid({ entries }: { entries: LaunchScoreGridEntry[] }) {
  const [selected, setSelected] = useState<Cell | null>(null);

  const grid: Record<string, LaunchScoreGridEntry> = {};
  for (const e of entries) {
    grid[`${e.dayOfWeek}-${e.hourOfDay}`] = e;
  }

  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  let peakKey = "";
  let peakRate = 0;
  for (const [key, e] of Object.entries(grid)) {
    if (e.deploymentCount >= MIN_SAMPLE_SIZE && e.graduationRate > peakRate) {
      peakRate = e.graduationRate;
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
                  const hasEnoughData = (entry?.deploymentCount || 0) >= MIN_SAMPLE_SIZE;
                  const rate = entry?.graduationRate || 0;
                  const isSelected = selected?.day === dayIndex && selected?.hour === hour;
                  const isNow = dayIndex === currentDay && hour === currentHour;
                  const isPeak = key === peakKey && peakRate > 0;

                  return (
                    <button
                      key={hour}
                      onClick={() =>
                        setSelected({
                          day: dayIndex,
                          hour,
                          deploymentCount: entry?.deploymentCount || 0,
                          graduatedCount: entry?.graduatedCount || 0,
                          graduationRate: rate,
                        })
                      }
                      className={`flex-1 rounded transition-colors hover:z-10 hover:brightness-125 ${
                        isNow ? "now-cell" : ""
                      }`}
                      style={{
                        height: "22px",
                        background: intensityColor(rate, hasEnoughData),
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
              {(selected.graduationRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {selected.graduatedCount}/{selected.deploymentCount} tokens graduated · last 7
              days
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-5 justify-end text-xs text-gray-500">
        <span>low graduation</span>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#1c1c1c" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#14442f" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#1c7a4f" }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: "#34D399" }} />
        <span>high graduation</span>
      </div>
    </div>
  );
}
