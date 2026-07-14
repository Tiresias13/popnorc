export function DashboardFooter({
  lastSyncedAt,
  dark,
}: {
  lastSyncedAt?: string | null;
  dark?: boolean;
}) {
  const label = lastSyncedAt
    ? `last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : "last synced —";

  return (
    <footer
      className={`shrink-0 border-t px-8 py-3 flex items-center justify-between text-xs ${
        dark
          ? "border-[#1F1F22] bg-[#0A0A0B] text-gray-500"
          : "border-[#E4E4E7] bg-white text-gray-400"
      }`}
    >
      <span className="mono">{label} · data: geckoterminal, blockscout</span>
      <span>not financial advice · dyor</span>
    </footer>
  );
}
