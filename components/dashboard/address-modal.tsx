"use client";

import { useEffect, useState } from "react";

type AddressType = "token" | "pool" | "wallet";

interface AddressModalState {
  type: AddressType;
  address: string;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function blockscoutUrl(type: AddressType, address: string): string {
  const path = type === "wallet" ? "address" : type === "pool" ? "address" : "token";
  return `https://robinhoodchain.blockscout.com/${path}/${address}`;
}

// Global-ish click handler pattern: any part of the app can open this by
// rendering <AddressModalProvider> once near the root and calling the
// exposed `openAddress` via a custom event, OR simpler — each page just
// renders <AddressModal /> locally and calls a passed-in setter. We use the
// simplest local version here: a component that owns its own open/close
// state, exposed via a hook-like pattern per page.
export function useAddressModal() {
  const [state, setState] = useState<AddressModalState | null>(null);
  return {
    open: (type: AddressType, address: string) => setState({ type, address }),
    close: () => setState(null),
    state,
  };
}

export function AddressModal({
  state,
  onClose,
}: {
  state: AddressModalState | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!state) return;
    setData(null);
    setNotFound(false);
    setLoading(true);

    const endpoint =
      state.type === "token"
        ? `/api/v1/tokens/${state.address}`
        : state.type === "pool"
        ? `/api/v1/pools/${state.address}`
        : `/api/v1/wallets/${state.address}`;

    fetch(endpoint)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setData(json.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [state]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div
        className="bg-[#0A0A0B] text-white rounded-2xl px-6 py-5 shadow-xl text-sm max-w-sm w-full relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-gray-500 hover:text-white text-xs"
        >
          ✕
        </button>

        <p className="text-xs text-gray-500 mono mb-1 uppercase tracking-wide">{state.type}</p>
        <p className="font-semibold mono text-[#F5A623] break-all mb-4">
          {shortenAddress(state.address)}
        </p>

        {loading && <p className="text-xs text-gray-400">pulling it up...</p>}

        {!loading && notFound && (
          <p className="text-xs text-gray-400 mb-4">
            not in our tracked set yet — check it out directly on the explorer.
          </p>
        )}

        {!loading && data && state.type === "token" && (
          <div className="space-y-2 mb-4">
            <Row label="symbol" value={String(data.symbol ?? "—")} />
            <Row label="category" value={String(data.category ?? "—")} />
            {data.verification_status !== null && data.verification_status !== undefined && (
              <Row label="status" value={String(data.verification_status)} />
            )}
            {(data.liquidity_usd !== undefined) && (
              <Row label="liquidity" value={formatUsd(data.liquidity_usd as number)} />
            )}
            {(data.volume_24h_usd !== undefined) && (
              <Row label="24h volume" value={formatUsd(data.volume_24h_usd as number)} />
            )}
            {(data.risk_level !== undefined) && (
              <Row label="risk" value={String(data.risk_level ?? "—")} />
            )}
          </div>
        )}

        {!loading && data && state.type === "pool" && (
          <div className="space-y-2 mb-4">
            <Row label="pool" value={String(data.pool_name ?? "—")} />
            <Row label="liquidity" value={formatUsd(data.liquidity_usd as number)} />
            <Row label="24h volume" value={formatUsd(data.volume_24h_usd as number)} />
            <Row label="risk" value={String(data.risk_level ?? "—")} />
          </div>
        )}

        {!loading && data && state.type === "wallet" && (
          <div className="space-y-2 mb-4">
            <Row label="holdings" value={formatUsd(data.total_holdings_usd as number)} />
            <Row label="7d net change" value={formatUsd(data.net_position_change_7d_usd as number)} />
          </div>
        )}

        <a
          href={blockscoutUrl(state.type, state.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs font-semibold text-black bg-[#F5A623] rounded-lg py-2.5 mt-2 hover:brightness-95"
        >
          verify on blockscout ↗
        </a>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="mono text-sm">{value}</span>
    </div>
  );
}

