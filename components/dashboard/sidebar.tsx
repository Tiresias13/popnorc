"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";

const NAV_ITEMS = [
  { href: "/dashboard/lp", label: "lp monitor" },
  { href: "/dashboard/lp-strategy", label: "lp strategy" },
  { href: "/dashboard/imposter", label: "imposter detector" },
  { href: "/dashboard/smart-money", label: "smart money" },
  { href: "/dashboard/heatmap", label: "the heatmap" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer automatically whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar — hamburger trigger, hidden on desktop */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#E4E4E7] bg-[#0D0D0E] text-white">
        <Link href="/" className="flex items-center gap-2">
          <Logo variant="box" size={26} />
          <span className="text-base font-bold tracking-tight">Popnorc</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 text-white"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setOpen(false)}
        >
          <aside
            className="w-64 h-full bg-[#0D0D0E] text-white p-5 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-10">
              <Link href="/" className="flex items-center gap-2">
                <Logo variant="box" size={32} />
                <span className="text-lg font-bold tracking-tight">Popnorc</span>
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-1 text-gray-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-1 text-sm">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      active ? "bg-[#1B1B1E] text-white font-medium" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <span className={active ? "text-[#F5A623]" : ""}>{active ? "●" : "○"}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto text-xs text-gray-600 mono">v0.1 — live on robinhood chain</div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E4E4E7] bg-[#0D0D0E] flex-col p-5 text-white">
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
                  active ? "bg-[#1B1B1E] text-white font-medium" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className={active ? "text-[#F5A623]" : ""}>{active ? "●" : "○"}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto text-xs text-gray-600 mono">v0.1 — live on robinhood chain</div>
      </aside>
    </>
  );
}
