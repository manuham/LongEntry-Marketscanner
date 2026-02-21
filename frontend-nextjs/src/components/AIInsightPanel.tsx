"use client";

import { AIAnalysisResult } from "@/lib/types";
import {
  TrendingUp,
  AlertCircle,
  Target,
  Zap,
  BarChart3,
  Lock,
} from "lucide-react";
import { useState } from "react";

interface AIInsightPanelProps {
  analysis: AIAnalysisResult | null;
}

export default function AIInsightPanel({ analysis }: AIInsightPanelProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  if (!analysis) {
    return null;
  }

  // Determine badge colors based on confidence
  const confidenceBgColor =
    analysis.ai_confidence === "high"
      ? "rgba(16, 185, 129, 0.1)"
      : analysis.ai_confidence === "medium"
        ? "rgba(245, 158, 11, 0.1)"
        : "rgba(244, 63, 94, 0.1)";

  const confidenceTextColor =
    analysis.ai_confidence === "high"
      ? "var(--accent-green)"
      : analysis.ai_confidence === "medium"
        ? "var(--accent-amber)"
        : "var(--accent-red)";

  // Bias colors
  const biasBgColor =
    analysis.ai_bias === "bullish"
      ? "rgba(16, 185, 129, 0.1)"
      : analysis.ai_bias === "bearish"
        ? "rgba(244, 63, 94, 0.1)"
        : "rgba(59, 130, 246, 0.1)";

  const biasTextColor =
    analysis.ai_bias === "bullish"
      ? "var(--accent-green)"
      : analysis.ai_bias === "bearish"
        ? "var(--accent-red)"
        : "var(--accent-blue)";

  return (
    <div
      className="rounded-lg p-6 mb-6"
      style={{ backgroundColor: "var(--bg-card)" }}
    >
      {/* Header with Score and Badges */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <div className="text-center">
            <p style={{ color: "var(--text-muted)" }} className="text-sm">
              AI Score
            </p>
            <p
              style={{ color: "var(--accent-blue)" }}
              className="text-4xl font-bold"
            >
              {analysis.ai_score.toFixed(1)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span
              className="text-xs px-3 py-1 rounded-full font-medium capitalize"
              style={{
                backgroundColor: confidenceBgColor,
                color: confidenceTextColor,
              }}
            >
              {analysis.ai_confidence} Confidence
            </span>
            <span
              className="text-xs px-3 py-1 rounded-full font-medium capitalize"
              style={{
                backgroundColor: biasBgColor,
                color: biasTextColor,
              }}
            >
              {analysis.ai_bias}
            </span>
          </div>
        </div>

        {analysis.model_used && (
          <div className="text-right">
            <div
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <Lock size={12} />
              {analysis.model_used}
            </div>
            {analysis.cost_usd && (
              <p
                style={{ color: "var(--text-faint)" }}
                className="text-xs mt-1"
              >
                Cost: ${analysis.cost_usd.toFixed(4)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reasoning */}
      {analysis.reasoning && (
        <div className="mb-6">
          <button
            onClick={() => setReasoningExpanded(!reasoningExpanded)}
            className="w-full flex items-center justify-between p-3 rounded-lg transition-colors hover:opacity-80"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <span style={{ color: "var(--text-heading)" }} className="font-medium">
              AI Reasoning
            </span>
            <span
              style={{
                color: "var(--text-muted)",
                transform: reasoningExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            >
              ▼
            </span>
          </button>
          {reasoningExpanded && (
            <div
              className="mt-3 p-4 rounded-lg"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderLeft: "3px solid var(--accent-blue)",
              }}
            >
              <p style={{ color: "var(--text-body)" }} className="leading-relaxed">
                {analysis.reasoning}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Key Levels */}
        {analysis.key_levels && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target size={18} style={{ color: "var(--accent-blue)" }} />
              <h4 style={{ color: "var(--text-heading)" }} className="font-bold">
                Key Levels
              </h4>
            </div>
            <div className="space-y-2">
              {analysis.key_levels.resistance.length > 0 && (
                <div className="p-3 rounded" style={{ backgroundColor: "var(--bg-surface)" }}>
                  <p
                    style={{ color: "var(--text-muted)" }}
                    className="text-xs mb-1"
                  >
                    Resistance
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.key_levels.resistance.map((level, i) => (
                      <span
                        key={i}
                        className="text-sm font-medium px-2 py-1 rounded"
                        style={{
                          backgroundColor: "rgba(244, 63, 94, 0.1)",
                          color: "var(--accent-red)",
                        }}
                      >
                        {level.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.key_levels.support.length > 0 && (
                <div className="p-3 rounded" style={{ backgroundColor: "var(--bg-surface)" }}>
                  <p
                    style={{ color: "var(--text-muted)" }}
                    className="text-xs mb-1"
                  >
                    Support
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.key_levels.support.map((level, i) => (
                      <span
                        key={i}
                        className="text-sm font-medium px-2 py-1 rounded"
                        style={{
                          backgroundColor: "rgba(16, 185, 129, 0.1)",
                          color: "var(--accent-green)",
                        }}
                      >
                        {level.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confluence */}
        {analysis.confluence && analysis.confluence.factors.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={18} style={{ color: "var(--accent-amber)" }} />
              <h4 style={{ color: "var(--text-heading)" }} className="font-bold">
                Confluence Factors
              </h4>
            </div>
            <div
              className="p-3 rounded space-y-2"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              {analysis.confluence.factors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="text-xs font-medium px-2 py-1 rounded mt-0.5"
                    style={{
                      backgroundColor:
                        analysis.confluence.strength === "strong"
                          ? "rgba(16, 185, 129, 0.1)"
                          : "rgba(245, 158, 11, 0.1)",
                      color:
                        analysis.confluence.strength === "strong"
                          ? "var(--accent-green)"
                          : "var(--accent-amber)",
                    }}
                  >
                    {analysis.confluence.strength}
                  </span>
                  <p style={{ color: "var(--text-body)" }} className="text-sm">
                    {factor}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Risk Factors */}
      {analysis.risk_factors && analysis.risk_factors.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={18} style={{ color: "var(--accent-red)" }} />
            <h4 style={{ color: "var(--text-heading)" }} className="font-bold">
              Risk Factors
            </h4>
          </div>
          <div
            className="p-3 rounded space-y-2"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            {analysis.risk_factors.map((factor, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="text-xs font-medium px-2 py-1 rounded mt-0.5"
                  style={{
                    backgroundColor: "rgba(244, 63, 94, 0.1)",
                    color: "var(--accent-red)",
                  }}
                >
                  HIGH
                </span>
                <p style={{ color: "var(--text-body)" }} className="text-sm">
                  {factor}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Entry Parameters */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        {analysis.suggested_entry_window && (
          <div className="p-3 rounded text-center" style={{ backgroundColor: "var(--bg-surface)" }}>
            <p style={{ color: "var(--text-muted)" }} className="text-xs mb-1">
              Entry Window
            </p>
            <p style={{ color: "var(--text-heading)" }} className="font-bold">
              {analysis.suggested_entry_window}
            </p>
          </div>
        )}
        {analysis.suggested_sl_pct !== null &&
          analysis.suggested_sl_pct !== undefined && (
            <div className="p-3 rounded text-center" style={{ backgroundColor: "var(--bg-surface)" }}>
              <p style={{ color: "var(--text-muted)" }} className="text-xs mb-1">
                Suggested SL
              </p>
              <p
                style={{ color: "var(--accent-red)" }}
                className="font-bold text-lg"
              >
                {analysis.suggested_sl_pct.toFixed(2)}%
              </p>
            </div>
          )}
        {analysis.suggested_tp_pct !== null &&
          analysis.suggested_tp_pct !== undefined && (
            <div className="p-3 rounded text-center" style={{ backgroundColor: "var(--bg-surface)" }}>
              <p style={{ color: "var(--text-muted)" }} className="text-xs mb-1">
                Suggested TP
              </p>
              <p
                style={{ color: "var(--accent-green)" }}
                className="font-bold text-lg"
              >
                +{analysis.suggested_tp_pct.toFixed(2)}%
              </p>
            </div>
          )}
      </div>

      {/* Meta Info */}
      {(analysis.tokens_used !== null || analysis.created_at) && (
        <div
          className="mt-6 pt-4 text-xs text-center"
          style={{
            borderTopColor: "var(--border)",
            borderTopWidth: "1px",
            color: "var(--text-faint)",
          }}
        >
          {analysis.tokens_used && (
            <p>Tokens: {analysis.tokens_used.toLocaleString()}</p>
          )}
          {analysis.created_at && (
            <p>Generated: {new Date(analysis.created_at).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
}
