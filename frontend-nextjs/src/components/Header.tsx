"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";
import HealthDot from "./HealthDot";

export default function Header() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isActive = (path: string) => pathname === path;

  const navLinks = [
    { href: "/", label: "Markets" },
    { href: "/results", label: "Results" },
    { href: "/history", label: "History" },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-solid)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center space-x-2 flex-shrink-0"
            style={{ color: "var(--text-heading)" }}
          >
            <span className="text-2xl font-bold">LongEntry</span>
          </Link>

          {/* Desktop Navigation */}
          {!isMobile && (
            <nav className="hidden md:flex items-center space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    color: isActive(link.href)
                      ? "var(--accent-blue)"
                      : "var(--text-body)",
                    backgroundColor: isActive(link.href)
                      ? "var(--bg-hover)"
                      : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right side controls */}
          <div className="flex items-center space-x-4">
            <HealthDot />
            <ThemeToggle />
            <button
              className="p-2 rounded-md transition-colors hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
              aria-label="Settings"
            >
              <Settings size={20} />
            </button>

            {/* Mobile menu button */}
            {isMobile && (
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-md transition-colors"
                style={{ color: "var(--text-body)" }}
                aria-label="Toggle menu"
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobile && isMenuOpen && (
          <nav
            className="md:hidden pb-4"
            style={{ borderTopColor: "var(--border-solid)" }}
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-2 rounded-md text-base font-medium transition-colors"
                style={{
                  color: isActive(link.href)
                    ? "var(--accent-blue)"
                    : "var(--text-body)",
                  backgroundColor: isActive(link.href)
                    ? "var(--bg-hover)"
                    : "transparent",
                }}
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
