import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";
import { TickerTape, TickerItem } from "@/components/marketing/ticker-tape";
import { supabase } from "@/lib/supabase/client";
import { Pool, Token, WalletActivity } from "@/types/database";

export const dynamic = "force-dynamic";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

async function buildTickerItems(): Promise<TickerItem[]> {
  const [{ data: gainers }, { data: losers }, { data: imposters }, { data: activity }] =
    await Promise.all([
      supabase
        .from("pools")
        .select("base_token_symbol, price_change_24h")
        .not("price_change_24h", "is", null)
        // Cap at a sane range — pools with near-zero starting prices can
        // produce absurd percentage swings (e.g. new listings) that aren't
        // meaningful "gainer" signals.
        .lte("price_change_24h", 1000)
        .gte("price_change_24h", -100)
        .order("price_change_24h", { ascending: false })
        .limit(3),
      supabase
        .from("pools")
        .select("base_token_symbol, liquidity_usd")
        .eq("category", "rwa")
        .order("liquidity_usd", { ascending: true })
        .limit(2),
      supabase
        .from("tokens")
        .select("symbol, flagged_reason")
        .eq("verification_status", "imposter")
        .order("created_at", { ascending: false })
        .limit(2),
      supabase
        .from("wallet_activity")
        .select("wallet_address, action, token_symbol, amount_usd")
        .eq("action", "buy")
        .order("occurred_at", { ascending: false })
        .limit(3),
    ]);

  const items: TickerItem[] = [];

  for (const p of (gainers || []) as Pick<Pool, "base_token_symbol" | "price_change_24h">[]) {
    if (!p.base_token_symbol || p.price_change_24h === null) continue;
    const positive = p.price_change_24h >= 0;
    items.push({
      text: `$${p.base_token_symbol} ${positive ? "+" : ""}${p.price_change_24h.toFixed(1)}%`,
      tone: positive ? "emerald" : "red",
    });
  }

  for (const t of (imposters || []) as Pick<Token, "symbol" | "flagged_reason">[]) {
    items.push({ text: `$${t.symbol} ⚠ IMPOSTER`, tone: "red" });
  }

  for (const a of (activity || []) as Pick<
    WalletActivity,
    "wallet_address" | "action" | "token_symbol" | "amount_usd"
  >[]) {
    if (!a.token_symbol) continue;
    items.push({
      text: `${shortenAddress(a.wallet_address)} bought $${a.token_symbol} (${formatUsd(
        a.amount_usd || 0
      )})`,
      tone: "gray",
    });
  }

  for (const p of (losers || []) as Pick<Pool, "base_token_symbol" | "liquidity_usd">[]) {
    if (!p.base_token_symbol || p.liquidity_usd === null) continue;
    items.push({
      text: `$${p.base_token_symbol} ⚠ liquidity ${formatUsd(p.liquidity_usd)}`,
      tone: "red",
    });
  }

  return items;
}

