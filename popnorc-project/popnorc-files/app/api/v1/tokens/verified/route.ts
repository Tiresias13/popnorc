import { supabase } from "@/lib/supabase/client";
import { withCors, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

// GET /api/v1/tokens/verified
// Shortcut endpoint returning only verified (non-imposter) RWA tokens.
// Useful for wallets/dApps that want a trusted whitelist.
export async function GET() {
  const { data, error } = await supabase
    .from("tokens")
    .select("token_address, symbol, name, category, verified_at")
    .eq("verification_status", "verified")
    .order("symbol", { ascending: true });

  if (error) {
    return withCors({ error: error.message }, 500);
  }

  return withCors({ data, count: data.length });
}
