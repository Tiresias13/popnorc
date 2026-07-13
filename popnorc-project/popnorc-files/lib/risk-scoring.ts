import { RiskLevel, TokenCategory } from "@/types/database";

// Known official Robinhood tokenized-stock ticker suffixes.
// Real symbols follow the pattern SYMBOL-hood (e.g. TSLA-hood, AAPL-hood).
// Anything close to this pattern but not an exact match is treated as a
// potential imposter and flagged for review.
const OFFICIAL_RWA_SUFFIX = "-hood";
const KNOWN_RWA_TICKERS = [
  "TSLA-hood",
  "AAPL-hood",
  "NVDA-hood",
  "AMZN-hood",
  "GOOGL-hood",
  "MSFT-hood",
  "META-hood",
];

export function categorizeToken(symbol: string): TokenCategory {
  if (symbol.endsWith(OFFICIAL_RWA_SUFFIX)) return "rwa";
  return "meme";
}

// Simple Levenshtein-based similarity, returns 0-100 (100 = identical).
export function nameSimilarity(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  const distance = dp[a.length][b.length];
  const maxLen = Math.max(a.length, b.length, 1);
  return Math.round((1 - distance / maxLen) * 100);
}

// Checks a token symbol against the known RWA ticker whitelist.
// Returns the closest match and its similarity score.
export function findClosestOfficialTicker(symbol: string): {
  closestMatch: string | null;
  similarity: number;
} {
  let closestMatch: string | null = null;
  let bestScore = 0;

  for (const ticker of KNOWN_RWA_TICKERS) {
    const score = nameSimilarity(symbol.toUpperCase(), ticker.toUpperCase());
    if (score > bestScore) {
      bestScore = score;
      closestMatch = ticker;
    }
  }

  return { closestMatch, similarity: bestScore };
}

interface RiskInput {
  liquidityUsd: number;
  poolAgeHours: number;
  volume24hUsd: number;
}

// Computes a 0-100 risk score for a liquidity pool.
// Higher score = higher risk. Weighted on liquidity depth, pool age,
// and volume-to-liquidity ratio (a high ratio can indicate wash trading
// or an imminent rug pull).
export function computeRiskScore({ liquidityUsd, poolAgeHours, volume24hUsd }: RiskInput): number {
  let score = 0;

  // Liquidity depth (lower liquidity = higher risk)
  if (liquidityUsd < 10_000) score += 40;
  else if (liquidityUsd < 50_000) score += 25;
  else if (liquidityUsd < 200_000) score += 10;

  // Pool age (younger pools = higher risk)
  if (poolAgeHours < 24) score += 30;
  else if (poolAgeHours < 72) score += 15;
  else if (poolAgeHours < 168) score += 5;

  // Volume-to-liquidity ratio (extreme ratios are suspicious)
  const ratio = liquidityUsd > 0 ? volume24hUsd / liquidityUsd : 0;
  if (ratio > 20) score += 30;
  else if (ratio > 10) score += 15;
  else if (ratio > 5) score += 5;

  return Math.min(100, score);
}

export function riskScoreToLevel(score: number): RiskLevel {
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}
