import { BlockscoutHolder, BlockscoutTransfer } from "@/lib/api/blockscout";

export interface WalletPosition {
  walletAddress: string;
  isContract: boolean;
  holdingsUsd: number; // sum across tracked tokens
}

// Known burn / null addresses — these aren't real holders and shouldn't
// appear in a "smart money" ranking even though Blockscout doesn't flag
// them as contracts.
const EXCLUDED_ADDRESSES = new Set([
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000000",
]);

function isExcludedAddress(address: string): boolean {
  return EXCLUDED_ADDRESSES.has(address.toLowerCase());
}

// Aggregates raw Blockscout holder data (per-token, raw on-chain balances)
// into per-wallet USD positions across all tracked tokens. Contract addresses
// (pools, routers, vaults) and burn/null addresses are excluded — "smart
// money" means real active wallets, not DEX infrastructure or dead tokens.
export function aggregateHoldings(
  holdersByToken: { tokenAddress: string; priceUsd: number; decimals: number; holders: BlockscoutHolder[] }[]
): Map<string, WalletPosition> {
  const positions = new Map<string, WalletPosition>();

  for (const { priceUsd, decimals, holders } of holdersByToken) {
    for (const holder of holders) {
      if (holder.address.is_contract) continue;
      if (isExcludedAddress(holder.address.hash)) continue;

      const rawValue = Number(holder.value || "0");
      const tokenAmount = rawValue / Math.pow(10, decimals);
      const usdValue = tokenAmount * priceUsd;
      if (usdValue <= 0) continue;

      const address = holder.address.hash;
      const existing = positions.get(address);
      if (existing) {
        existing.holdingsUsd += usdValue;
      } else {
        positions.set(address, {
          walletAddress: address,
          isContract: false,
          holdingsUsd: usdValue,
        });
      }
    }
  }

  return positions;
}

export interface NetPositionChange {
  walletAddress: string;
  netUsd: number; // positive = net buyer, negative = net seller
}

// Computes each non-contract wallet's net USD flow (buys minus sells) for a
// single token's transfer history over the last N days, using the token's
// current price to value each transfer (an approximation — historical price
// at time of transfer isn't available without a price-history indexer).
export function computeNetPositionChange(
  transfers: BlockscoutTransfer[],
  priceUsd: number,
  sinceMs: number
): Map<string, number> {
  const netByWallet = new Map<string, number>();

  for (const t of transfers) {
    const ts = new Date(t.timestamp).getTime();
    if (ts < sinceMs) continue;

    const decimals = Number(t.total?.decimals ?? t.token?.decimals ?? 18);
    const rawValue = Number(t.total?.value || "0");
    const amount = rawValue / Math.pow(10, decimals);
    const usdValue = amount * priceUsd;
    if (usdValue <= 0) continue;

    // Receiving wallet (buyer) — skip if it's a contract (pool/router) or a
    // burn/null address
    if (!t.to.is_contract && !isExcludedAddress(t.to.hash)) {
      const current = netByWallet.get(t.to.hash) || 0;
      netByWallet.set(t.to.hash, current + usdValue);
    }

    // Sending wallet (seller) — skip if it's a contract or burn/null address
    if (!t.from.is_contract && !isExcludedAddress(t.from.hash)) {
      const current = netByWallet.get(t.from.hash) || 0;
      netByWallet.set(t.from.hash, current - usdValue);
    }
  }

  return netByWallet;
}
