import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";

const FEATURES = [
  {
    name: "LP Quality Monitor",
    desc: "Scans every pool on Robinhood Chain and flags the sketchy ones — thin liquidity, wash-trading volume, whatever smells off.",
  },
  {
    name: "Imposter Ticker Detector",
    desc: "Catches fake tokens riding on real tickers before you accidentally ape into the wrong contract.",
  },
  {
    name: "Smart Money Tracker",
    desc: "Ranks real wallets by real holdings in real traded tokens — not stablecoins, not dust. See who's buying and who's dumping.",
  },
  {
    name: "the heatmap (Volume Heatmap)",
    desc: "Day-by-hour volume grid so you know exactly when the chain actually gets busy, instead of guessing.",
  },
];

export default function AboutPage() {
  return (
    <>
      <MarketingNav />
      <main className="px-4 md:px-16 py-12 max-w-3xl mx-auto">
        <p className="mono text-xs font-semibold text-[#B45309] mb-2">ABOUT</p>
        <h1 className="text-4xl font-black tracking-tight mb-4">what is popnorc?</h1>
        <p className="text-gray-500 leading-relaxed mb-10">
          popnorc watches robinhood chain so you don&apos;t have to squint at a block
          explorer at 3am. no fake win-rates, no made-up scores — just real on-chain
          data, labeled honestly, so you can make your own call before you ape in.
        </p>

        <h2 className="text-xl font-bold mb-4">the 4 things it does</h2>
        <div className="space-y-4 mb-12">
          {FEATURES.map((f) => (
            <div key={f.name} className="border border-[#E4E4E7] rounded-xl p-5">
              <p className="font-semibold mb-1">{f.name}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold mb-4">built for bots and agents too</h2>
        <p className="text-gray-500 leading-relaxed mb-4">
          everything popnorc tracks is also exposed as a free, read-only public API —
          no key, no signup, CORS wide open. if you&apos;re building a trading bot, an
          AI agent, or just want to pull the raw numbers into your own dashboard, hit{" "}
          <code className="mono text-sm bg-[#FAFAFA] border border-[#E4E4E7] rounded px-1.5 py-0.5">
            popnorc.xyz/api/v1
          </code>{" "}
          directly.
        </p>
        <p className="text-gray-500 leading-relaxed mb-10">
          same data the dashboard shows you — pools, tokens, wallets, hourly volume —
          straight from robinhood chain, refreshed on a schedule, no scraping required.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/docs"
            className="px-5 py-3 rounded-full bg-[#0A0A0B] text-white text-sm font-semibold"
          >
            read the API docs →
          </Link>
          <Link
            href="/dashboard/lp"
            className="px-5 py-3 rounded-full border border-[#E4E4E7] text-sm font-semibold"
          >
            launch the app
          </Link>
        </div>
      </main>
    </>
  );
}
