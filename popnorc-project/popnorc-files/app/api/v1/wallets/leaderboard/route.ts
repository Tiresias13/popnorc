import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/v1/wallets/leaderboard?limit=20
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .order("rank", { ascending: true })
    .limit(limit);

  if (error) {
    return withCors({ error: error.message }, 500);
  }

  return withCors({ data, count: data.length });
}
