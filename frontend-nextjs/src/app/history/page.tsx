"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Trophy,
  Target,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { getResults, getMarkets, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

/* ─── Constants ───────────────────────────────────────────────────────── */

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  index: {
    label: "Indices",
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.1)",
  },
  commodity: {
    label: "Commodities",
    color: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.1)",
  },
  stock: {
    label: "Stocks",
    color: "#8b5cf6",
    bgColor: "rgba(139, 92, 246, 0.1)",
  },
};

// Distinct colors for each market
const SYMBOL_COLORS: Record<string, string> = {
  // Indices — blues/teals
  US30: "#3b82f6",
  US100: "#06b6d4",
  US500: "#2563eb",
  GER40: "#0ea5e9",
  UK100: "#6366f1",
  JPN225: "#818cf8",
  AUS200: "#38bdf8",
  // Commodities — amber/orange
  XAUUSD: "#f59e0b",
  XAGUSD: "#d97706",
  USOIL: "#ea580c",
  UKOIL: "#f97316",
  // Stocks — purple/pink
  AAPL: "#8b5cf6",
  MSFT: "#a855f7",
  TSLA: "#d946ef",
  NVDA: "#c084fc",
  AMZN: "#e879f9",
  GOOGL: "#7c3aed",
  META: "#a78bfa",
};

function getColor(symbol: string): string {
  return SYMBOL_COLORS[symbol] || "#64748b";
}

/* ─── Types ───────────────────────────────────────────────────────────── */

interface EquityPoint {
  week: string; // ISO date
  [symbol: string]: number | string; // cumulative P&L per symbol
}

interface SymbolStats {
  symbol: string;
  category: string;
  totalPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  weeksActive: number;
  bestWeek: number;
  worstWeek: number;
}

/* ─── Main Page ───────────────────────────────────────────────────────── */

