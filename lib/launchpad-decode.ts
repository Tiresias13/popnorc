// Minimal Solidity ABI decoder for the specific launchpad deployment events
// we care about (uint256 / address / string params only — that's all these
// three events use). Avoids pulling in a full ABI library (ethers/viem) just
// for three fixed event shapes.
//
// Solidity ABI encoding: each parameter gets a 32-byte "head" slot. Static
// types (uint256, address) store their value directly in the head. Dynamic
// types (string, bytes) store a byte offset (relative to the start of the
// data blob) in the head, pointing to a "tail" location containing the
// length followed by the padded value.

export type AbiParamType = "uint256" | "address" | "string";

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex");
}

export function decodeAbiParameters(types: AbiParamType[], dataHex: string): (string | bigint)[] {
  const buf = hexToBuffer(dataHex);
  const values: (string | bigint)[] = [];

  for (let i = 0; i < types.length; i++) {
    const headOffset = i * 32;
    const type = types[i];

    if (type === "uint256") {
      values.push(BigInt("0x" + buf.subarray(headOffset, headOffset + 32).toString("hex")));
    } else if (type === "address") {
      const word = buf.subarray(headOffset, headOffset + 32);
      values.push("0x" + word.subarray(12, 32).toString("hex"));
    } else if (type === "string") {
      const offset = Number(BigInt("0x" + buf.subarray(headOffset, headOffset + 32).toString("hex")));
      const len = Number(BigInt("0x" + buf.subarray(offset, offset + 32).toString("hex")));
      const strBytes = buf.subarray(offset + 32, offset + 32 + len);
      values.push(strBytes.toString("utf8"));
    }
  }

  return values;
}

// Decodes a single indexed topic (32-byte hex word) as an address.
export function decodeAddressTopic(topic: string): string {
  const buf = hexToBuffer(topic);
  return "0x" + buf.subarray(12, 32).toString("hex");
}
