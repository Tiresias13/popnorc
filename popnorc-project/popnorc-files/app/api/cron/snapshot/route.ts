import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchPools, extractTokenAddress } from "@/lib/api/geckoterminal";
import {
  categorizeToken,
  computeRiskScore,
  riskScoreToLevel,
  findClosestOfficialTicker,
} from "@/lib/risk-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// This endpoint is called periodically by cron-job.org to:
// 1. Pull the latest pool data from GeckoTerminal
// 2. Categorize tokens (RWA vs meme) and score liquidity risk
// 3. Flag potential imposter tickers
// 4. Persist everything to Supabase (pools, pool_history, tokens, volume_snapshots)
//
// Protected by a shared secret passed via the Authorization header:
//   Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const now = new Date();

  try {
    const poolsPage1 = await fetchPools(1);
    const poolsPage2 = await fetchPools(2).catch(() => []);
    const pools = [...poolsPage1, ...poolsPage2];

    let poolsUpserted = 0;
    let tokensUpserted = 0;
    let volumeSnapshotsInserted = 0;

    for (const pool of pools) {
      const attrs = pool.attributes;
      const baseTokenAddress = extractTokenAddress(pool.relationships.base_token.data.id);
      const quoteTokenAddress = extractTokenAddress(pool.relationships.quote_token.data.id);
      const dexId = pool.relationships.dex.data.id;

      const liquidityUsd = parseFloat(attrs.reserve_in_usd || "0");
      const volume24hUsd = parseFloat(attrs.volume_usd?.h24 || "0");
      const priceChange24h = parseFloat(attrs.price_change_percentage?.h24 || "0");
      const baseTokenPriceUsd = attrs.base_token_price_usd
        ? parseFloat(attrs.base_token_price_usd)
        : null;
      const marketCapUsd = attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : null;
      const fdvUsd = attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : null;
      const poolCreatedAt = attrs.pool_created_at ? new Date(attrs.pool_created_at) : null;
      const poolAgeHours = poolCreatedAt
        ? (now.getTime() - poolCreatedAt.getTime()) / (1000 * 60 * 60)
        : 999999;

      // Derive a symbol from the pool name, e.g. "TSLA-hood / WETH" -> "TSLA-hood"
      const baseSymbol = attrs.name.split("/")[0]?.trim() || attrs.name;
      const category = categorizeToken(baseSymbol);
      const riskScore = computeRiskScore({ liquidityUsd, poolAgeHours, volume24hUsd });
      const riskLevel = riskScoreToLevel(riskScore);

      const { error: poolError } = await supabase.from("pools").upsert(
        {
          pool_address: attrs.address,
          pool_name: attrs.name,
          base_token_address: baseTokenAddress,
          base_token_symbol: baseSymbol,
          quote_token_address: quoteTokenAddress,
          quote_token_symbol: attrs.name.split("/")[1]?.trim() || null,
          dex_id: dexId,
          category,
          liquidity_usd: liquidityUsd,
          volume_24h_usd: volume24hUsd,
          price_change_24h: priceChange24h,
          base_token_price_usd: baseTokenPriceUsd,
          market_cap_usd: marketCapUsd,
          fdv_usd: fdvUsd,
          pool_created_at: poolCreatedAt?.toISOString() ?? null,
          risk_score: riskScore,
          risk_level: riskLevel,
          last_synced_at: now.toISOString(),
        },
        { onConflict: "pool_address" }
      );

      if (!poolError) poolsUpserted++;

      // Append to history for trend charts
      await supabase.from("pool_history").insert({
        pool_address: attrs.address,
        liquidity_usd: liquidityUsd,
        volume_24h_usd: volume24hUsd,
        price_usd: baseTokenPriceUsd,
        recorded_at: now.toISOString(),
      });

      // Token verification / imposter detection
      if (category === "rwa") {
        const { closestMatch, similarity } = findClosestOfficialTicker(baseSymbol);
        const isExactMatch = closestMatch === baseSymbol;

        let verificationStatus: "verified" | "imposter" | "reviewing" = "reviewing";
        let flaggedReason: string | null = null;

        if (isExactMatch) {
          verificationStatus = "verified";
        } else if (similarity >= 80) {
          verificationStatus = "imposter";
          flaggedReason = `Mimics official ticker "${closestMatch}" (${similarity}% name similarity), but does not match exactly.`;
        } else {
          verificationStatus = "reviewing";
          flaggedReason = "Does not closely match any known official ticker. Needs manual review.";
        }

        const { error: tokenError } = await supabase.from("tokens").upsert(
          {
            token_address: baseTokenAddress,
            symbol: baseSymbol,
            name: baseSymbol,
            category,
            verification_status: verificationStatus,
            matches_official_docs: isExactMatch,
            liquidity_locked_pct: liquidityUsd > 50_000 ? 90 : liquidityUsd > 10_000 ? 40 : 5,
            name_similarity_score: similarity,
            flagged_reason: flaggedReason,
            verified_at: verificationStatus === "verified" ? now.toISOString() : null,
            updated_at: now.toISOString(),
          },
          { onConflict: "token_address" }
        );

        if (!tokenError) tokensUpserted++;
      }

      // Volume snapshot for the heatmap (bucketed by current day/hour)
      const { error: volumeError } = await supabase.from("volume_snapshots").insert({
        token_address: baseTokenAddress,
        token_symbol: baseSymbol,
        category,
        volume_usd: volume24hUsd,
        day_of_week: now.getUTCDay(),
        hour_of_day: now.getUTCHours(),
        snapshot_date: now.toISOString().split("T")[0],
      });

      if (!volumeError) volumeSnapshotsInserted++;
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      poolsProcessed: pools.length,
      poolsUpserted,
      tokensUpserted,
      volumeSnapshotsInserted,
    });
  } catch (err) {
    console.error("Cron snapshot failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