export default function PerformancePage() {
  const [results, setResults] = useState<Types.WeeklyResult[]>([]);
  const [markets, setMarkets] = useState<Types.Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(["index", "commodity", "stock"])
  );
  const [activeTab, setActiveTab] = useState<
    "equity" | "weekly" | "breakdown"
  >("equity");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [resultsData, marketsData] = await Promise.all([
          getResults(),
          getMarkets(),
        ]);
        setResults(resultsData);
        setMarkets(marketsData);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Category lookup
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    markets.forEach((m) => {
      map[m.symbol] = m.category;
    });
    return map;
  }, [markets]);

  // Get all symbols from results that match active categories
  const allSymbols = useMemo(() => {
    const symbolSet = new Set<string>();
    results.forEach((week) => {
      week.results.forEach((r) => {
        if (activeCategories.has(categoryMap[r.symbol] ?? "")) {
          symbolSet.add(r.symbol);
        }
      });
    });
    return Array.from(symbolSet).sort();
  }, [results, activeCategories, categoryMap]);

  // Build equity curve data: cumulative P&L per symbol over time
  const equityData = useMemo(() => {
    // Sort weeks oldest first
    const sortedWeeks = [...results].sort(
      (a, b) =>
        new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
    );

    const cumulative: Record<string, number> = {};
    const data: EquityPoint[] = [];

    sortedWeeks.forEach((week) => {
      const point: EquityPoint = { week: week.week_start };

      week.results.forEach((r) => {
        if (!activeCategories.has(categoryMap[r.symbol] ?? "")) return;
        cumulative[r.symbol] =
          (cumulative[r.symbol] || 0) + r.total_pnl_percent;
        point[r.symbol] = Math.round(cumulative[r.symbol] * 100) / 100;
      });

      // Also compute total portfolio
      let total = 0;
      for (const sym of allSymbols) {
        total += cumulative[sym] || 0;
      }
      point["_total"] = Math.round(total * 100) / 100;

      data.push(point);
    });

    return data;
  }, [results, activeCategories, categoryMap, allSymbols]);

  // Weekly bar chart data
  const weeklyBarData = useMemo(() => {
    const sortedWeeks = [...results].sort(
      (a, b) =>
        new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
    );

    return sortedWeeks.map((week) => {
      let pnl = 0;
      let trades = 0;
      let wins = 0;
      week.results.forEach((r) => {
        if (!activeCategories.has(categoryMap[r.symbol] ?? "")) return;
        pnl += r.total_pnl_percent;
        trades += r.trades_taken;
        wins += r.wins;
      });
      return {
        week: week.week_start,
        pnl: Math.round(pnl * 100) / 100,
        trades,
        wins,
        winRate: trades > 0 ? Math.round((wins / trades) * 100) : 0,
      };
    });
  }, [results, activeCategories, categoryMap]);

  // Per-symbol stats
  const symbolStats = useMemo(() => {
    const stats: Record<string, SymbolStats> = {};

    results.forEach((week) => {
      week.results.forEach((r) => {
        const cat = categoryMap[r.symbol] ?? "";
        if (!activeCategories.has(cat)) return;

        if (!stats[r.symbol]) {
          stats[r.symbol] = {
            symbol: r.symbol,
            category: cat,
            totalPnl: 0,
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            weeksActive: 0,
            bestWeek: -Infinity,
            worstWeek: Infinity,
          };
        }

        const s = stats[r.symbol];
        s.totalPnl += r.total_pnl_percent;
        s.totalTrades += r.trades_taken;
        s.wins += r.wins;
        s.losses += r.losses;
        s.weeksActive++;
        if (r.total_pnl_percent > s.bestWeek) s.bestWeek = r.total_pnl_percent;
        if (r.total_pnl_percent < s.worstWeek)
          s.worstWeek = r.total_pnl_percent;
      });
    });

    // Compute win rates and round
    Object.values(stats).forEach((s) => {
      s.totalPnl = Math.round(s.totalPnl * 100) / 100;
      s.winRate =
        s.totalTrades > 0
          ? Math.round((s.wins / s.totalTrades) * 100)
          : 0;
      if (s.bestWeek === -Infinity) s.bestWeek = 0;
      if (s.worstWeek === Infinity) s.worstWeek = 0;
      s.bestWeek = Math.round(s.bestWeek * 100) / 100;
      s.worstWeek = Math.round(s.worstWeek * 100) / 100;
    });

    return Object.values(stats).sort((a, b) => b.totalPnl - a.totalPnl);
  }, [results, activeCategories, categoryMap]);

  // Summary totals
  const summary = useMemo(() => {
    const totalPnl = symbolStats.reduce((sum, s) => sum + s.totalPnl, 0);
    const totalTrades = symbolStats.reduce((sum, s) => sum + s.totalTrades, 0);
    const totalWins = symbolStats.reduce((sum, s) => sum + s.wins, 0);
    const best = symbolStats[0];
    const worst = symbolStats[symbolStats.length - 1];
    return {
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalTrades,
      winRate:
        totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0,
      bestMarket: best?.symbol ?? "—",
      bestMarketPnl: best?.totalPnl ?? 0,
      worstMarket: worst?.symbol ?? "—",
      worstMarketPnl: worst?.totalPnl ?? 0,
      activeSymbols: symbolStats.length,
      weeksTracked: results.length,
    };
  }, [symbolStats, results]);

  const toggleCategory = (cat: string) => {
    const updated = new Set(activeCategories);
    if (updated.has(cat)) {
      if (updated.size > 1) updated.delete(cat);
    } else {
      updated.add(cat);
    }
    setActiveCategories(updated);
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { index: 0, commodity: 0, stock: 0 };
    markets.forEach((m) => {
      counts[m.category] = (counts[m.category] || 0) + 1;
    });
    return counts;
  }, [markets]);

  if (loading) {
    return (
      <div className="min-h-screen px-6 lg:px-10 py-8">
        <div style={{ color: "var(--text-heading)" }}>
          <h1 className="text-2xl font-bold tracking-tight mb-8 text-center">
            Performance
          </h1>
          <SkeletonLoading />
        </div>
      </div>
    );
  }

  const hasData = results.length > 0;

  return (
    <div className="min-h-screen px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1
          className="text-2xl font-bold tracking-tight mb-2"
          style={{ color: "var(--text-heading)" }}
        >
          Performance
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Real trading P&L across all markets
          {summary.weeksTracked > 0 && (
            <span>
              {" "}
              · {summary.weeksTracked} week
              {summary.weeksTracked !== 1 ? "s" : ""} tracked
            </span>
          )}
        </p>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} />}

      {!hasData && !error ? (
        <EmptyState />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <SummaryCard
              label="Total P&L"
              value={`${summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl}%`}
              icon={
                summary.totalPnl >= 0 ? (
                  <TrendingUp size={18} />
                ) : (
                  <TrendingDown size={18} />
                )
              }
              color={summary.totalPnl >= 0 ? "#22c55e" : "#ef4444"}
            />
            <SummaryCard
              label="Win Rate"
              value={`${summary.winRate}%`}
              icon={<Target size={18} />}
              color={
                summary.winRate >= 50
                  ? "#22c55e"
                  : summary.winRate >= 40
                    ? "#f59e0b"
                    : "#ef4444"
              }
              subtitle={`${summary.totalTrades} trades`}
            />
            <SummaryCard
              label="Best Market"
              value={summary.bestMarket}
              icon={<Trophy size={18} />}
              color="#22c55e"
              subtitle={`+${summary.bestMarketPnl}%`}
            />
            <SummaryCard
              label="Worst Market"
              value={summary.worstMarket}
              icon={<BarChart3 size={18} />}
              color="#ef4444"
              subtitle={`${summary.worstMarketPnl}%`}
            />
          </div>

          {/* Category Toggles + Tabs */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            {/* Categories */}
            <div className="flex gap-2">
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => toggleCategory(key)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: activeCategories.has(key)
                      ? config.bgColor
                      : "var(--bg-surface)",
                    color: activeCategories.has(key)
                      ? config.color
                      : "var(--text-faint)",
                    border: `1.5px solid ${activeCategories.has(key) ? config.color + "40" : "var(--border-solid)"}`,
                  }}
                >
                  {config.label}
                  <span
                    className="ml-1.5 text-xs font-normal"
                    style={{ opacity: 0.7 }}
                  >
                    ({categoryCounts[key] || 0})
                  </span>
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div
              className="flex p-0.5 rounded-lg"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              {(
                [
                  { id: "equity", label: "Equity Curve" },
                  { id: "weekly", label: "Weekly P&L" },
                  { id: "breakdown", label: "Per Market" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    backgroundColor:
                      activeTab === tab.id ? "var(--bg-card)" : "transparent",
                    color:
                      activeTab === tab.id
                        ? "var(--text-heading)"
                        : "var(--text-faint)",
                    boxShadow:
                      activeTab === tab.id
                        ? "0 1px 2px rgba(0,0,0,0.1)"
                        : "none",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "equity" && (
            <EquityCurveTab
              equityData={equityData}
              symbols={allSymbols}
              categoryMap={categoryMap}
            />
          )}
          {activeTab === "weekly" && (
            <WeeklyPnlTab data={weeklyBarData} />
          )}
          {activeTab === "breakdown" && (
            <MarketBreakdownTab stats={symbolStats} />
          )}
        </>
      )}
    </div>
  );
}

