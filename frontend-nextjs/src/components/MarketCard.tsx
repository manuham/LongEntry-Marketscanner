"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus as TrendingNeutral,
  AlertCircle,
} from "lucide-react";
import { setMarketOverride, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

interface MarketCardProps {
  market: Types.Market;
  analytics: Types.Analytics | null;
  prediction: Types.AIPrediction | null;
  drawdown: Types.DrawdownItem | null;
  onRefresh: () => void;
}

export default function MarketCard({
  market,
  analytics,
  prediction,
  drawdown,
  onRefresh,
}: MarketCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleActive = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const newActive = analytics?.is_manually_overridden
        ? null
        : !analytics?.is_active;
      await setMarketOverride(market.symbol, newActive);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const score = analytics?.final_score ?? 0;
  const isActive = analytics?.is_active ?? false;
  const isOverridden = analytics?.is_manually_overridden ?? false;
  const change1w = analytics?.change_1w ?? 0;

  const scoreColor = getScoreColor(score);
  const confidence = prediction?.score ?? 0;

  const bias = prediction?.prediction ?? "neutral";
  const biasConfig = getBiasConfig(bias);

  const technicalScore = analytics?.technical_score ?? 0;
  const backtestScore = analytics?.backtest_score ?? 0;
  const fundamentalScore = analytics?.fundamental_score ?? 0;

  return (
    <Link href={`/market/${market.symbol}`}>
      <div
        className="rounded-xl overflow-hidden transition-all cursor-pointer group"
        style={{
          backgroundColor: "var(--bg-card)",
          border: `1px solid ${isActive ? "rgba(34, 197, 94, 0.25)" : "var(--border-solid)"}`,
          boxShadow: "var(--shadow-card)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "var(--shadow-card)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        {/* Bias color top strip */}
        <div
          className="h-1"
          style={{
            background: biasConfig.gradient,
          }}
        />

        <div className="p-4">
          {/* Top row: Symbol + Active dot + Score */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center space-x-2">
                <h3
                  className="text-xl font-bold tracking-tight"
                  style={{ color: "var(--text-heading)" }}
                >
                  {market.symbol}
                </h3>
                {isActive && (
                  <div
                    className="w-2 h-2 rounded-full pulse-active"
                    style={{ backgroundColor: "var(--accent-green)" }}
                  />
                )}
              </div>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {market.name}
              </p>
            </div>

            {/* Score circle */}
            <div
              className="flex flex-col items-center justify-center w-14 h-14 rounded-xl"
              style={{
                backgroundColor: `${scoreColor}12`,
                border: `1.5px solid ${scoreColor}30`,
              }}
            >
              <span
                className="text-xl font-bold leading-none"
                style={{ color: scoreColor }}
              >
                {score.toFixed(0)}
              </span>
              <span
                className="text-[8px] font-semibold uppercase mt-0.5"
                style={{ color: scoreColor, opacity: 0.7 }}
              >
                Score
              </span>
            </div>
          </div>

          {/* Price + Change row */}
          <div className="flex items-center justify-between mb-4">
            <div
              className="text-lg font-semibold"
              style={{ color: "var(--text-heading)" }}
            >
              {market.latest_price !== null
                ? (market.latest_price ?? 0).toFixed(2)
                : "—"}
            </div>
            <div className="flex items-center space-x-1">
              {change1w >= 0 ? (
                <TrendingUp size={14} style={{ color: "var(--accent-green)" }} />
              ) : (
                <TrendingDown size={14} style={{ color: "var(--accent-red)" }} />
              )}
              <span
                className="text-sm font-bold"
                style={{
                  color: change1w >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                }}
              >
                {change1w >= 0 ? "+" : ""}
                {change1w.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Bias Badge — prominent */}
          <div
            className="flex items-center justify-between p-2.5 rounded-lg mb-3"
            style={{
              backgroundColor: biasConfig.bgColor,
              border: `1px solid ${biasConfig.borderColor}`,
            }}
          >
            <div className="flex items-center space-x-2">
              {bias === "bullish" ? (
                <TrendingUp size={16} style={{ color: biasConfig.textColor }} />
              ) : bias === "bearish" ? (
                <TrendingDown size={16} style={{ color: biasConfig.textColor }} />
              ) : (
                <TrendingNeutral size={16} style={{ color: biasConfig.textColor }} />
              )}
              <span
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: biasConfig.textColor }}
              >
                {bias}
              </span>
            </div>
            {prediction && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: biasConfig.textColor + "18",
                  color: biasConfig.textColor,
                }}
              >
                {confidence >= 0.75 ? "High" : confidence >= 0.5 ? "Med" : "Low"} conf.
              </span>
            )}
          </div>

          {/* Score Breakdown — compact bars */}
          <div className="space-y-1.5 mb-3">
            <ScoreRow label="Technical" value={technicalScore} color="var(--accent-purple)" />
            <ScoreRow label="Backtest" value={backtestScore} color="var(--accent-blue)" />
            <ScoreRow label="Fundamental" value={fundamentalScore} color="var(--accent-amber)" />
          </div>

          {/* Override indicator */}
          {isOverridden && (
            <div
              className="mb-3 px-2.5 py-1.5 rounded-lg text-[10px] flex items-center space-x-1.5 font-medium"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "var(--accent-amber)",
                border: "1px solid rgba(245, 158, 11, 0.15)",
              }}
            >
              <AlertCircle size={11} />
              <span>Manually overridden</span>
            </div>
          )}

          {/* Toggle + Expand */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                handleToggleActive();
              }}
              disabled={isLoading}
              className="flex-1 py-2 rounded-lg font-semibold transition-all text-xs"
              style={{
                backgroundColor: isActive
                  ? "rgba(34, 197, 94, 0.12)"
                  : "var(--bg-surface)",
                color: isActive ? "var(--accent-green)" : "var(--text-muted)",
                border: `1px solid ${isActive ? "rgba(34, 197, 94, 0.2)" : "var(--border-solid)"}`,
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? "..." : isActive ? "Active" : "Off"}
            </button>

            <button
              onClick={(e) => {
                e.preventDefault();
                setIsExpanded(!isExpanded);
              }}
              className="p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-solid)",
              }}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Expandable Section */}
          {isExpanded && (
            <div
              className="mt-3 pt-3"
              style={{ borderTop: "1px solid var(--border-solid)" }}
            >
              {/* Backtest Details */}
              <div className="mb-3">
                <h4
                  className="text-[10px] font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  Backtest Results
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <StatItem label="Win Rate" value={analytics?.bt_win_rate ? `${(analytics.bt_win_rate * 100).toFixed(0)}%` : "N/A"} />
                  <StatItem label="P. Factor" value={analytics?.bt_profit_factor ? analytics.bt_profit_factor.toFixed(2) : "N/A"} />
                  <StatItem
                    label="Return"
                    value={analytics?.bt_total_return ? `${analytics.bt_total_return.toFixed(1)}%` : "N/A"}
                    color={(analytics?.bt_total_return ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)"}
                  />
                  <StatItem label="Max DD" value={analytics?.bt_max_drawdown ? `${analytics.bt_max_drawdown.toFixed(1)}%` : "N/A"} />
                </div>
              </div>

              {/* Parameters */}
              <div className="mb-3">
                <h4
                  className="text-[10px] font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  Optimal Params
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <StatItem label="Entry Hour" value={analytics?.opt_entry_hour?.toString() ?? "N/A"} />
                  <StatItem label="SL%" value={analytics?.opt_sl_percent ? analytics.opt_sl_percent.toFixed(1) : "N/A"} />
                  <StatItem label="TP%" value={analytics?.opt_tp_percent ? analytics.opt_tp_percent.toFixed(1) : "N/A"} />
                </div>
              </div>

              {/* Weekly P&L */}
              {drawdown && (
                <div>
                  <h4
                    className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Weekly P&L
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {drawdown.week_trades} trades · {drawdown.week_wins} wins
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{
                        color: drawdown.week_pnl_percent >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                      }}
                    >
                      {drawdown.week_pnl_percent >= 0 ? "+" : ""}
                      {drawdown.week_pnl_percent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div
                  className="mt-2 p-2 rounded-lg text-xs"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.08)",
                    color: "var(--accent-red)",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/* Sub-components */

function ScoreRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center space-x-2">
      <span
        className="text-[10px] font-medium w-16 flex-shrink-0"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div
          className="h-full rounded-full score-bar"
          style={{
            width: `${Math.min(value, 100)}%`,
            backgroundColor: color,
            opacity: 0.75,
          }}
        />
      </div>
      <span
        className="text-[10px] font-semibold w-6 text-right"
        style={{ color: "var(--text-muted)" }}
      >
        {value.toFixed(0)}
      </span>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span className="text-[10px] block" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <span className="text-xs font-semibold" style={{ color: color ?? "var(--text-heading)" }}>
        {value}
      </span>
    </div>
  );
}

/* Color utilities */

function getScoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 50) return "#06b6d4";
  if (score >= 30) return "#f59e0b";
  return "#ef4444";
}

interface BiasConfig {
  gradient: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

function getBiasConfig(bias: string): BiasConfig {
  switch (bias) {
    case "bullish":
      return {
        gradient: "linear-gradient(90deg, #22c55e, #16a34a)",
        bgColor: "rgba(34, 197, 94, 0.06)",
        borderColor: "rgba(34, 197, 94, 0.15)",
        textColor: "#22c55e",
      };
    case "bearish":
      return {
        gradient: "linear-gradient(90deg, #ef4444, #dc2626)",
        bgColor: "rgba(239, 68, 68, 0.06)",
        borderColor: "rgba(239, 68, 68, 0.15)",
        textColor: "#ef4444",
      };
    default:
      return {
        gradient: "linear-gradient(90deg, #f59e0b, #d97706)",
        bgColor: "rgba(245, 158, 11, 0.06)",
        borderColor: "rgba(245, 158, 11, 0.15)",
        textColor: "#f59e0b",
      };
  }
}
