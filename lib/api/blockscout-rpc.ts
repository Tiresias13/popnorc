// Client for Blockscout's free `eth_call` JSON-RPC endpoint on Robinhood
// Chain (no key required, no Alchemy needed) — used for per-token contract
// reads that have no corresponding on-chain event (Pons's graduationStatus,
// bow.fun's migrated). See memory/2026-07-20.md for the verification
// history (tested live against real token contracts before this was wired
// into the cron).

const ETH_RPC_BASE =
  process.env.BLOCKSCOUT_ETH_RPC_BASE || "https://robinhoodchain.blockscout.com/api/eth-rpc";

interface EthCallResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: { code: number; message: string };
}

// Calls a contract method with no arguments beyond an optional single
// address parameter, and returns the raw hex result (or null on error).
export async function ethCall(to: string, selector: string, addressArg?: string): Promise<string | null> {
  const data = addressArg ? selector + addressArg.slice(2).padStart(64, "0") : selector;

  const res = await fetch(ETH_RPC_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to, data }, "latest"],
      id: 1,
    }),
    next: { revalidate: 0 },
  });

  if (!res.ok) return null;

  const json: EthCallResponse = await res.json();
  if (json.error || !json.result || json.result === "0x") return null;

  return json.result;
}

// Pons: graduationStatus(address) -> (uint256 pairedPrincipal, uint256
// threshold, bool graduated). Selector 0x98d652f1. `graduated` is the
// third 32-byte word.
export async function checkPonsGraduated(ponsContract: string, tokenAddress: string): Promise<boolean> {
  const result = await ethCall(ponsContract, "0x98d652f1", tokenAddress);
  if (!result || result.length < 2 + 64 * 3) return false;
  const graduatedWord = result.slice(2 + 64 * 2, 2 + 64 * 3);
  return BigInt("0x" + graduatedWord) === BigInt(1);
}

// bow.fun: migrated() -> bool, called directly on the token contract
// (not the factory). Selector 0x2c678c64.
export async function checkBowGraduated(tokenAddress: string): Promise<boolean> {
  const result = await ethCall(tokenAddress, "0x2c678c64");
  if (!result) return false;
  return BigInt(result) === BigInt(1);
}
