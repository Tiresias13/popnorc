-- ============================================================
-- Popnorc — Supabase Schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: pools
-- Snapshot of LP pool data pulled from GeckoTerminal
-- ============================================================
create table if not exists pools (
  id uuid primary key default uuid_generate_v4(),
  pool_address text not null unique,
  pool_name text not null,
  base_token_address text not null,
  base_token_symbol text,
  quote_token_address text not null,
  quote_token_symbol text,
  dex_id text,
  category text not null default 'unknown', -- 'rwa' | 'meme' | 'unknown'
  liquidity_usd numeric,
  volume_24h_usd numeric,
  price_change_24h numeric,
  base_token_price_usd numeric,
  market_cap_usd numeric,
  fdv_usd numeric,
  pool_created_at timestamptz,
  risk_score integer default 0, -- 0-100, higher = riskier
  risk_level text default 'unknown', -- 'low' | 'medium' | 'high' | 'unknown'
  last_synced_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_pools_category on pools(category);
create index if not exists idx_pools_risk_level on pools(risk_level);
create index if not exists idx_pools_liquidity on pools(liquidity_usd desc);

-- Migration-safe: adds base_token_price_usd if the table already existed without it.
alter table pools add column if not exists base_token_price_usd numeric;

-- ============================================================
-- TABLE: pool_history
-- Historical snapshots for liquidity/volume trend charts
-- ============================================================
create table if not exists pool_history (
  id uuid primary key default uuid_generate_v4(),
  pool_address text not null references pools(pool_address) on delete cascade,
  liquidity_usd numeric,
  volume_24h_usd numeric,
  price_usd numeric,
  recorded_at timestamptz default now()
);

create index if not exists idx_pool_history_address on pool_history(pool_address);
create index if not exists idx_pool_history_recorded on pool_history(recorded_at desc);

-- ============================================================
-- TABLE: tokens
-- Token registry with verification status (Imposter Detector)
-- ============================================================
create table if not exists tokens (
  id uuid primary key default uuid_generate_v4(),
  token_address text not null unique,
  symbol text not null,
  name text,
  category text not null default 'unknown', -- 'rwa' | 'meme' | 'unknown'
  verification_status text not null default 'reviewing', -- 'verified' | 'imposter' | 'reviewing'
  matches_official_docs boolean default false,
  deployer_address text,
  deployer_verified boolean default false,
  liquidity_locked_pct numeric,
  name_similarity_score numeric, -- 0-100, similarity to a known official ticker
  flagged_reason text,
  verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tokens_status on tokens(verification_status);
create index if not exists idx_tokens_symbol on tokens(symbol);

-- ============================================================
-- TABLE: wallets
-- Smart money wallet profiles
-- ============================================================
create table if not exists wallets (
  id uuid primary key default uuid_generate_v4(),
  wallet_address text not null unique,
  win_rate numeric, -- percentage
  realized_pnl_7d_usd numeric,
  rank integer,
  last_synced_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_wallets_pnl on wallets(realized_pnl_7d_usd desc);
create index if not exists idx_wallets_rank on wallets(rank);

-- ============================================================
-- TABLE: wallet_holdings
-- Current token holdings per wallet
-- ============================================================
create table if not exists wallet_holdings (
  id uuid primary key default uuid_generate_v4(),
  wallet_address text not null references wallets(wallet_address) on delete cascade,
  token_address text not null,
  token_symbol text,
  value_usd numeric,
  updated_at timestamptz default now()
);

create index if not exists idx_holdings_wallet on wallet_holdings(wallet_address);

-- ============================================================
-- TABLE: wallet_activity
-- Recent buy/sell activity per wallet
-- ============================================================
create table if not exists wallet_activity (
  id uuid primary key default uuid_generate_v4(),
  wallet_address text not null references wallets(wallet_address) on delete cascade,
  action text not null, -- 'buy' | 'sell'
  token_symbol text,
  token_address text,
  amount_usd numeric,
  tx_hash text,
  occurred_at timestamptz default now()
);

create index if not exists idx_activity_wallet on wallet_activity(wallet_address);
create index if not exists idx_activity_occurred on wallet_activity(occurred_at desc);

-- ============================================================
-- TABLE: volume_snapshots
-- Hourly volume data per token, used to build the heatmap
-- ============================================================
create table if not exists volume_snapshots (
  id uuid primary key default uuid_generate_v4(),
  token_address text not null,
  token_symbol text,
  category text default 'unknown', -- 'rwa' | 'meme' | 'unknown'
  volume_usd numeric not null default 0,
  day_of_week integer not null, -- 0 = Sunday, 6 = Saturday
  hour_of_day integer not null, -- 0-23 (UTC)
  snapshot_date date not null default current_date,
  created_at timestamptz default now()
);

create index if not exists idx_volume_token on volume_snapshots(token_address);
create index if not exists idx_volume_day_hour on volume_snapshots(day_of_week, hour_of_day);
create index if not exists idx_volume_date on volume_snapshots(snapshot_date);

-- ============================================================
-- Row Level Security (RLS)
-- Public read access for everyone (anon key), writes only via service_role
-- ============================================================
alter table pools enable row level security;
alter table pool_history enable row level security;
alter table tokens enable row level security;
alter table wallets enable row level security;
alter table wallet_holdings enable row level security;
alter table wallet_activity enable row level security;
alter table volume_snapshots enable row level security;

create policy "Public read access" on pools for select using (true);
create policy "Public read access" on pool_history for select using (true);
create policy "Public read access" on tokens for select using (true);
create policy "Public read access" on wallets for select using (true);
create policy "Public read access" on wallet_holdings for select using (true);
create policy "Public read access" on wallet_activity for select using (true);
create policy "Public read access" on volume_snapshots for select using (true);

-- No insert/update/delete policies are defined for the anon role,
-- meaning only requests made with the service_role key (server-side, cron job)
-- can write to these tables. This is intentional.
