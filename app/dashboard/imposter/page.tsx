import { supabase } from "@/lib/supabase/client";
import { DashboardFooter } from "@/components/dashboard/footer";
import { Token } from "@/types/database";

export const dynamic = "force-dynamic";

function statusStyles(status: string) {
  if (status === "verified") {
    return {
      cardClass: "bg-[#131315] border-[#1F1F22]",
      badgeClass: "bg-emerald-500/10 text-emerald-400",
      label: "✓ verified",
      iconBg: "bg-blue-500/10 text-blue-400",
    };
  }
  if (status === "imposter") {
    return {
      cardClass: "bg-[rgba(248,113,113,0.06)] border-[rgba(248,113,113,0.3)]",
      badgeClass: "bg-red-500/10 text-red-400",
      label: "⚠ imposter",
      iconBg: "bg-red-500/10 text-red-400",
    };
  }
  return {
    cardClass: "bg-[rgba(251,191,36,0.05)] border-[rgba(251,191,36,0.25)]",
    badgeClass: "bg-amber-500/10 text-amber-400",
    label: "? reviewing",
    iconBg: "bg-amber-500/10 text-amber-400",
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
      <main className="flex-1 overflow-y-auto bg-[#0A0A0B]">
        <div className="flex items-center justify-between px-4 md:px-8 py-5 border-b border-[#1F1F22]">
          <div>
            <h1 className="text-xl font-semibold text-white">imposter detector</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {imposterCount} fake ticker{imposterCount === 1 ? "" : "s"} caught so far
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 md:gap-4 px-4 md:px-8 py-6">
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
                      <p className="font-semibold text-white">{token.symbol}</p>
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
                    <span>matches official docs</span>
                    <span className="text-gray-300">{token.matches_official_docs ? "yes" : "no"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>name similarity</span>
                    <span className="text-gray-300">{token.name_similarity_score ?? "—"}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>liquidity locked</span>
                    <span className="text-gray-300">{token.liquidity_locked_pct ?? "—"}%</span>
                  </div>
                </div>
                {token.flagged_reason && (
                  <p className="text-[11px] text-gray-500 mt-3 border-t border-[#1F1F22] pt-2">
                    {token.flagged_reason}
                  </p>
                )}
              </div>
            );
          })}
          {typedTokens.length === 0 && (
            <div className="col-span-3 text-center text-gray-500 py-16">
              <p className="text-sm font-medium text-gray-300 mb-1">nothing sus yet.</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                this fills in once a tokenized-stock ticker (ending in "-hood") shows up in the
                tracked pools. nothing suspicious has surfaced so far.
              </p>
            </div>
          )}
        </div>
      </main>
      <DashboardFooter lastSyncedAt={lastSynced} dark />
    </>
  );
}
