import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/v1/heatmap
// Query params:
//   category: "rwa" | "meme" (optional)
//   token: token address (optional, filters to a single token)
//
// Returns aggregated volume grouped by day_of_week (0-6) and hour_of_day (0-23),
// averaged across the last 7 days of snapshots.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const token = searchParams.get("token");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let query = supabase
    .from("volume_snapshots")
    .select("day_of_week, hour_of_day, volume_usd, category, token_address")
    .gte("snapshot_date", sevenDaysAgo.toISOString().split("T")[0]);

  if (category) query = query.eq("category", category);
  if (token) query = query.eq("token_address", token);

  const { data, error } = await query;

  if (error) {
    return withCors({ error: error.message }, 500);
  }

  // Aggregate into a 7x24 grid: sum of volume per (day_of_week, hour_of_day)
  const grid: Record<string, number> = {};
  for (const row of data || []) {
    const key = `${row.day_of_week}-${row.hour_of_day}`;
    grid[key] = (grid[key] || 0) + Number(row.volume_usd || 0);
  }

  const cells = Object.entries(grid).map(([key, volume]) => {
    const [dayOfWeek, hourOfDay] = key.split("-").map(Number);
    return { day_of_week: dayOfWeek, hour_of_day: hourOfDay, volume_usd: volume };
  });

  return withCors({ data: cells });
}
