"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
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
      // If manually overridden, clear override. Otherwise set opposite of current
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

  // Score color gradient
  const scoreColor = getScoreColor(score);
  const scoreBackground = getScoreBgColor(score);

  // AI confidence badge
  const confidence = prediction?.score ?? 0;
  const confidenceLevel =
    confidence >= 0.75
      ? "HIGH"
      : confidence >= 0.5
        ? "MEDIUM"
        : "LOW";
  const confidenceBgColor = getConfidenceColor(confidenceLevel);

  // AI bias arrow
  const bias = prediction?.prediction ?? "neutral";
  const biasColor = getBiasColor(bias);
  const biasArrow =
    bias === "bullish" ? "↑" : bias === "bearish" ? "↓" : "→";

  // Score breakdown
  const technicalWeight = 0.5;
  const backtestWeight = 0.35;
  const fundamentalWeight = 0.15;

  const technicalScore = analytics?.technical_score ?? 0;
  const backtestScore = analytics?.backtest_score ?? 0;
  const fundamentalScore = analytics?.fundamental_score ?? 0;

  return (
    <Link href={`/market/${market.symbol}`}>
      <div
        className="rounded-lg border p-4 transition-all hover:border-opacity-100 cursor-pointer hover:shadow-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-solid)",
        }}
      >
        {/* Header: Symbol and Price */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-heading)" }}
            >
              {market.symbol}
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              {market.name}
            </p>
          </div>

          {/* Active Badge */}
          {isActive && (
            <div
              className="px-2 py-1 rounded text-xs font-semibold"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.2)",
                color: "var(--accent-green)",
              }}
            >
              ACTIVE
            </div>
          )}
        </div>

        {/* Price and Change */}
        <div className="flex items-baseline justify-between mb-4">
          <div>
            {market.latest_price !== null && (
              <div
                className="text-2xl font-bold"
                style={{ color: "var(--text-heading)" }}
              >
                {market.latest_price.toFixed(2)}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            {change1w >= 0 ? (
              <TrendingUp
                size={18}
                style={{ color: "var(--accent-green)" }}
              />
            ) : (
              <TrendingDown
                size={18}
                style={{ color: "var(--accent-red)" }}
              />
            )}
            <span
              className="text-sm font-medium"
              style={{
                color:
                  change1w >= 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)",
              }}
            >
              {change1w >= 0 ? "+" : ""}
              {change1w.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Final Score */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-semibold uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              Final Score
            </span>
            <div
              className="text-3xl font-bold"
              style={{ color: scoreColor }}
            >
              {score.toFixed(0)}
            </div>
          </div>

          {/* Score Bar */}
          <div
            className="h-1 rounded-full"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((score / 100) * 100, 100)}%`,
                backgroundColor: scoreColor,
              }}
            />
          </div>
        </div>

        {/* AI Badges */}
        <div className="flex items-center space-x-2 mb-4">
          {prediction && (
            <>
              <div
                className="px-2 py-1 rounded text-xs font-semibold"
                style={{
                  backgroundColor: confidenceBgColor,
                  color: "#ffffff",
                }}
              >
                {confidenceLevel}
              </div>

              <div
                className="px-2 py-1 rounded text-xs font-semibold"
                style={{
                  backgroundColor: biasColor,
                  color: "#ffffff",
                }}
              >
                {biasArrow} {bias.charAt(0).toUpperCase() + bias.slice(1)}
              </div>
            </>
          )}
        </div>

        {/* Score Breakdown Bars */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Technical + AI
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              {technicalScore.toFixed(0)}
            </span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(technicalScore / 100) * 100}%`,
                backgroundColor: "var(--accent-purple)",
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Backtest
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              {backtestScore.toFixed(0)}
            </span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(backtestScore / 100) * 100}%`,
                backgroundColor: "var(--accent-blue)",
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Fundamental
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              {fundamentalScore.toFixed(0)}
            </span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(fundamentalScore / 100) * 100}%`,
                backgroundColor: "var(--accent-amber)",
              }}
            />
          </div>
        </div>

        {/* Override Indicator */}
        {isOverridden && (
          <div
            className="mb-4 p-2 rounded text-xs flex items-center space-x-2"
            style={{
              backgroundColor: "rgba(241, 245, 249, 0.1)",
              color: "var(--accent-amber)",
            }}
          >
            <AlertCircle size={14} />
            <span>Manually overridden</span>
          </div>
        )}

        {/* Active/Off Toggle and More Button */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              handleToggleActive();
            }}
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
            style={{
              backgroundColor: isActive
                ? "var(--accent-green)"
                : "var(--bg-surface)",
              color: isActive ? "#ffffff" : "var(--text-body)",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? "..." : isActive ? "Active" : "Off"}
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              setIsExpanded(!isExpanded);
            }}
            className="px-3 py-2 rounded-lg transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-body)",
            }}
          >
            {isExpanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </button>
        </div>

        {/* Expandable More Section */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border-solid)" }}>
            {/* Backtest Details */}
            <div className="mb-4">
              <h4
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--text-heading)" }}
              >
                Backtest Results
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Win Rate
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {analytics?.bt_win_rate
                      ? `${(analytics.bt_win_rate * 100).toFixed(0)}%`
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Profit Factor
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {analytics?.bt_profit_factor
                      ? analytics.bt_profit_factor.toFixed(2)
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Total Return
                  </span>
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        (analytics?.bt_total_return ?? 0) >= 0
                          ? "var(--accent-green)"
                          : "var(--accent-red)",
                    }}
                  >
                    {analytics?.bt_total_return
                      ? `${analytics.bt_total_return.toFixed(1)}%`
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Max Drawdown
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {analytics?.bt_max_drawdown
                      ? `${analytics.bt_max_drawdown.toFixed(1)}%`
                      : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Parameters */}
            <div className="mb-4">
              <h4
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--text-heading)" }}
              >
                Optimal Parameters
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Entry Hour
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {analytics?.opt_entry_hour ?? "N/A"}
                  </span>
                </div>
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    SL%
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {analytics?.opt_sl_percent
                      ? analytics.opt_sl_percent.toFixed(1)
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span
                    className="block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    TP%
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {analytics?.opt_tp_percent
                      ? analytics.opt_tp_percent.toFixed(1)
                      : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Weekly P&L */}
            {drawdown && (
              <div>
                <h4
                  className="text-sm font-semibold mb-2"
                  style={{ color: "var(--text-heading)" }}
                >
                  Weekly P&L
                </h4>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    {drawdown.week_trades} trades | {drawdown.week_wins} wins
                  </span>
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        drawdown.week_pnl_percent >= 0
                          ? "var(--accent-green)"
                          : "var(--accent-red)",
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
                className="mt-2 p-2 rounded text-xs"
                style={{
                  backgroundColor: "rgba(244, 63, 94, 0.1)",
                  color: "var(--accent-red)",
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return "var(--accent-green)";
  if (score >= 50) return "#10b981"; // bright green
  if (score >= 30) return "var(--accent-amber)";
  return "var(--accent-red)";
}

function getScoreBgColor(score: number): string {
  if (score >= 70) return "rgba(16, 185, 129, 0.1)";
  if (score >= 50) return "rgba(16, 185, 129, 0.1)";
  if (score >= 30) return "rgba(245, 158, 11, 0.1)";
  return "rgba(244, 63, 94, 0.1)";
}

function getConfidenceColor(level: string): string {
  switch (level) {
    case "HIGH":
      return "var(--accent-green)";
    case "MEDIUM":
      return "var(--accent-amber)";
    case "LOW":
      return "var(--accent-red)";
    default:
      return "var(--text-muted)";
  }
}

function getBiasColor(bias: string): string {
  switch (bias) {
    case "bullish":
      return "var(--accent-green)";
    case "bearish":
      return "var(--accent-red)";
    case "neutral":
      return "var(--accent-amber)";
    default:
      return "var(--text-muted)";
  }
}
