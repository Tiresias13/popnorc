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
  const { data, error } = await supabase
    .from("tokens")
    .select("*")
    .eq("token_address", params.address)
    .single();

  if (error || !data) {
    return withCors({ error: "Token not found" }, 404);
  }

  return withCors({ data });
}
