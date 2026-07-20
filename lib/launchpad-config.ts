// Config + per-launchpad log decoders for the three verified Robinhood
// Chain launchpads: flap.sh, Pons, bow.fun. Contract addresses, topic0
// hashes, and event shapes below were verified directly on-chain via
// Blockscout getLogs — see memory/2026-07-20.md for the verification
// history (test files, cross-check against Pons's own Dune dashboard).

import { decodeAbiParameters } from "./launchpad-decode";
import type { BlockscoutLog } from "./api/blockscout-logs";

export type LaunchpadId = "flap" | "pons" | "bow";

export interface LaunchpadConfig {
  id: LaunchpadId;
  contractAddress: string;
  topic0: string;
  // How many blocks a single getLogs call should span before the cron
  // pages forward, to keep individual calls fast and avoid the 1000-row
  // truncation cap kicking in too often on dense ranges.
  chunkBlocks: number;
}

export const LAUNCHPADS: LaunchpadConfig[] = [
  {
    id: "flap",
    contractAddress: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    topic0: "0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603",
    chunkBlocks: 20000,
  },
  {
    id: "pons",
    contractAddress: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
    topic0: "0x1461370115e1c2be79cb529f8cfcbd11316e789d9c6099fc83417b0b4c48c62a",
    chunkBlocks: 20000,
  },
  {
    id: "bow",
    contractAddress: "0xc70e510e14710ea535cab7b2414860af63feab79",
    topic0: "0xec774f0683e9ac48e8d835f412f9f877a8a5dee9af3170d78cf3ef33149d15e7",
    chunkBlocks: 20000,
  },
];

// flap.sh's graduation event lives on the same factory contract as
// TokenCreated, just a different topic0 — LaunchedToDEX(address token,
// address pool, uint256 amount, uint256 eth), all non-indexed. Verified
// live: 169 real graduation events found scanning a wide block range.
// Pons and bow.fun have no equivalent global event; their graduation
// status has to be checked per-token via eth_call (see
// lib/api/blockscout-rpc.ts).
export const FLAP_GRADUATION_TOPIC0 =
  "0x6e4f47630b8745b8cacbd44f42a8a33e7eea7cc08ef22fc7630f4f385784ff7d";

export interface DecodedDeployment {
  launchpad: LaunchpadId;
  tokenAddress: string;
  deployerAddress: string | null;
  // flap.sh includes name/symbol directly in the event; Pons and bow.fun
  // don't, so these are filled in by a separate ERC-20 metadata lookup
  // (see lib/api/blockscout.ts fetchTokenInfo) after decoding.
  tokenName: string | null;
  tokenSymbol: string | null;
  blockNumber: number;
  txHash: string;
  deployedAt: Date;
}

// flap.sh: TokenCreated(uint256 ts, address creator, uint256 nonce,
//   address token, string name, string symbol, string meta)
// All params are non-indexed (topics only has topic0), so everything is
// in `data`.
function decodeFlap(log: BlockscoutLog): DecodedDeployment {
  const [, creator, , token, name, symbol] = decodeAbiParameters(
    ["uint256", "address", "uint256", "address", "string", "string", "string"],
    log.data
  );
  return {
    launchpad: "flap",
    tokenAddress: token as string,
    deployerAddress: creator as string,
    tokenName: name as string,
    tokenSymbol: symbol as string,
    blockNumber: parseInt(log.blockNumber, 16),
    txHash: log.transactionHash,
    deployedAt: new Date(parseInt(log.timeStamp, 16) * 1000),
  };
}

// Pons: TokenDeployed(address indexed token, address indexed deployer,
//   address indexed dexFactory, address pairToken, uint256 dexId,
//   uint256 launchConfigId)
// token/deployer/dexFactory are indexed -> topics[1]/[2]/[3]. No
// name/symbol in the event; needs a follow-up ERC-20 metadata lookup.
function decodePons(log: BlockscoutLog): DecodedDeployment {
  const token = "0x" + log.topics[1]!.slice(-40);
  const deployer = "0x" + log.topics[2]!.slice(-40);
  return {
    launchpad: "pons",
    tokenAddress: token,
    deployerAddress: deployer,
    tokenName: null,
    tokenSymbol: null,
    blockNumber: parseInt(log.blockNumber, 16),
    txHash: log.transactionHash,
    deployedAt: new Date(parseInt(log.timeStamp, 16) * 1000),
  };
}

// bow.fun: Launched(address indexed token, address indexed deployer,
//   address pool, uint256 positionId, uint256 launchId)
// token/deployer are indexed -> topics[1]/[2]. No name/symbol in the
// event; needs a follow-up ERC-20 metadata lookup.
function decodeBow(log: BlockscoutLog): DecodedDeployment {
  const token = "0x" + log.topics[1]!.slice(-40);
  const deployer = "0x" + log.topics[2]!.slice(-40);
  return {
    launchpad: "bow",
    tokenAddress: token,
    deployerAddress: deployer,
    tokenName: null,
    tokenSymbol: null,
    blockNumber: parseInt(log.blockNumber, 16),
    txHash: log.transactionHash,
    deployedAt: new Date(parseInt(log.timeStamp, 16) * 1000),
  };
}

const DECODERS: Record<LaunchpadId, (log: BlockscoutLog) => DecodedDeployment> = {
  flap: decodeFlap,
  pons: decodePons,
  bow: decodeBow,
};

export function decodeDeploymentLog(launchpad: LaunchpadId, log: BlockscoutLog): DecodedDeployment {
  return DECODERS[launchpad](log);
}

// Decodes a flap.sh LaunchedToDEX log into the graduated token's address.
// amount/eth aren't needed for graduation tracking, just the token.
export function decodeFlapGraduationLog(log: BlockscoutLog): { tokenAddress: string; blockNumber: number; graduatedAt: Date } {
  const [token] = decodeAbiParameters(["address"], log.data);
  return {
    tokenAddress: token as string,
    blockNumber: parseInt(log.blockNumber, 16),
    graduatedAt: new Date(parseInt(log.timeStamp, 16) * 1000),
  };
}
