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
  const { data: token } = await supabase
    .from("tokens")
    .select("*")
    .eq("token_address", params.address)
    .single();

  if (token) {
    return withCors({ data: token });
  }

  // The "tokens" table only tracks tickers flagged by the imposter detector.
  // Most tokens (LP Monitor / LP Strategy / Smart Money) only ever show up
  // in "pools" as a base token — fall back to that so the address popup
  // still resolves real data instead of a false "not tracked" message.
  const { data: pool } = await supabase
    .from("pools")
    .select(
      "base_token_address, base_token_symbol, category, liquidity_usd, volume_24h_usd, risk_level"
    )
    .eq("base_token_address", params.address)
    .order("liquidity_usd", { ascending: false })
    .limit(1)
    .single();

  if (pool) {
    return withCors({
      data: {
        token_address: pool.base_token_address,
        symbol: pool.base_token_symbol,
        category: pool.category,
        verification_status: null,
        liquidity_usd: pool.liquidity_usd,
        volume_24h_usd: pool.volume_24h_usd,
        risk_level: pool.risk_level,
      },
    });
  }

  return withCors({ error: "Token not found" }, 404);
}