/* ─── Equity Curve Tab ────────────────────────────────────────────────── */

interface EquityCurveTabProps {
  equityData: EquityPoint[];
  symbols: string[];
  categoryMap: Record<string, string>;
}

function EquityCurveTab({ equityData, symbols, categoryMap }: EquityCurveTabProps) {
  const [showTotal, setShowTotal] = useState(true);
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(new Set());

  const toggleSymbol = (symbol: string) => {
    const updated = new Set(hiddenSymbols);
    if (updated.has(symbol)) {
      updated.delete(symbol);
    } else {
      updated.add(symbol);
    }
    setHiddenSymbols(updated);
  };

  const visibleSymbols = symbols.filter((s) => !hiddenSymbols.has(s));

  return (
    <div>
      {/* Legend */}
      <div
        className="p-4 rounded-xl mb-6"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <p
            className="text-xs font-medium"
            style={{ color: "var(--text-faint)" }}
          >
            Click to show/hide · {visibleSymbols.length} of {symbols.length}{" "}
            visible
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTotal(!showTotal)}
              className="text-[10px] font-medium px-2.5 py-1 rounded-md"
              style={{
                color: showTotal ? "#22c55e" : "var(--text-muted)",
                backgroundColor: showTotal
                  ? "rgba(34, 197, 94, 0.1)"
                  : "var(--bg-surface)",
                border: `1px solid ${showTotal ? "rgba(34, 197, 94, 0.3)" : "var(--border-solid)"}`,
              }}
            >
              Portfolio Total
            </button>
            <button
              onClick={() => setHiddenSymbols(new Set())}
              className="text-[10px] font-medium px-2 py-1 rounded-md"
              style={{
                color: "var(--accent-blue)",
                backgroundColor: "rgba(59, 130, 246, 0.08)",
              }}
            >
              Show All
            </button>
            <button
              onClick={() => setHiddenSymbols(new Set(symbols))}
              className="text-[10px] font-medium px-2 py-1 rounded-md"
              style={{
                color: "var(--text-muted)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              Hide All
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {symbols.map((symbol) => {
            const color = getColor(symbol);
            const isVisible = !hiddenSymbols.has(symbol);
            return (
              <button
                key={symbol}
                onClick={() => toggleSymbol(symbol)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: isVisible ? color + "18" : "var(--bg-surface)",
                  color: isVisible ? color : "var(--text-faint)",
                  border: `1px solid ${isVisible ? color + "30" : "var(--border-solid)"}`,
                  opacity: isVisible ? 1 : 0.4,
                }}
              >
                {symbol}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div
        className="p-6 rounded-xl"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        {equityData.length === 0 ? (
          <div
            className="h-96 flex items-center justify-center"
            style={{ color: "var(--text-faint)" }}
          >
            No performance data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={480}>
            <LineChart data={equityData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.3}
              />
              <XAxis
                dataKey="week"
                stroke="var(--text-faint)"
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => {
                  const d = new Date(value);
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <YAxis
                stroke="var(--text-faint)"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ReferenceLine y={0} stroke="var(--text-faint)" strokeDasharray="3 3" opacity={0.5} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-solid)",
                  borderRadius: "0.75rem",
                  color: "var(--text-body)",
                  fontSize: "12px",
                }}
                formatter={(value: any, name?: string) => {
                  const label =
                    name === "_total" ? "Portfolio" : (name ?? "");
                  if (typeof value === "number") {
                    return [
                      `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
                      label,
                    ] as [string, string];
                  }
                  return [value, label] as [string, string];
                }}
                labelFormatter={(label: any) => {
                  const d = new Date(label);
                  return d.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  });
                }}
              />

              {/* Individual symbol lines */}
              {visibleSymbols.map((symbol) => (
                <Line
                  key={symbol}
                  type="monotone"
                  dataKey={symbol}
                  stroke={getColor(symbol)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              ))}

              {/* Portfolio total line */}
              {showTotal && (
                <Line
                  type="monotone"
                  dataKey="_total"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={false}
                  strokeDasharray="6 3"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ─── Weekly P&L Bar Chart Tab ────────────────────────────────────────── */

interface WeeklyBarData {
  week: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

function WeeklyPnlTab({ data }: { data: WeeklyBarData[] }) {
  return (
    <div>
      {/* Bar Chart */}
      <div
        className="p-6 rounded-xl mb-6"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--text-heading)" }}
        >
          Weekly P&L
        </h3>
        {data.length === 0 ? (
          <div
            className="h-80 flex items-center justify-center"
            style={{ color: "var(--text-faint)" }}
          >
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.3}
              />
              <XAxis
                dataKey="week"
                stroke="var(--text-faint)"
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => {
                  const d = new Date(value);
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <YAxis
                stroke="var(--text-faint)"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ReferenceLine y={0} stroke="var(--text-faint)" strokeDasharray="3 3" opacity={0.5} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-solid)",
                  borderRadius: "0.75rem",
                  color: "var(--text-body)",
                  fontSize: "12px",
                }}
                formatter={(value: any, name?: string) => {
                  if (name === "pnl") {
                    return [
                      `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`,
                      "P&L",
                    ] as [string, string];
                  }
                  return [value, name ?? ""] as [string, string];
                }}
                labelFormatter={(label: any) => {
                  const d = new Date(label);
                  return `Week of ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
                }}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-solid)" }}>
              {["Week", "P&L", "Trades", "Win Rate"].map((h) => (
                <th
                  key={h}
                  className="text-left p-3 font-semibold text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((row) => (
              <tr
                key={row.week}
                style={{ borderBottom: "1px solid var(--border-solid)" }}
              >
                <td className="p-3" style={{ color: "var(--text-body)" }}>
                  {new Date(row.week).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td
                  className="p-3 font-bold"
                  style={{
                    color: row.pnl >= 0 ? "#22c55e" : "#ef4444",
                  }}
                >
                  {row.pnl >= 0 ? "+" : ""}
                  {row.pnl.toFixed(2)}%
                </td>
                <td className="p-3" style={{ color: "var(--text-body)" }}>
                  {row.trades}
                </td>
                <td className="p-3" style={{ color: "var(--text-body)" }}>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
                    style={{
                      backgroundColor:
                        row.winRate >= 50
                          ? "rgba(34, 197, 94, 0.1)"
                          : row.winRate >= 40
                            ? "rgba(245, 158, 11, 0.1)"
                            : "rgba(239, 68, 68, 0.1)",
                      color:
                        row.winRate >= 50
                          ? "#22c55e"
                          : row.winRate >= 40
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  >
                    {row.winRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Market Breakdown Tab ────────────────────────────────────────────── */

function MarketBreakdownTab({ stats }: { stats: SymbolStats[] }) {
  return (
    <div>
      {/* Per-market P&L bar visualization */}
      <div
        className="p-6 rounded-xl mb-6"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--text-heading)" }}
        >
          Cumulative P&L by Market
        </h3>
        {stats.length === 0 ? (
          <div
            className="h-40 flex items-center justify-center"
            style={{ color: "var(--text-faint)" }}
          >
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, stats.length * 40)}>
            <BarChart data={stats} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.3}
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke="var(--text-faint)"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                stroke="var(--text-faint)"
                tick={{ fontSize: 12, fontWeight: 600 }}
                width={80}
              />
              <ReferenceLine x={0} stroke="var(--text-faint)" strokeDasharray="3 3" opacity={0.5} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-solid)",
                  borderRadius: "0.75rem",
                  color: "var(--text-body)",
                  fontSize: "12px",
                }}
                formatter={(value: any) => {
                  return [
                    `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`,
                    "Total P&L",
                  ] as [string, string];
                }}
              />
              <Bar dataKey="totalPnl" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {stats.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.totalPnl >= 0 ? "#22c55e" : "#ef4444"}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Detailed table */}
      <div
        className="rounded-xl overflow-x-auto"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-solid)" }}>
              {[
                "Market",
                "Total P&L",
                "Trades",
                "Win Rate",
                "Best Week",
                "Worst Week",
                "Weeks",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left p-3 font-semibold text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr
                key={s.symbol}
                style={{ borderBottom: "1px solid var(--border-solid)" }}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: getColor(s.symbol) }}
                    />
                    <span
                      className="font-bold text-sm"
                      style={{ color: "var(--text-heading)" }}
                    >
                      {s.symbol}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-md"
                      style={{
                        color:
                          CATEGORY_CONFIG[s.category]?.color ??
                          "var(--text-muted)",
                        backgroundColor:
                          CATEGORY_CONFIG[s.category]?.bgColor ??
                          "var(--bg-surface)",
                      }}
                    >
                      {CATEGORY_CONFIG[s.category]?.label ?? s.category}
                    </span>
                  </div>
                </td>
                <td
                  className="p-3 font-bold"
                  style={{
                    color: s.totalPnl >= 0 ? "#22c55e" : "#ef4444",
                  }}
                >
                  {s.totalPnl >= 0 ? "+" : ""}
                  {s.totalPnl.toFixed(2)}%
                </td>
                <td className="p-3" style={{ color: "var(--text-body)" }}>
                  {s.totalTrades}
                  <span
                    className="text-xs ml-1"
                    style={{ color: "var(--text-faint)" }}
                  >
                    ({s.wins}W / {s.losses}L)
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
                    style={{
                      backgroundColor:
                        s.winRate >= 50
                          ? "rgba(34, 197, 94, 0.1)"
                          : s.winRate >= 40
                            ? "rgba(245, 158, 11, 0.1)"
                            : "rgba(239, 68, 68, 0.1)",
                      color:
                        s.winRate >= 50
                          ? "#22c55e"
                          : s.winRate >= 40
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  >
                    {s.winRate}%
                  </span>
                </td>
                <td
                  className="p-3 text-sm"
                  style={{ color: "#22c55e" }}
                >
                  +{s.bestWeek.toFixed(2)}%
                </td>
                <td
                  className="p-3 text-sm"
                  style={{ color: "#ef4444" }}
                >
                  {s.worstWeek.toFixed(2)}%
                </td>
                <td className="p-3" style={{ color: "var(--text-body)" }}>
                  {s.weeksActive}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Shared Components ───────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-solid)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color, opacity: 0.8 }}>{icon}</div>
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-6 p-4 rounded-xl flex items-start space-x-3"
      style={{
        backgroundColor: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
      }}
    >
      <AlertCircle
        size={18}
        style={{
          color: "var(--accent-red)",
          flexShrink: 0,
          marginTop: "2px",
        }}
      />
      <div>
        <p
          className="font-medium text-sm"
          style={{ color: "var(--accent-red)" }}
        >
          Error loading performance data
        </p>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          {message}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="p-12 rounded-xl text-center"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-solid)",
      }}
    >
      <BarChart3
        size={48}
        style={{ color: "var(--text-faint)", margin: "0 auto 16px" }}
      />
      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: "var(--text-heading)" }}
      >
        No performance data yet
      </h3>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Performance data will appear once your EAs start reporting weekly
        results via ResultSender.
      </p>
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl animate-pulse"
            style={{ backgroundColor: "var(--bg-card)" }}
          />
        ))}
      </div>
      <div
        className="h-96 rounded-xl animate-pulse"
        style={{ backgroundColor: "var(--bg-card)" }}
      />
    </div>
  );
}