export default async function HomePage() {
  const { data: pools } = await supabase.from("pools").select("liquidity_usd, volume_24h_usd");
  const { data: imposters } = await supabase
    .from("tokens")
    .select("id")
    .eq("verification_status", "imposter");
  const tickerItems = await buildTickerItems();

  const poolCount = pools?.length ?? 0;
  const imposterCount = imposters?.length ?? 0;
  const totalVolume = (pools || []).reduce((sum, p) => sum + Number(p.volume_24h_usd || 0), 0);

  function formatVolume(value: number): string {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${value.toFixed(0)}`;
  }

  return (
    <>
      <TickerTape items={tickerItems} />
      <MarketingNav />

      {/* Hero */}
      <section className="relative px-8 md:px-16 pt-8 pb-4">
        <div className="glow-orb absolute -top-20 -left-20 w-96 h-96 pointer-events-none" />
        <div className="grid md:grid-cols-12 gap-10 items-center relative">
          <div className="md:col-span-6">
            <p className="mono text-xs font-semibold text-[#B45309] mb-4 tracking-wide">
              ◆ LIVE ON ROBINHOOD CHAIN
            </p>
            <h1 className="text-6xl md:text-7xl font-black tracking-tight leading-[0.95] mb-6">
              Don&apos;t get
              <br />
              <span className="relative inline-block">
                rekt.
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="14"
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0,10 Q50,0 100,8 T200,6"
                    stroke="#F5A623"
                    strokeWidth="6"
                    fill="none"
                  />
                </svg>
              </span>
              <br />
              Watch first.
            </h1>
            <p className="text-lg text-gray-500 max-w-md mb-8 leading-relaxed">
              Popnorc watches every pool, ticker, and whale wallet on Robinhood Chain in
              real time — so you know before you ape in.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/lp"
                className="px-6 py-3.5 rounded-full bg-[#0A0A0B] text-white text-sm font-semibold"
              >
                Launch App →
              </Link>
              <span className="text-xs text-gray-400 mono">no wallet connect needed</span>
            </div>
          </div>

          <div className="md:col-span-6 relative">
            <div className="rounded-2xl overflow-hidden border border-[#E4E4E7] shadow-2xl bg-[#0A0A0B]">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#1F1F22]">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                <span className="ml-3 text-[10px] text-gray-500 mono">popnorc.com/app</span>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-gray-400 font-medium">LP Quality Monitor</span>
                  <span className="text-[10px] mono text-emerald-400">● live</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-[#151517] rounded-lg px-3 py-2.5 text-xs">
                    <span className="text-white font-medium mono">$TSLA-hood</span>
                    <span className="text-emerald-400 mono">✓ 12</span>
                    <span className="text-gray-500 mono">$1.8M</span>
                  </div>
                  <div className="flex items-center justify-between bg-[#151517] rounded-lg px-3 py-2.5 text-xs">
                    <span className="text-white font-medium mono">$POPFROG</span>
                    <span className="text-amber-400 mono">~ 58</span>
                    <span className="text-gray-500 mono">$92K</span>
                  </div>
                  <div className="flex items-center justify-between bg-red-500/10 rounded-lg px-3 py-2.5 text-xs border border-red-500/20">
                    <span className="text-red-400 font-medium mono">$TSLA-hoodz</span>
                    <span className="text-red-400 mono">⚠ 91</span>
                    <span className="text-gray-500 mono">$8K</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 -z-10 w-full h-full rounded-2xl bg-[#FEF3E2] hidden md:block" />
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-3 gap-4">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-5">
            <p className="text-2xl font-bold mono">{poolCount}</p>
            <p className="text-xs text-gray-500 mt-1">Pools tracked</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-5">
            <p className="text-2xl font-bold mono text-red-600">{imposterCount}</p>
            <p className="text-xs text-gray-500 mt-1">Imposters flagged</p>
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-5">
            <p className="text-2xl font-bold mono text-[#B45309]">{formatVolume(totalVolume)}</p>
            <p className="text-xs text-gray-500 mt-1">24h volume watched</p>
          </div>
        </div>
      </section>

      {/* Bento features */}
      <section id="features" className="px-8 md:px-16 py-24">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-2xl bg-[#0A0A0B] text-white p-8 flex flex-col justify-between min-h-[220px]">
            <div>
              <span className="text-2xl">💧</span>
              <h3 className="text-2xl font-bold mt-4 mb-2">LP Quality Monitor</h3>
              <p className="text-gray-400 text-sm max-w-sm">
                Risk scoring and historical liquidity for every pool. Sortable, filterable,
                real-time.
              </p>
            </div>
            <span className="mono text-[10px] text-[#F5A623] mt-6">
              {poolCount} pools tracked →
            </span>
          </div>
          <div className="rounded-2xl bg-[#FEF3E2] p-8 flex flex-col justify-between min-h-[220px]">
            <div>
              <span className="text-2xl">🛡️</span>
              <h3 className="text-xl font-bold mt-4 mb-2">Imposter Detector</h3>
              <p className="text-gray-600 text-sm">
                Verified badge on every token. Never confuse the real one for a scam.
              </p>
            </div>
            <span className="mono text-[10px] text-[#B45309] mt-6">
              {imposterCount} flagged this week →
            </span>
          </div>
          <div className="rounded-2xl bg-[#F0F0F1] p-8 flex flex-col justify-between min-h-[220px]">
            <div>
              <span className="text-2xl">🐳</span>
              <h3 className="text-xl font-bold mt-4 mb-2">Smart Money Tracker</h3>
              <p className="text-gray-600 text-sm">
                Leaderboard of whale wallets and what they&apos;re holding.
              </p>
            </div>
            <span className="mono text-[10px] text-gray-500 mt-6">Top traders, ranked →</span>
          </div>
          <div className="md:col-span-2 rounded-2xl border border-[#E4E4E7] p-8 flex flex-col justify-between min-h-[220px]">
            <div>
              <span className="text-2xl">🔥</span>
              <h3 className="text-xl font-bold mt-4 mb-2">Volume Heatmap</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Busiest hours per token and pool. Crypto-native vs stock-token, broken down
                clearly.
              </p>
            </div>
            <span className="mono text-[10px] text-gray-400 mt-6">7-day rolling window →</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 md:px-16 pb-24 text-center">
        <h2 className="text-4xl font-black tracking-tight mb-3">Grab your seat.</h2>
        <p className="text-gray-500 mb-8">Free, real-time, no noise.</p>
        <Link
          href="/dashboard/lp"
          className="inline-block px-8 py-4 rounded-full bg-[#F5A623] text-black text-sm font-bold"
        >
          Launch App →
        </Link>
      </section>

      <footer className="border-t border-[#F0F0F1] px-8 md:px-16 py-6 flex items-center justify-between text-xs text-gray-400">
        <span className="mono">© 2026 Popnorc</span>
        <span>Not financial advice · DYOR</span>
      </footer>
    </>
  );
}

