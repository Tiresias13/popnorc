const TICKS = [
  { text: "$TSLA-hood +4.2%", tone: "text-emerald-400" },
  { text: "$NVDA-hoodz ⚠ IMPOSTER", tone: "text-red-400" },
  { text: "$POPFROG +112%", tone: "text-emerald-400" },
  { text: "0x7a3f...9e21 bought $AAPL-hood", tone: "text-gray-400" },
  { text: "$AMZN-hood2 ⚠ liquidity 4%", tone: "text-red-400" },
];

export function TickerTape() {
  const items = [...TICKS, ...TICKS];

  return (
    <div className="bg-[#0A0A0B] text-white overflow-hidden border-b border-black">
      <div className="marquee py-2 text-xs mono">
        {items.map((item, i) => (
          <span key={i} className={`px-6 shrink-0 ${item.tone}`}>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
