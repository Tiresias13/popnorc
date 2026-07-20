// Client for Blockscout's legacy Etherscan-style `getLogs` endpoint on
// Robinhood Chain (no key required). Used instead of the v2 REST API
// because it supports large block ranges (tested to 50,000+ blocks in one
// call) and includes block timestamps per log, unlike Alchemy's free-tier
// `eth_getLogs` which caps the range at 10 blocks per call.
//
// Verified against real launchpad contracts (flap.sh, Pons, bow.fun) —
// see memory/2026-07-20.md for the on-chain verification history.

const LEGACY_API_BASE =
  process.env.BLOCKSCOUT_LEGACY_API_BASE || "https://robinhoodchain.blockscout.com/api";

export interface BlockscoutLog {
  address: string;
  blockNumber: string; // hex
  data: string;
  logIndex: string; // hex
  timeStamp: string; // hex, unix seconds
  topics: (string | null)[];
  transactionHash: string;
  transactionIndex: string; // hex
}

interface GetLogsResponse {
  status: string; // "1" = ok, "0" = no results / error
  message: string;
  result: BlockscoutLog[] | string;
}

// The endpoint silently caps results at 1000 rows per call (no error, just
// truncates) — verified directly against the Pons contract, where a naive
// single call over a dense 24h window returned exactly 1000 rows while the
// real total (confirmed via binary-split re-fetching) was 8,506. Any range
// that comes back with exactly 1000 rows is treated as "possibly truncated"
// and recursively split in half until each half returns under 1000.
const TRUNCATION_CAP = 1000;

async function fetchLogsRaw(
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number
): Promise<BlockscoutLog[]> {
  const url = new URL(LEGACY_API_BASE);
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", address);
  url.searchParams.set("topic0", topic0);
  url.searchParams.set("fromBlock", String(fromBlock));
  url.searchParams.set("toBlock", String(toBlock));

  let res: Response | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (res.status !== 429) break;

    // Blockscout rate limits aggressively under repeated/parallel calls —
    // back off and retry rather than failing the whole cron run outright.
    // Longer backoff than a typical retry loop because observed 429s here
    // don't clear in 1-3s; give it real room (up to ~15s across 5 tries).
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }

  if (!res || !res.ok) {
    throw new Error(`Blockscout getLogs HTTP ${res?.status} for ${address} [${fromBlock}-${toBlock}]`);
  }

  const json: GetLogsResponse = await res.json();

  // status "0" with message "No logs found" is a normal empty result, not
  // an error — anything else with status "0" is treated as a real failure.
  if (json.status === "0") {
    if (json.message === "No logs found") return [];
    throw new Error(`Blockscout getLogs error for ${address} [${fromBlock}-${toBlock}]: ${json.message}`);
  }

  return Array.isArray(json.result) ? json.result : [];
}

// Fetches all logs for a given contract+topic0 over a block range, with no
// practical range limit (unlike Alchemy free tier's 10-block cap) — but
// transparently works around the 1000-row-per-call truncation by
// recursively splitting any range that returns exactly 1000 rows.
export async function fetchLaunchpadLogs(
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number
): Promise<BlockscoutLog[]> {
  if (fromBlock > toBlock) return [];

  const logs = await fetchLogsRaw(address, topic0, fromBlock, toBlock);

  if (logs.length < TRUNCATION_CAP) return logs;

  // Hit the cap — split the range and recurse. If the range can't be split
  // further (fromBlock === toBlock), just return what we got; a single
  // block can't realistically produce 1000+ logs from one event type.
  const mid = Math.floor((fromBlock + toBlock) / 2);
  if (mid <= fromBlock) return logs;

  const [left, right] = await Promise.all([
    fetchLaunchpadLogs(address, topic0, fromBlock, mid),
    fetchLaunchpadLogs(address, topic0, mid + 1, toBlock),
  ]);

  return [...left, ...right];
}
