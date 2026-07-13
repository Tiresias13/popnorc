import { createClient } from "@supabase/supabase-js";

// Client-side Supabase client — safe to use in browser components.
// Uses the public anon key, which is protected by Row Level Security (read-only).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
