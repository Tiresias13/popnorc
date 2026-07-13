export interface TickerItem {
  text: string;
  tone: "emerald" | "red" | "gray";
}

const TONE_CLASS: Record<TickerItem["tone"], string> = {
  emerald: "text-emerald-400",
  red: "text-red-400",
  gray: "text-gray-400",
};

const FALLBACK_ITEMS: TickerItem[] = [
  { text: "Popnorc is watching Robinhood Chain — data loads as pools sync", tone: "gray" },
];

export function TickerTape({ items }: { items: TickerItem[] }) {
  const source = items.length > 0 ? items : FALLBACK_ITEMS;
  const looped = [...source, ...source];

  return (
    <div className="bg-[#0A0A0B] text-white overflow-hidden border-b border-black">
      <div className="marquee py-2 text-xs mono">
        {looped.map((item, i) => (
          <span key={i} className={`px-6 shrink-0 ${TONE_CLASS[item.tone]}`}>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

