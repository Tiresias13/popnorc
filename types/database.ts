export type RiskLevel = "low" | "medium" | "high" | "unknown";
export type TokenCategory = "rwa" | "meme" | "other" | "unknown";
export type VerificationStatus = "verified" | "imposter" | "reviewing";

export interface Pool {
  id: string;
  pool_address: string;
  pool_name: string;
  base_token_address: string;
  base_token_symbol: string | null;
  quote_token_address: string;
  quote_token_symbol: string | null;
  dex_id: string | null;
  category: TokenCategory;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  price_change_24h: number | null;
  base_token_price_usd: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  pool_created_at: string | null;
  risk_score: number;
  risk_level: RiskLevel;
  last_synced_at: string;
  created_at: string;
}

export interface PoolHistory {
  id: string;
  pool_address: string;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  price_usd: number | null;
  recorded_at: string;
}

export interface Token {
  id: string;
  token_address: string;
  symbol: string;
  name: string | null;
  category: TokenCategory;
  verification_status: VerificationStatus;
  matches_official_docs: boolean;
  deployer_address: string | null;
  deployer_verified: boolean;
  liquidity_locked_pct: number | null;
  name_similarity_score: number | null;
  flagged_reason: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  id: string;
  wallet_address: string;
  is_contract: boolean;
  total_holdings_usd: number | null;
  net_position_change_7d_usd: number | null;
  rank: number | null;
  last_synced_at: string;
  created_at: string;
}

export interface WalletHolding {
  id: string;
  wallet_address: string;
  token_address: string;
  token_symbol: string | null;
  value_usd: number | null;
  updated_at: string;
}

export interface WalletActivity {
  id: string;
  wallet_address: string;
  action: "buy" | "sell";
  token_symbol: string | null;
  token_address: string | null;
  amount_usd: number | null;
  tx_hash: string | null;
  occurred_at: string;
}

export interface VolumeSnapshot {
  id: string;
  token_address: string;
  token_symbol: string | null;
  category: TokenCategory;
  volume_usd: number;
  day_of_week: number;
  hour_of_day: number;
  snapshot_date: string;
  created_at: string;
}
