export function DashboardFooter({ lastSyncedAt }: { lastSyncedAt?: string | null }) {
  const label = lastSyncedAt
    ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : "Last synced —";

  return (
    <footer className="shrink-0 border-t border-[#E4E4E7] px-8 py-3 flex items-center justify-between text-xs text-gray-400 bg-white">
      <span className="mono">{label} · Data: GeckoTerminal, Blockscout</span>
      <span>Popnorc is not financial advice · DYOR</span>
    </footer>
  );
}
