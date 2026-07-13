"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";

const NAV_ITEMS = [
  { href: "/dashboard/lp", label: "LP Quality Monitor" },
  { href: "/dashboard/lp-strategy", label: "LP Strategy" },
  { href: "/dashboard/imposter", label: "Imposter Detector" },
  { href: "/dashboard/smart-money", label: "Smart Money" },
  { href: "/dashboard/heatmap", label: "Volume Heatmap" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-[#E4E4E7] bg-[#0D0D0E] flex flex-col p-5 text-white">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <Logo variant="box" size={32} />
        <span className="text-lg font-bold tracking-tight">Popnorc</span>
      </Link>
      <nav className="flex flex-col gap-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                active
                  ? "bg-[#1B1B1E] text-white font-medium"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <span className={active ? "text-[#F5A623]" : ""}>{active ? "●" : "○"}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto text-xs text-gray-600 mono">v0.1 — live on Robinhood</div>
    </aside>
  );
}
