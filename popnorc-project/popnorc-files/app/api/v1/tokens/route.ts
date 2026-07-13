import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/v1/tokens
// Query params:
//   status: "verified" | "imposter" | "reviewing" (optional)
//   category: "rwa" | "meme" (optional)
//   limit: number, default 50, max 200
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  let query = supabase.from("tokens").select("*");

  if (status) query = query.eq("verification_status", status);
  if (category) query = query.eq("category", category);

  query = query.order("updated_at", { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error) {
    return withCors({ error: error.message }, 500);
  }

  return withCors({ data, count: data.length });
}
