"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import { setMarketOverride, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

interface MarketRowProps {
  market: Types.Market;
  analytics: Types.Analytics | null;
  prediction: Types.AIPrediction | null;
  drawdown: Types.DrawdownItem | null;
  onRefresh: () => void;
}

export default function MarketRow({
  market,
  analytics,
  prediction,
  drawdown,
  onRefresh,
}: MarketRowProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleToggleActive = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLoading(true);
    try {
      const newActive = analytics?.is_manually_overridden
        ? null
        : !analytics?.is_active;
      await setMarketOverride(market.symbol, newActive);
      onRefresh();
    } catch (err) {
      console.error("Failed to toggle active:", getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const score = analytics?.final_score ?? 0;
  const rank = analytics?.rank ?? "-";
  const isActive = analytics?.is_active ?? false;
  const change1w = analytics?.change_1w ?? 0;
  const technicalScore = analytics?.technical_score ?? 0;
  const backtestScore = analytics?.backtest_score ?? 0;
  const fundamentalScore = analytics?.fundamental_score ?? 0;
  const confidence = prediction?.score ?? 0;
  const bias = prediction?.prediction ?? "neutral";

  const scoreColor = getScoreColor(score);

  return (
    <Link href={`/market/${market.symbol}`}>
      <tr
        className="border-b hover:bg-opacity-50 transition-colors cursor-pointer"
        style={{
          borderColor: "var(--border-solid)",
        }}
      >
        {/* Rank */}
        <td
          className="text-left text-sm font-semibold p-3"
          style={{ color: "var(--text-heading)" }}
        >
          {rank}
        </td>

        {/* Symbol */}
        <td
          className="text-left text-sm font-semibold p-3"
          style={{ color: "var(--text-heading)" }}
        >
          {market.symbol}
        </td>

        {/* Price */}
        <td
          className="text-left text-sm p-3"
          style={{ color: "var(--text-body)" }}
        >
          {market.latest_price ? market.latest_price.toFixed(2) : "N/A"}
        </td>

        {/* 1W% */}
        <td className="text-left text-sm p-3">
          <div className="flex items-center space-x-1">
            {change1w >= 0 ? (
              <TrendingUp
                size={16}
                style={{ color: "var(--accent-green)" }}
              />
            ) : (
              <TrendingDown
                size={16}
                style={{ color: "var(--accent-red)" }}
              />
            )}
            <span
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
        </td>

        {/* Final Score */}
        <td className="text-left text-sm p-3">
          <div
            className="font-bold"
            style={{ color: scoreColor }}
          >
            {score.toFixed(0)}
          </div>
        </td>

        {/* AI Confidence Badge */}
        <td className="text-left text-sm p-3">
          {prediction && (
            <div
              className="px-2 py-1 rounded text-xs font-semibold inline-block"
              style={{
                backgroundColor:
                  confidence >= 0.75
                    ? "rgba(16, 185, 129, 0.2)"
                    : confidence >= 0.5
                      ? "rgba(245, 158, 11, 0.2)"
                      : "rgba(244, 63, 94, 0.2)",
                color:
                  confidence >= 0.75
                    ? "var(--accent-green)"
                    : confidence >= 0.5
                      ? "var(--accent-amber)"
                      : "var(--accent-red)",
              }}
            >
              {confidence >= 0.75
                ? "H"
                : confidence >= 0.5
                  ? "M"
                  : "L"}
            </div>
          )}
        </td>

        {/* Backtest Score */}
        <td
          className="text-left text-sm p-3"
          style={{ color: "var(--text-body)" }}
        >
          {backtestScore.toFixed(0)}
        </td>

        {/* Fundamental Score */}
        <td
          className="text-left text-sm p-3"
          style={{ color: "var(--text-body)" }}
        >
          {fundamentalScore.toFixed(0)}
        </td>

        {/* Status */}
        <td className="text-left text-sm p-3">
          {isActive ? (
            <div
              className="px-2 py-1 rounded text-xs font-semibold inline-block"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.2)",
                color: "var(--accent-green)",
              }}
            >
              ACTIVE
            </div>
          ) : (
            <div
              className="px-2 py-1 rounded text-xs font-semibold inline-block"
              style={{
                backgroundColor: "rgba(100, 116, 139, 0.2)",
                color: "var(--text-muted)",
              }}
            >
              OFF
            </div>
          )}
        </td>

        {/* Actions */}
        <td className="text-left text-sm p-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleToggleActive}
            disabled={isLoading}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
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
        </td>
      </tr>
    </Link>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return "var(--accent-green)";
  if (score >= 50) return "#10b981";
  if (score >= 30) return "var(--accent-amber)";
  return "var(--accent-red)";
}
