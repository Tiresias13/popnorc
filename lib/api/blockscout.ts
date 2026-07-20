// Client for the Blockscout API on Robinhood Chain (no key required).
// Docs: https://docs.blockscout.com/devs/apis/rest

const BASE_URL = process.env.BLOCKSCOUT_API_BASE || "https://robinhoodchain.blockscout.com/api/v2";

export interface BlockscoutHolder {
  address: {
    hash: string;
    is_contract: boolean;
    name: string | null;
  };
  value: string; // raw token amount, needs dividing by 10^decimals
}

interface BlockscoutHoldersResponse {
  items: BlockscoutHolder[];
}

// Fetches the top holders for a given token contract address.
// Blockscout returns holders sorted by balance descending, capped server-side
// (no `limit` query param is supported); we slice client-side.
export async function fetchTokenHolders(
  tokenAddress: string,
  limit = 15
): Promise<BlockscoutHolder[]> {
  const res = await fetch(`${BASE_URL}/tokens/${tokenAddress}/holders`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) return [];

  const json: BlockscoutHoldersResponse = await res.json();
  return (json.items || []).slice(0, limit);
}

export interface BlockscoutTransfer {
  from: { hash: string; is_contract: boolean };
  to: { hash: string; is_contract: boolean };
  total: { value: string; decimals: string };
  timestamp: string;
  transaction_hash: string;
  token: { address_hash: string; symbol: string; decimals: string };
}

interface BlockscoutTransfersResponse {
  items: BlockscoutTransfer[];
  next_page_params: Record<string, unknown> | null;
}

// Fetches recent transfers for a given token contract address, most recent first.
// Blockscout paginates in batches of ~50; this follows next_page_params up to
// maxPages, which covers roughly the last few hundred transfers for a token.
export async function fetchTokenTransfers(
  tokenAddress: string,
  maxPages = 3
): Promise<BlockscoutTransfer[]> {
  const allTransfers: BlockscoutTransfer[] = [];
  let nextParams: Record<string, unknown> | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${BASE_URL}/tokens/${tokenAddress}/transfers`);
    if (nextParams) {
      for (const [key, value] of Object.entries(nextParams)) {
        url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) break;

    const json: BlockscoutTransfersResponse = await res.json();
    allTransfers.push(...(json.items || []));

    if (!json.next_page_params) break;
    nextParams = json.next_page_params;
  }

  return allTransfers;
}

export interface BlockscoutTokenInfo {
  decimals: number;
  symbol: string;
  name: string | null;
  exchange_rate: string | null;
}

// Fetches token metadata (decimals, symbol) needed to convert raw on-chain
// balances into human-readable amounts.
export async function fetchTokenInfo(tokenAddress: string): Promise<BlockscoutTokenInfo | null> {
  const res = await fetch(`${BASE_URL}/tokens/${tokenAddress}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) return null;

  const json = await res.json();
  return {
    decimals: Number(json.decimals ?? 18),
    symbol: json.symbol,
    name: json.name ?? null,
    exchange_rate: json.exchange_rate ?? null,
  };
}
