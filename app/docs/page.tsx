import { MarketingNav } from "@/components/marketing/nav";

const BASE_URL = "https://popnorc.xyz/api/v1";

interface Endpoint {
  method: string;
  path: string;
  description: string;
  params?: { name: string; type: string; description: string }[];
  example: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/pools",
    description: "List liquidity pools with risk scoring and category.",
    params: [
      { name: "category", type: "rwa | meme | other", description: "Filter by token category" },
      { name: "risk_level", type: "low | medium | high", description: "Filter by risk level" },
      { name: "sort", type: "liquidity | volume | risk", description: "Sort field (default: liquidity)" },
      { name: "limit", type: "number", description: "Max results, default 50, max 200" },
    ],
    example: `curl "${BASE_URL}/pools?category=rwa&sort=risk&limit=10"`,
  },
  {
    method: "GET",
    path: "/pools/:address",
    description: "Get details for a single pool, including 7-day history.",
    example: `curl "${BASE_URL}/pools/0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca"`,
  },
  {
    method: "GET",
    path: "/lp-strategy",
    description:
      "Pools classified as good add-liquidity candidates, grouped by holding horizon (Degen -10%, Mid -20%, Longterm -30%). Each result includes a suggested one-sided min price and estimated APR. Backward-looking estimates from trailing 24h volume, excludes impermanent loss.",
    params: [
      { name: "strategy", type: "degen | mid | longterm", description: "Strategy tab (default: degen)" },
      { name: "limit", type: "number", description: "Max results, default 50, max 200" },
    ],
    example: `curl "${BASE_URL}/lp-strategy?strategy=mid"`,
  },
  {
    method: "GET",
    path: "/tokens",
    description: "List tracked tokens with verification status.",
    params: [
      { name: "status", type: "verified | imposter | reviewing", description: "Filter by verification status" },
      { name: "category", type: "rwa | meme | other", description: "Filter by category" },
      { name: "limit", type: "number", description: "Max results, default 50, max 200" },
    ],
    example: `curl "${BASE_URL}/tokens?status=imposter"`,
  },
  {
    method: "GET",
    path: "/tokens/verified",
    description: "Shortcut: returns only verified, non-imposter RWA tokens. Useful as a trusted whitelist.",
    example: `curl "${BASE_URL}/tokens/verified"`,
  },
  {
    method: "GET",
    path: "/tokens/:address",
    description: "Get full verification detail for a single token.",
    example: `curl "${BASE_URL}/tokens/0x5fc5360d0400a0fd4f2af552add042d716f1d168"`,
  },
  {
    method: "GET",
    path: "/wallets/leaderboard",
    description: "Top smart-money wallets, ranked by total holdings value in real (non-stablecoin) tokens on Robinhood Chain, with 7-day net position change.",
    params: [{ name: "limit", type: "number", description: "Max results, default 20, max 100" }],
    example: `curl "${BASE_URL}/wallets/leaderboard?limit=10"`,
  },
  {
    method: "GET",
    path: "/wallets/:address",
    description: "Get a wallet's profile, current holdings, and recent activity.",
    example: `curl "${BASE_URL}/wallets/0x7a3f...9e21"`,
  },
  {
    method: "GET",
    path: "/heatmap",
    description: "Aggregated trading volume grouped by day of week and hour (UTC), last 7 days.",
    params: [
      { name: "category", type: "rwa | meme | other", description: "Filter by category" },
      { name: "token", type: "address", description: "Filter to a single token" },
    ],
    example: `curl "${BASE_URL}/heatmap?category=meme"`,
  },
];

export default function DocsPage() {
  return (
    <>
      <MarketingNav />
      <main className="px-8 md:px-16 py-12 max-w-4xl mx-auto">
        <p className="mono text-xs font-semibold text-[#B45309] mb-2">API DOCUMENTATION</p>
        <h1 className="text-4xl font-black tracking-tight mb-4">Popnorc Public API</h1>
        <p className="text-gray-500 max-w-2xl mb-10 leading-relaxed">
          Read-only REST API for Robinhood Chain pool, token, wallet, and volume data.
          Free to use, no API key required, CORS enabled for any origin. Built for
          dApps, bots, and AI agents that need trustworthy on-chain data.
        </p>

        <div className="bg-[#0A0A0B] text-white rounded-xl p-5 mb-12 mono text-sm">
          <p className="text-gray-400 mb-1"># Base URL</p>
          <p className="text-[#F5A623]">{BASE_URL}</p>
        </div>

        <div className="space-y-10">
          {ENDPOINTS.map((endpoint) => (
            <div key={endpoint.path} className="border border-[#E4E4E7] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 text-xs font-bold mono">
                  {endpoint.method}
                </span>
                <code className="text-sm font-semibold mono">{endpoint.path}</code>
              </div>
              <p className="text-sm text-gray-500 mb-4">{endpoint.description}</p>

              {endpoint.params && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Query Parameters
                  </p>
                  <table className="w-full text-xs">
                    <tbody>
                      {endpoint.params.map((param) => (
                        <tr key={param.name} className="border-t border-[#F0F0F1]">
                          <td className="py-2 pr-4 mono font-medium">{param.name}</td>
                          <td className="py-2 pr-4 mono text-gray-400">{param.type}</td>
                          <td className="py-2 text-gray-500">{param.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-lg p-3 mono text-xs overflow-x-auto">
                <pre>{endpoint.example}</pre>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-[#F0F0F1] pt-8 text-sm text-gray-500">
          <p className="font-semibold text-gray-900 mb-2">Rate limits</p>
          <p>
            The public API is currently unauthenticated and rate-limited per IP at the
            infrastructure level. If you need higher limits for a production integration,
            reach out through the contact info on the About page.
          </p>
        </div>
      </main>
    </>
  );
}

