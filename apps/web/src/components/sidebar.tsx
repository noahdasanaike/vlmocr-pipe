"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Plus,
  Database,
  Settings,
  BarChart3,
  ScanSearch,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs/new", label: "New Job", icon: Plus },
  { href: "/compare", label: "Compare", icon: ScanSearch },
  { href: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
  { href: "/models", label: "Saved Models", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-col bg-slate-100">
      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-2">
        <h1 className="text-base font-semibold text-slate-800">
          vlmocr-pipe
        </h1>
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
