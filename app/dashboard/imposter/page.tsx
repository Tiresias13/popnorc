import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Token } from "@/types/database";

export const dynamic = "force-dynamic";

function statusStyles(status: string) {
  if (status === "verified") {
    return {
      cardClass: "bg-white border-[#E4E4E7]",
      badgeClass: "bg-emerald-50 text-emerald-600",
      label: "✓ Verified",
      iconBg: "bg-blue-50 text-blue-600",
    };
  }
  if (status === "imposter") {
    return {
      cardClass: "bg-red-50/50 border-red-200",
      badgeClass: "bg-red-50 text-red-600",
      label: "⚠ Imposter",
      iconBg: "bg-red-50 text-red-600",
    };
  }
  return {
    cardClass: "bg-amber-50/40 border-amber-200",
    badgeClass: "bg-amber-50 text-amber-600",
    label: "? Reviewing",
    iconBg: "bg-amber-50 text-amber-600",
  };
}

export default async function ImposterDetectorPage() {
  const { data: tokens } = await supabase
    .from("tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(60);

  const typedTokens = (tokens || []) as Token[];
  const imposterCount = typedTokens.filter((t) => t.verification_status === "imposter").length;
  const lastSynced = typedTokens[0]?.updated_at ?? null;

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#E4E4E7]">
          <div>
            <h1 className="text-xl font-semibold">Imposter Ticker Detector</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {imposterCount} imposter token{imposterCount === 1 ? "" : "s"} flagged
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-8 py-6">
          {typedTokens.map((token) => {
            const style = statusStyles(token.verification_status);
            return (
              <div
                key={token.token_address}
                className={`border rounded-2xl p-5 ${style.cardClass}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${style.iconBg}`}
                    >
                      {token.symbol.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold">{token.symbol}</p>
                      <p className="text-xs text-gray-500 mono">
                        {token.token_address.slice(0, 6)}...
                        {token.token_address.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.badgeClass}`}>
                    {style.label}
                  </span>
                </div>
                <div className="space-y-2 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Matches official docs</span>
                    <span>{token.matches_official_docs ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Name similarity</span>
                    <span>{token.name_similarity_score ?? "—"}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Liquidity locked</span>
                    <span>{token.liquidity_locked_pct ?? "—"}%</span>
                  </div>
                </div>
                {token.flagged_reason && (
                  <p className="text-[11px] text-gray-500 mt-3 border-t border-gray-200 pt-2">
                    {token.flagged_reason}
                  </p>
                )}
              </div>
            );
          })}
          {typedTokens.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-16">
              <p className="text-sm font-medium text-gray-500 mb-1">No imposters detected — yet.</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                This view only populates once a tokenized-stock ticker (ending in "-hood") shows up
                in the tracked pools. Nothing suspicious has surfaced so far.
              </p>
            </div>
          )}
        </div>
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} />
    </>
  );
}
