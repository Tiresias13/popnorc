import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function MarketingNav() {
  return (
    <nav className="flex items-center justify-between px-8 md:px-16 py-5">
      <Link href="/" className="flex items-center gap-2">
        <Logo variant="standalone" size={28} />
        <span className="text-lg font-bold tracking-tight">Popnorc</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm text-gray-500 font-medium">
        <a href="/#features" className="hover:text-black">
          Product
        </a>
        <Link href="/docs" className="hover:text-black">
          Docs
        </Link>
        <a href="https://twitter.com" className="hover:text-black">
          Twitter
        </a>
      </div>
      <Link
        href="/dashboard/lp"
        className="px-4 py-2 rounded-full bg-[#0A0A0B] text-white text-sm font-medium"
      >
        Launch App
      </Link>
    </nav>
  );
}
