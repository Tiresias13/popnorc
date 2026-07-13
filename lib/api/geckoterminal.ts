// Client for the GeckoTerminal public API (no key required, subject to rate limits).
// Docs: https://apiguide.geckoterminal.com

const BASE_URL = process.env.GECKOTERMINAL_API_BASE || "https://api.geckoterminal.com/api/v2";
const NETWORK = process.env.GECKOTERMINAL_NETWORK || "robinhood";

export interface GeckoPoolAttributes {
  address: string;
  name: string;
  pool_created_at: string;
  base_token_price_usd: string | null;
  fdv_usd: string | null;
  market_cap_usd: string | null;
  price_change_percentage: {
    h24: string;
  };
  volume_usd: {
    h24: string;
  };
  reserve_in_usd: string;
}

export interface GeckoPool {
  id: string;
  type: "pool";
  attributes: GeckoPoolAttributes;
  relationships: {
    base_token: { data: { id: string; type: "token" } };
    quote_token: { data: { id: string; type: "token" } };
    dex: { data: { id: string; type: "dex" } };
  };
}

interface GeckoPoolsResponse {
  data: GeckoPool[];
}

// Fetches trending/top pools for the configured network, sorted by GeckoTerminal's default order.
export async function fetchPools(page = 1): Promise<GeckoPool[]> {
  const res = await fetch(`${BASE_URL}/networks/${NETWORK}/pools?page=${page}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`GeckoTerminal fetchPools failed: ${res.status}`);
  }

  const json: GeckoPoolsResponse = await res.json();
  return json.data;
}

// Fetches details for a single pool by its contract address.
export async function fetchPoolByAddress(address: string): Promise<GeckoPool | null> {
  const res = await fetch(`${BASE_URL}/networks/${NETWORK}/pools/${address}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) return null;

  const json: { data: GeckoPool } = await res.json();
  return json.data;
}

// Extracts the raw token address from a GeckoTerminal relationship id,
// e.g. "robinhood_0xabc..." -> "0xabc..."
export function extractTokenAddress(relationshipId: string): string {
  const parts = relationshipId.split("_");
  return parts[parts.length - 1];
}
