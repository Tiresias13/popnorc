import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/v1/pools
// Query params:
//   category: "rwa" | "meme" | "unknown" (optional)
//   risk_level: "low" | "medium" | "high" (optional)
//   limit: number, default 50, max 200
//   sort: "liquidity" | "volume" | "risk" (default "liquidity")
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const riskLevel = searchParams.get("risk_level");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const sort = searchParams.get("sort") || "liquidity";

  let query = supabase.from("pools").select("*");

  if (category) query = query.eq("category", category);
  if (riskLevel) query = query.eq("risk_level", riskLevel);

  const sortColumn =
    sort === "volume" ? "volume_24h_usd" : sort === "risk" ? "risk_score" : "liquidity_usd";

  query = query.order(sortColumn, { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error) {
    return withCors({ error: error.message }, 500);
  }

  return withCors({ data, count: data.length });
}
