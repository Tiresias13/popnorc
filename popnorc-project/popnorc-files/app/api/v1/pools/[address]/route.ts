import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  _req: Request,
  { params }: { params: { address: string } }
) {
  const { data: pool, error } = await supabase
    .from("pools")
    .select("*")
    .eq("pool_address", params.address)
    .single();

  if (error || !pool) {
    return withCors({ error: "Pool not found" }, 404);
  }

  const { data: history } = await supabase
    .from("pool_history")
    .select("liquidity_usd, volume_24h_usd, price_usd, recorded_at")
    .eq("pool_address", params.address)
    .order("recorded_at", { ascending: false })
    .limit(168); // ~7 days of hourly snapshots

  return withCors({ data: { ...pool, history: history || [] } });
}
