// Client for bow.fun's own public API (bow.fun/api/tokens) — unlike Pons,
// bow.fun exposes a bulk endpoint that includes a `graduated` boolean per
// token directly, so graduation status can be synced by paging through
// this instead of per-token eth_call. Confirmed via direct curl: fast
// (~0.7s per page) and handles high concurrency fine (10 pages in
// parallel finished in ~0.8s in testing), unlike Blockscout's eth-rpc
// endpoint. No auth required.
//
// Paginated, fixed at 25 tokens/page (perPage query param is accepted but
// ignored — confirmed by testing, always returns 25 regardless of what's
// requested).

const BOW_API_BASE = process.env.BOW_API_BASE || "https://bow.fun/api";
const PAGE_CONCURRENCY = 20;

export interface BowToken {
  token: string;
  graduated: boolean;
  created: number; // unix seconds
}

interface BowTokensResponse {
  tokens: BowToken[];
  page: number;
  pages: number;
  total: number;
  perPage: number;
}

async function fetchPage(page: number): Promise<BowTokensResponse | null> {
  try {
    const res = await fetch(`${BOW_API_BASE}/tokens?page=${page}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetches every page of bow.fun's token list and returns a flat map of
// token address -> graduated. Stops early if the time budget runs out,
// returning whatever was gathered so far (caller decides what to do with
// a partial result — for graduation syncing, a partial pass this run just
// means the rest gets picked up on the next cron run).
export async function fetchAllBowGraduationStatus(deadline: number): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  const first = await fetchPage(1);
  if (!first) return result;

  for (const t of first.tokens) result.set(t.token.toLowerCase(), t.graduated);

  const totalPages = first.pages;

  for (let start = 2; start <= totalPages; start += PAGE_CONCURRENCY) {
    if (Date.now() >= deadline) break;

    const pageNumbers = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, totalPages - start + 1) },
      (_, i) => start + i
    );

    const pages = await Promise.all(pageNumbers.map(fetchPage));
    for (const page of pages) {
      if (!page) continue;
      for (const t of page.tokens) result.set(t.token.toLowerCase(), t.graduated);
    }
  }

  return result;
}
