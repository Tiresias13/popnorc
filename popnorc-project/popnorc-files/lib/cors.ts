import { NextResponse } from "next/server";

// Public API responses are meant to be consumed by third-party apps and
// AI agents from any origin, so CORS is wide open for GET requests.
export function withCors(body: unknown, init?: number) {
  return NextResponse.json(body, {
    status: init ?? 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export function corsPreflight() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
