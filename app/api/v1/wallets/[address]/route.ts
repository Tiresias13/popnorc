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
  const { data: wallet, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("wallet_address", params.address)
    .single();

  if (error || !wallet) {
    return withCors({ error: "Wallet not found" }, 404);
  }

  const { data: holdings } = await supabase
    .from("wallet_holdings")
    .select("token_address, token_symbol, value_usd")
    .eq("wallet_address", params.address)
    .order("value_usd", { ascending: false });

  const { data: activity } = await supabase
    .from("wallet_activity")
    .select("action, token_symbol, token_address, amount_usd, occurred_at")
    .eq("wallet_address", params.address)
    .order("occurred_at", { ascending: false })
    .limit(20);

  return withCors({
    data: { ...wallet, holdings: holdings || [], recent_activity: activity || [] },
  });
}
