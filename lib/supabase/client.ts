import { createClient } from "@supabase/supabase-js";

// Client-side Supabase client — safe to use in browser components.
// Uses the public anon key, which is protected by Row Level Security (read-only).
// global.fetch cache is explicitly disabled so Next.js's App Router data cache
// never serves a stale (or empty) response for server-rendered dashboard pages.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
    },
  }
);
