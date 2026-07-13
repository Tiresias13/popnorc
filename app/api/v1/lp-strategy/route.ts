import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";
import { getOpportunitiesForStrategy, LpStrategyKey, LP_STRATEGY_PRESETS } from "@/lib/lp-strategy";
import { Pool } from "@/types/database";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/v1/lp-strategy
// Query params:
//   strategy: "degen" | "mid" | "longterm" (default "degen")
//   limit: number, default 50, max 200
//
// Returns pools currently classified as good add-liquidity candidates for
// the given strategy, each with a suggested one-sided min price and an
// estimated APR. Estimates are backward-looking (trailing 24h volume) and
// exclude impermanent loss.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const strategy = (searchParams.get("strategy") || "degen") as LpStrategyKey;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  if (!LP_STRATEGY_PRESETS[strategy]) {
    return withCors({ error: "Invalid strategy. Use degen, mid, or longterm." }, 400);
  }

  const { data: pools, error } = await supabase
    .from("pools")
    .select("*")
    .order("liquidity_usd", { ascending: false })
    .limit(200);

  if (error) {
    return withCors({ error: error.message }, 500);
  }

  const opportunities = getOpportunitiesForStrategy((pools || []) as Pool[], strategy).slice(
    0,
    limit
  );

  return withCors({
    strategy,
    range_pct: LP_STRATEGY_PRESETS[strategy].rangePct,
    data: opportunities,
    count: opportunities.length,
  });
}
