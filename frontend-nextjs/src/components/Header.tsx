"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import HealthDot from "./HealthDot";

export default function Header() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const navLinks = [
    { href: "/", label: "Markets" },
    { href: "/results", label: "Results" },
    { href: "/history", label: "Performance" },
  ];

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        backgroundColor: "var(--glass-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--glass-border)",
        boxShadow: "var(--shadow-header)",
      }}
    >
      <div className="w-full px-6 lg:px-10">
        <div className="flex items-center justify-center h-16 relative">
          {/* Logo — left side */}
          <Link
            href="/"
            className="flex items-center space-x-3 absolute left-0"
          >
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl"
              style={{
                background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))",
                boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
              }}
            >
              <Activity size={20} color="#ffffff" strokeWidth={2.5} />
            </div>
            <span
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--text-heading)" }}
            >
              LongEntry
            </span>
          </Link>

          {/* Center Navigation */}
          <nav className="flex items-center">
            <div
              className="flex items-center p-1 rounded-xl gap-0.5"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    color: isActive(link.href)
                      ? "var(--text-heading)"
                      : "var(--text-muted)",
                    backgroundColor: isActive(link.href)
                      ? "var(--bg-card)"
                      : "transparent",
                    boxShadow: isActive(link.href)
                      ? "0 1px 3px rgba(0,0,0,0.2)"
                      : "none",
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Right side controls */}
          <div className="flex items-center space-x-3 absolute right-0">
            <HealthDot />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
