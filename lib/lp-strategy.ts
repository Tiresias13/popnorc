import { Pool } from "@/types/database";

// Default swap fee tier assumptions by DEX, since GeckoTerminal's pools
// endpoint doesn't expose the exact fee tier per pool. These are the most
// common tier for each protocol on Robinhood Chain.
const FEE_TIER_BY_DEX: Record<string, number> = {
  "uniswap-v2": 0.003,
  "uniswap-v3": 0.003,
  "uniswap-v4": 0.003,
  "pancakeswap-v2": 0.0025,
  "pancakeswap-v3": 0.0025,
  curve: 0.0004,
};
const DEFAULT_FEE_TIER = 0.003;

function feeTierForDex(dexId: string | null): number {
  if (!dexId) return DEFAULT_FEE_TIER;
  return FEE_TIER_BY_DEX[dexId] ?? DEFAULT_FEE_TIER;
}

// Full-range (v2-style) estimated fee APR, based on trailing 24h volume.
// This is a backward-looking estimate, not a forecast — volume can drop.
export function estimateFullRangeApr(pool: Pool): number | null {
  const liquidity = pool.liquidity_usd;
  const volume = pool.volume_24h_usd;
  if (!liquidity || liquidity <= 0 || !volume) return null;

  const feeTier = feeTierForDex(pool.dex_id);
  const dailyFees = volume * feeTier;
  const apr = (dailyFees / liquidity) * 365 * 100;
  return apr;
}

export function poolAgeHours(pool: Pool): number {
  if (!pool.pool_created_at) return Infinity;
  const created = new Date(pool.pool_created_at).getTime();
  return (Date.now() - created) / (1000 * 60 * 60);
}

// Capital efficiency multiplier for a one-sided concentrated liquidity
// position, using Uniswap v3's concentrated liquidity formula:
//   multiplier = 1 / (1 - sqrt(lowerPrice / upperPrice))
// where upperPrice = current price and lowerPrice = current price * (1 - rangePct).
// A narrower range concentrates capital more efficiently (higher fee share
// per dollar deposited) but exits the range faster if price moves down.
export function capitalEfficiencyMultiplier(rangePct: number): number {
  const priceRatio = 1 - rangePct; // lowerPrice / upperPrice
  const denominator = 1 - Math.sqrt(priceRatio);
  if (denominator <= 0) return 1;
  return 1 / denominator;
}

export type LpStrategyKey = "degen" | "mid" | "longterm";

export interface LpStrategyPreset {
  key: LpStrategyKey;
  label: string;
  rangePct: number; // width of the one-sided lower range, e.g. 0.10 = -10%
  description: string;
}

export const LP_STRATEGY_PRESETS: Record<LpStrategyKey, LpStrategyPreset> = {
  degen: {
    key: "degen",
    label: "Degen",
    rangePct: 0.1,
    description: "Newer pools, tighter range, highest fee APR potential, highest risk.",
  },
  mid: {
    key: "mid",
    label: "Mid",
    rangePct: 0.2,
    description: "Established pools with decent depth and a balanced risk/reward range.",
  },
  longterm: {
    key: "longterm",
    label: "Longterm",
    rangePct: 0.3,
    description: "Deep liquidity, low risk score, wider range built for holding.",
  },
};

// Classification thresholds — a pool must clear ALL conditions for a given
// strategy to be listed under that tab. Thresholds get stricter (older pool,
// deeper liquidity, lower risk) as you move from Degen -> Mid -> Longterm.
function qualifiesForDegen(pool: Pool, fullRangeApr: number | null): boolean {
  return (
    pool.risk_level !== "high" &&
    (pool.liquidity_usd ?? 0) >= 5_000 &&
    fullRangeApr !== null &&
    fullRangeApr >= 25
  );
}

function qualifiesForMid(pool: Pool, fullRangeApr: number | null): boolean {
  return (
    pool.risk_level !== "high" &&
    poolAgeHours(pool) >= 72 && // pool at least 3 days old
    (pool.liquidity_usd ?? 0) >= 30_000 &&
    fullRangeApr !== null &&
    fullRangeApr >= 12
  );
}

function qualifiesForLongterm(pool: Pool, fullRangeApr: number | null): boolean {
  return (
    pool.risk_level === "low" &&
    poolAgeHours(pool) >= 336 && // pool at least 14 days old
    (pool.liquidity_usd ?? 0) >= 100_000 &&
    fullRangeApr !== null &&
    fullRangeApr >= 6
  );
}

export interface LpOpportunity {
  pool: Pool;
  minPrice: number | null;
  capitalEfficiency: number;
  estApr: number | null;
  fullRangeApr: number | null;
}

// Returns pools that qualify for a given strategy tab, each annotated with
// a suggested min price and an estimated APR scaled by that strategy's
// concentrated liquidity capital efficiency. Sorted by estimated APR desc.
export function getOpportunitiesForStrategy(pools: Pool[], key: LpStrategyKey): LpOpportunity[] {
  const preset = LP_STRATEGY_PRESETS[key];
  const capitalEfficiency = capitalEfficiencyMultiplier(preset.rangePct);

  const qualifier =
    key === "degen" ? qualifiesForDegen : key === "mid" ? qualifiesForMid : qualifiesForLongterm;

  const opportunities: LpOpportunity[] = [];

  for (const pool of pools) {
    const fullRangeApr = estimateFullRangeApr(pool);
    if (!qualifier(pool, fullRangeApr)) continue;

    const minPrice =
      pool.base_token_price_usd !== null
        ? pool.base_token_price_usd * (1 - preset.rangePct)
        : null;
    const estApr = fullRangeApr !== null ? fullRangeApr * capitalEfficiency : null;

    opportunities.push({ pool, minPrice, capitalEfficiency, estApr, fullRangeApr });
  }

  return opportunities.sort((a, b) => (b.estApr ?? 0) - (a.estApr ?? 0));
}
