"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Plus,
  Database,
  Settings,
  BarChart3,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs/new", label: "New Job", icon: Plus },
  { href: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
  { href: "/models", label: "Saved Models", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-col bg-slate-100">
      {/* Winter painting header */}
      <div className="relative h-36 shrink-0 overflow-hidden">
        <Image
          src="/art/monet-sandvika-snow.jpg"
          alt=""
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-100" />
        <div className="absolute bottom-3 left-4 z-10">
          <h1 className="text-base font-semibold text-slate-800 drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
            vlmocr-pipe
          </h1>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-white text-slate-900 font-medium shadow-sm"
                  : "text-slate-500 hover:bg-white/60 hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
