"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useTheme } from "@/hooks/useTheme";
import { formatAddress } from "@/lib/format";
import { Sun, Moon, Wallet, LogOut, Zap } from "lucide-react";

// Category filter definitions
const CATEGORIES = [
  { label: "All", slug: "all" },
  { label: "Crypto", slug: "crypto" },
  { label: "Politics", slug: "politics" },
  { label: "Sports", slug: "sports" },
  { label: "Tech", slug: "tech" },
  { label: "Other", slug: "other" },
] as const;

const RUSH_CARS_URL = "https://www.rushgame.vip";

export default function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showConnectors, setShowConnectors] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close connector dropdown on outside click/tap
  React.useEffect(() => {
    if (!showConnectors) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowConnectors(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showConnectors]);

  const activeCategory = searchParams.get("category") || "all";

  const handleCategoryClick = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === "all") {
      params.delete("category");
    } else {
      params.set("category", slug);
    }
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        background: "rgba(10,10,10,0.80)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/logo.png"
            alt="Rush"
            className="h-8 w-8 rounded-lg group-hover:scale-110 transition-transform duration-200"
            style={{ filter: "drop-shadow(0 0 6px rgba(0,255,136,0.4))" }}
          />
          <span
            className="text-xl font-black tracking-wider neon-green"
            style={{ letterSpacing: "0.15em" }}
          >
            RUSH
          </span>
        </Link>

        {/* Rush Cars link */}
        <a
          href={RUSH_CARS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all hover:scale-105"
          style={{
            background: "rgba(0,255,136,0.06)",
            border: "1px solid rgba(0,255,136,0.15)",
            color: "#00ff88",
          }}
        >
          <span style={{ fontSize: 14 }}>🏎️</span>
          Rush Cars
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "#ff4444" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "#ff4444" }} />
          </span>
        </a>

        {/* Right side: theme toggle + wallet */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-gray-400" />
            ) : (
              <Moon className="h-4 w-4 text-gray-600" />
            )}
          </button>

          {/* Wallet */}
          {isConnected && address ? (
            <div className="flex items-center gap-2">
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-mono"
                style={{
                  background: "rgba(0,255,136,0.08)",
                  border: "1px solid rgba(0,255,136,0.2)",
                  color: "#00ff88",
                }}
              >
                {formatAddress(address)}
              </span>
              <button
                onClick={() => disconnect()}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                aria-label="Disconnect wallet"
              >
                <LogOut className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowConnectors(!showConnectors)}
                className="btn-primary flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-bold"
              >
                <Wallet className="h-3.5 w-3.5" />
                Connect
              </button>

              {/* Connector dropdown */}
              {showConnectors && (
                <div
                  className="absolute right-0 top-full mt-2 min-w-[180px] rounded-lg p-2"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  }}
                >
                  {connectors.map((connector) => (
                    <button
                      key={connector.uid}
                      onClick={() => {
                        connect({ connector });
                        setShowConnectors(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5"
                    >
                      {connector.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category filter bar */}
      <div
        className="mx-auto max-w-7xl overflow-x-auto px-4 py-1.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}
      >
        <div className="flex items-center gap-1.5 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => handleCategoryClick(cat.slug)}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all whitespace-nowrap"
              style={
                activeCategory === cat.slug
                  ? {
                      background: "rgba(0,255,136,0.12)",
                      color: "#00ff88",
                      border: "1px solid rgba(0,255,136,0.25)",
                    }
                  : {
                      background: "transparent",
                      color: "#666",
                      border: "1px solid transparent",
                    }
              }
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
