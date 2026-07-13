import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function MarketingNav() {
  return (
    <nav className="flex items-center justify-between px-4 md:px-16 py-5 gap-3">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <Logo variant="standalone" size={28} />
        <span className="text-lg font-bold tracking-tight">Popnorc</span>
      </Link>
      <div className="flex items-center gap-4 md:gap-8 text-xs md:text-sm text-gray-500 font-medium">
        <Link href="/docs" className="hover:text-black">
          Docs
        </Link>
        <Link href="/about" className="hover:text-black">
          About
        </Link>
      </div>
      <Link
        href="/dashboard/lp"
        className="px-3 md:px-4 py-2 rounded-full bg-[#0A0A0B] text-white text-xs md:text-sm font-medium shrink-0"
      >
        Launch App
      </Link>
    </nav>
  );
}

