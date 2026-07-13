// Client for the Blockscout API on Robinhood Chain (no key required).
// Explorer: https://robinhoodchain.blockscout.com

const BASE_URL = process.env.BLOCKSCOUT_API_BASE || "https://robinhoodchain.blockscout.com/api/v2";

export interface BlockscoutToken {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: string | null;
  total_supply: string | null;
  holders: string | null;
}

export interface BlockscoutAddressInfo {
  hash: string;
  is_contract: boolean;
  is_verified: boolean | null;
  creator_address_hash: string | null;
  creation_tx_hash: string | null;
}

export async function fetchTokenInfo(address: string): Promise<BlockscoutToken | null> {
  const res = await fetch(`${BASE_URL}/tokens/${address}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function fetchAddressInfo(address: string): Promise<BlockscoutAddressInfo | null> {
  const res = await fetch(`${BASE_URL}/addresses/${address}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) return null;
  return res.json();
}
