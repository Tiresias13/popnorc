import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client — uses the service_role key, which bypasses RLS.
// NEVER import this file in a client component. Only use inside API routes
// (app/api/**) or server components that run exclusively on the server.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}
