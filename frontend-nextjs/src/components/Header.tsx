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
    { href: "/history", label: "History" },
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
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center space-x-2.5 flex-shrink-0"
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{
                background: "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))",
              }}
            >
              <Activity size={16} color="#ffffff" strokeWidth={2.5} />
            </div>
            <span
              className="text-lg font-bold tracking-tight"
              style={{ color: "var(--text-heading)" }}
            >
              LongEntry
            </span>
          </Link>

          {/* Center Navigation */}
          <nav className="flex items-center">
            <div
              className="flex items-center p-1 rounded-lg gap-0.5"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
                  style={{
                    color: isActive(link.href)
                      ? "var(--text-heading)"
                      : "var(--text-muted)",
                    backgroundColor: isActive(link.href)
                      ? "var(--bg-card)"
                      : "transparent",
                    boxShadow: isActive(link.href)
                      ? "0 1px 2px rgba(0,0,0,0.15)"
                      : "none",
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Right side controls */}
          <div className="flex items-center space-x-3">
            <HealthDot />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
