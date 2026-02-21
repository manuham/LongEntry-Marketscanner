"use client";

import { useState, useEffect, useMemo } from "react";
import { AlertCircle, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getAllAnalyticsHistory, getMarkets, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

const WEEK_OPTIONS = [
  { label: "4W", value: 4 },
  { label: "8W", value: 8 },
  { label: "12W", value: 12 },
  { label: "26W", value: 26 },
  { label: "52W", value: 52 },
];

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  index: { label: "Indices", color: "#3b82f6", bgColor: "rgba(59, 130, 246, 0.1)" },
  commodity: { label: "Commodities", color: "#f59e0b", bgColor: "rgba(245, 158, 11, 0.1)" },
  stock: { label: "Stocks", color: "#8b5cf6", bgColor: "rgba(139, 92, 246, 0.1)" },
};

// Distinct colors per symbol within each category
const INDEX_COLORS = ["#3b82f6", "#60a5fa", "#2563eb", "#1d4ed8", "#93c5fd", "#1e40af", "#6366f1", "#818cf8", "#4f46e5", "#a5b4fc", "#4338ca"];
const COMMODITY_COLORS = ["#f59e0b", "#fbbf24", "#d97706", "#b45309"];
const STOCK_COLORS = ["#8b5cf6", "#a78bfa", "#7c3aed", "#6d28d9", "#c084fc", "#5b21b6", "#ddd6fe", "#9333ea", "#7e22ce", "#a855f7", "#e879f9", "#d946ef", "#c026d3", "#a21caf", "#9333ea", "#7e22ce", "#6b21a8", "#581c87", "#4c1d95", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"];

function getSymbolColor(symbol: string, category: string, indexInCategory: number): string {
  if (category === "index") return INDEX_COLORS[indexInCategory % INDEX_COLORS.length];
  if (category === "commodity") return COMMODITY_COLORS[indexInCategory % COMMODITY_COLORS.length];
  return STOCK_COLORS[indexInCategory % STOCK_COLORS.length];
}

export default function HistoryPage() {
  const [weeks, setWeeks] = useState(12);
  const [history, setHistory] = useState<Types.HistoryPoint[]>([]);
  const [markets, setMarkets] = useState<Types.Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"trends" | "ranks" | "parameters">("trends");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(["index"]));

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [historyData, marketsData] = await Promise.all([
          getAllAnalyticsHistory(weeks),
          getMarkets(),
        ]);
        setHistory(historyData);
        setMarkets(marketsData);
        setLoading(false);
      } catch (err) {
        setError(getErrorMessage(err));
        setLoading(false);
      }
    };
    fetchData();
  }, [weeks]);

  // Build category lookup from markets
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    markets.forEach((m) => { map[m.symbol] = m.category; });
    return map;
  }, [markets]);

  // Filter history by active categories
  const filteredHistory = useMemo(() => {
    return history.filter((h) => activeCategories.has(categoryMap[h.symbol] ?? ""));
  }, [history, activeCategories, categoryMap]);

  // Filtered symbols
  const filteredSymbols = useMemo(() => {
    return Array.from(new Set(filteredHistory.map((h) => h.symbol))).sort();
  }, [filteredHistory]);

  const toggleCategory = (cat: string) => {
    const updated = new Set(activeCategories);
    if (updated.has(cat)) {
      if (updated.size > 1) updated.delete(cat); // Keep at least one active
    } else {
      updated.add(cat);
    }
    setActiveCategories(updated);
  };

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { index: 0, commodity: 0, stock: 0 };
    markets.forEach((m) => { counts[m.category] = (counts[m.category] || 0) + 1; });
    return counts;
  }, [markets]);

  if (loading) {
    return (
      <div className="min-h-screen px-6 lg:px-10 py-8">
        <div style={{ color: "var(--text-heading)" }}>
          <h1 className="text-2xl font-bold tracking-tight mb-8">Analysis History</h1>
          <SkeletonLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 lg:px-10 py-8">
      <div>
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold tracking-tight mb-2"
            style={{ color: "var(--text-heading)" }}
          >
            Analysis History
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Track how scores, rankings, and parameters evolve over time
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="mb-6 p-4 rounded-xl flex items-start space-x-3"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <AlertCircle size={18} style={{ color: "var(--accent-red)", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <p className="font-medium text-sm" style={{ color: "var(--accent-red)" }}>Error loading history</p>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{error}</p>
            </div>
          </div>
        )}

        {/* Controls Row: Categories + Week Range */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          {/* Category Toggles */}
          <div className="flex gap-2">
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: activeCategories.has(key) ? config.bgColor : "var(--bg-surface)",
                  color: activeCategories.has(key) ? config.color : "var(--text-faint)",
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

          {/* Week Range */}
          <div
            className="flex p-0.5 rounded-lg"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            {WEEK_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setWeeks(option.value)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  backgroundColor: weeks === option.value ? "var(--bg-card)" : "transparent",
                  color: weeks === option.value ? "var(--text-heading)" : "var(--text-faint)",
                  boxShadow: weeks === option.value ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6 border-b"
          style={{ borderColor: "var(--border-solid)" }}
        >
          {[
            { id: "trends", label: "Score Trends" },
            { id: "ranks", label: "Rank Table" },
            { id: "parameters", label: "Parameters" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className="px-4 py-3 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === tab.id ? "var(--accent-blue)" : "var(--text-muted)",
              }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "trends" && (
          <ScoreTrendsTab
            history={filteredHistory}
            symbols={filteredSymbols}
            categoryMap={categoryMap}
          />
        )}
        {activeTab === "ranks" && (
          <RankTableTab
            history={filteredHistory}
            symbols={filteredSymbols}
            categoryMap={categoryMap}
          />
        )}
        {activeTab === "parameters" && (
          <ParameterChangesTab
            history={filteredHistory}
            symbols={filteredSymbols}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Score Trends Tab ──────────────────────────────────────────────────── */

interface ScoreTrendsTabProps {
  history: Types.HistoryPoint[];
  symbols: string[];
  categoryMap: Record<string, string>;
}

function ScoreTrendsTab({ history, symbols, categoryMap }: ScoreTrendsTabProps) {
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(new Set());

  const weekSet = new Set(history.map((h) => h.week_start));
  const sortedWeeks = Array.from(weekSet).sort();

  const chartData = sortedWeeks.map((week) => {
    const point: Record<string, unknown> = { week_start: week };
    history
      .filter((h) => h.week_start === week)
      .forEach((h) => {
        point[h.symbol] = h.final_score ?? 0;
      });
    return point;
  });

  // Build index within category for color assignment
  const categoryIndex: Record<string, number> = {};
  const categoryCounters: Record<string, number> = {};
  symbols.forEach((s) => {
    const cat = categoryMap[s] ?? "index";
    if (!(cat in categoryCounters)) categoryCounters[cat] = 0;
    categoryIndex[s] = categoryCounters[cat]++;
  });

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
      {/* Symbol Legend */}
      <div
        className="p-4 rounded-xl mb-6"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-solid)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium" style={{ color: "var(--text-faint)" }}>
            Click to show/hide · {visibleSymbols.length} of {symbols.length} visible
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setHiddenSymbols(new Set())}
              className="text-[10px] font-medium px-2 py-1 rounded-md"
              style={{ color: "var(--accent-blue)", backgroundColor: "rgba(59, 130, 246, 0.08)" }}
            >
              Show All
            </button>
            <button
              onClick={() => setHiddenSymbols(new Set(symbols))}
              className="text-[10px] font-medium px-2 py-1 rounded-md"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-surface)" }}
            >
              Hide All
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {symbols.map((symbol) => {
            const cat = categoryMap[symbol] ?? "index";
            const color = getSymbolColor(symbol, cat, categoryIndex[symbol]);
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
        <ResponsiveContainer width="100%" height={450}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
            <XAxis
              dataKey="week_start"
              stroke="var(--text-faint)"
              tick={{ fontSize: 11 }}
              tickFormatter={(value: string) => {
                const d = new Date(value);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <YAxis
              stroke="var(--text-faint)"
              tick={{ fontSize: 11 }}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-solid)",
                borderRadius: "0.75rem",
                color: "var(--text-body)",
                fontSize: "12px",
              }}
              formatter={(value: any, name: string) => {
                if (typeof value === "number") {
                  return [value.toFixed(1), name];
                }
                return [value, name];
              }}
              labelFormatter={(label: string) => {
                const d = new Date(label);
                return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
              }}
            />
            {visibleSymbols.map((symbol) => {
              const cat = categoryMap[symbol] ?? "index";
              const color = getSymbolColor(symbol, cat, categoryIndex[symbol]);
              return (
                <Line
                  key={symbol}
                  type="monotone"
                  dataKey={symbol}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── Rank Table Tab ─────────────────────────────────────────────────── */

interface RankTableTabProps {
  history: Types.HistoryPoint[];
  symbols: string[];
  categoryMap: Record<string, string>;
}

function RankTableTab({ history, symbols, categoryMap }: RankTableTabProps) {
  const weeks = Array.from(new Set(history.map((h) => h.week_start))).sort();

  const historyMap = new Map<string, Types.HistoryPoint>();
  history.forEach((h) => {
    historyMap.set(`${h.symbol}|${h.week_start}`, h);
  });

  const getRankColor = (rank: number | null | undefined) => {
    if (rank === null || rank === undefined) return { bg: "var(--bg-surface)", text: "var(--text-faint)" };
    if (rank <= 3) return { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" };
    if (rank <= 6) return { bg: "rgba(34, 197, 94, 0.12)", text: "#22c55e" };
    return { bg: "var(--bg-surface)", text: "var(--text-muted)" };
  };

  return (
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
            <th
              className="text-left p-3 font-semibold text-xs uppercase tracking-wider sticky left-0"
              style={{ color: "var(--text-faint)", backgroundColor: "var(--bg-card)" }}
            >
              Symbol
            </th>
            {weeks.map((week) => (
              <th
                key={week}
                className="text-center p-3 font-semibold text-xs whitespace-nowrap"
                style={{ color: "var(--text-faint)" }}
              >
                {new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol) => (
            <tr key={symbol} style={{ borderBottom: "1px solid var(--border-solid)" }}>
              <td
                className="p-3 font-bold text-xs sticky left-0"
                style={{ color: "var(--text-heading)", backgroundColor: "var(--bg-card)" }}
              >
                {symbol}
              </td>
              {weeks.map((week) => {
                const point = historyMap.get(`${symbol}|${week}`);
                const rank = point?.rank;
                const colors = getRankColor(rank);

                return (
                  <td key={week} className="text-center p-2">
                    <div
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold"
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.text,
                      }}
                    >
                      {rank !== null && rank !== undefined ? rank : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Parameter Changes Tab ──────────────────────────────────────────── */

interface ParameterChangesTabProps {
  history: Types.HistoryPoint[];
  symbols: string[];
}

function ParameterChangesTab({ history, symbols }: ParameterChangesTabProps) {
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  const toggleExpanded = (symbol: string) => {
    const updated = new Set(expandedSymbols);
    if (updated.has(symbol)) {
      updated.delete(symbol);
    } else {
      updated.add(symbol);
    }
    setExpandedSymbols(updated);
  };

  return (
    <div className="space-y-3">
      {symbols.map((symbol) => {
        const symbolHistory = history
          .filter((h) => h.symbol === symbol)
          .sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime())
          .slice(0, 8);

        const isExpanded = expandedSymbols.has(symbol);

        return (
          <div
            key={symbol}
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border-solid)" }}
          >
            <button
              onClick={() => toggleExpanded(symbol)}
              className="w-full p-3 flex items-center justify-between"
              style={{
                backgroundColor: "var(--bg-card)",
                borderBottom: isExpanded ? "1px solid var(--border-solid)" : "none",
              }}
            >
              <p className="font-bold text-sm" style={{ color: "var(--text-heading)" }}>
                {symbol}
              </p>
              {isExpanded ? (
                <ChevronUp size={16} style={{ color: "var(--text-muted)" }} />
              ) : (
                <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
              )}
            </button>

            {isExpanded && (
              <div className="p-3" style={{ backgroundColor: "var(--bg-surface)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-solid)" }}>
                      {["Week", "Entry Hour", "SL %", "TP %"].map((h) => (
                        <th key={h} className="text-left p-2 font-medium" style={{ color: "var(--text-faint)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {symbolHistory.map((point, idx) => {
                      const prevPoint = symbolHistory[idx + 1];
                      const entryChanged = prevPoint && point.opt_entry_hour !== prevPoint.opt_entry_hour;
                      const slChanged = prevPoint && point.opt_sl_percent !== prevPoint.opt_sl_percent;
                      const tpChanged = prevPoint && point.opt_tp_percent !== prevPoint.opt_tp_percent;

                      return (
                        <tr
                          key={point.week_start}
                          style={{ borderBottom: "1px solid var(--border-solid)" }}
                        >
                          <td className="p-2" style={{ color: "var(--text-body)" }}>
                            {new Date(point.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="p-2" style={{
                            color: entryChanged ? "var(--accent-amber)" : "var(--text-body)",
                            fontWeight: entryChanged ? 600 : 400,
                          }}>
                            {point.opt_entry_hour ?? "—"}
                          </td>
                          <td className="p-2" style={{
                            color: slChanged ? "var(--accent-amber)" : "var(--text-body)",
                            fontWeight: slChanged ? 600 : 400,
                          }}>
                            {point.opt_sl_percent ? `${point.opt_sl_percent.toFixed(2)}%` : "—"}
                          </td>
                          <td className="p-2" style={{
                            color: tpChanged ? "var(--accent-amber)" : "var(--text-body)",
                            fontWeight: tpChanged ? 600 : 400,
                          }}>
                            {point.opt_tp_percent ? `${point.opt_tp_percent.toFixed(2)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────── */

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: "var(--bg-card)" }} />
      <div className="h-96 rounded-xl animate-pulse" style={{ backgroundColor: "var(--bg-card)" }} />
    </div>
  );
}
