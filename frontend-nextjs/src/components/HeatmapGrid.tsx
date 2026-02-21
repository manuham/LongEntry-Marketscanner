"use client";

import { HeatmapData, HeatmapCell } from "@/lib/types";
import { useMemo } from "react";

interface HeatmapGridProps {
  heatmapData: HeatmapData;
}

function interpolateColor(
  value: number,
  min: number,
  max: number
): string {
  // Normalize value to 0-1
  let normalized = (value - min) / (max - min);
  normalized = Math.max(0, Math.min(1, normalized));

  if (value < 0) {
    // Red to white gradient for negative values
    const r = 255;
    const g = Math.round(255 * normalized);
    const b = Math.round(255 * normalized);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (value > 0) {
    // White to green gradient for positive values
    const r = Math.round(255 * (1 - normalized));
    const g = 255;
    const b = Math.round(255 * (1 - normalized));
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "rgb(255, 255, 255)"; // White for zero
}

export default function HeatmapGrid({ heatmapData }: HeatmapGridProps) {
  const stats = useMemo(() => {
    const returns = heatmapData.grid.map((cell) => cell.total_return);
    const min = Math.min(...returns);
    const max = Math.max(...returns);

    // Find optimal cell (highest return)
    let optimalCell: HeatmapCell | null = null;
    let maxReturn = -Infinity;
    for (const cell of heatmapData.grid) {
      if (cell.total_return > maxReturn) {
        maxReturn = cell.total_return;
        optimalCell = cell;
      }
    }

    return { min, max, optimalCell };
  }, [heatmapData.grid]);

  // Get unique SL and TP percentages
  const slPercentages = useMemo(() => {
    const unique = new Set(heatmapData.grid.map((cell) => cell.sl_pct));
    return Array.from(unique).sort((a, b) => a - b);
  }, [heatmapData.grid]);

  const tpPercentages = useMemo(() => {
    const unique = new Set(heatmapData.grid.map((cell) => cell.tp_pct));
    return Array.from(unique).sort((a, b) => a - b);
  }, [heatmapData.grid]);

  // Build grid map for quick lookup
  const gridMap = useMemo(() => {
    const map: Record<string, HeatmapCell> = {};
    for (const cell of heatmapData.grid) {
      const key = `${cell.sl_pct}_${cell.tp_pct}`;
      map[key] = cell;
    }
    return map;
  }, [heatmapData.grid]);

  const getCell = (slPct: number, tpPct: number): HeatmapCell | undefined => {
    return gridMap[`${slPct}_${tpPct}`];
  };

  const isOptimal =
    (slPct: number, tpPct: number) =>
      stats.optimalCell &&
      stats.optimalCell.sl_pct === slPct &&
      stats.optimalCell.tp_pct === tpPct;

  return (
    <div className="space-y-6">
      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Column Headers (TP percentages) */}
          <div className="flex">
            <div className="w-20 flex-shrink-0" />
            {tpPercentages.map((tp) => (
              <div
                key={`tp-${tp}`}
                className="w-24 flex-shrink-0 text-center text-xs font-semibold py-2"
                style={{ color: "var(--text-muted)" }}
              >
                TP {tp.toFixed(1)}%
              </div>
            ))}
          </div>

          {/* Grid Rows */}
          {slPercentages.map((sl) => (
            <div key={`sl-${sl}`} className="flex">
              {/* Row Header (SL percentage) */}
              <div
                className="w-20 flex-shrink-0 text-xs font-semibold py-2 px-2 text-right"
                style={{
                  color: "var(--text-muted)",
                  backgroundColor: "var(--bg-surface)",
                  borderRightColor: "var(--border)",
                  borderRightWidth: "1px",
                }}
              >
                SL {sl.toFixed(1)}%
              </div>

              {/* Data Cells */}
              {tpPercentages.map((tp) => {
                const cell = getCell(sl, tp);
                const isOpt = isOptimal(sl, tp);

                return (
                  <div
                    key={`cell-${sl}-${tp}`}
                    className="w-24 flex-shrink-0 flex items-center justify-center py-4 px-2 transition-all"
                    style={{
                      backgroundColor: cell
                        ? interpolateColor(cell.total_return, stats.min, stats.max)
                        : "var(--bg-surface)",
                      border: isOpt
                        ? `3px solid var(--accent-blue)`
                        : `1px solid var(--border)`,
                      cursor: cell ? "pointer" : "default",
                    }}
                    title={
                      cell
                        ? `SL: ${cell.sl_pct.toFixed(1)}%, TP: ${cell.tp_pct.toFixed(
                            1
                          )}%\nReturn: ${cell.total_return.toFixed(2)}%\nWin Rate: ${cell.win_rate.toFixed(
                            1
                          )}%\nTrades: ${cell.total_trades}`
                        : undefined
                    }
                  >
                    {cell && (
                      <div className="text-center">
                        <div
                          className="text-xs font-bold"
                          style={{
                            color: cell.total_return >= 0
                              ? "var(--text-heading)"
                              : "var(--text-heading)",
                          }}
                        >
                          {cell.total_return >= 0 ? "+" : ""}
                          {cell.total_return.toFixed(1)}%
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {cell.win_rate.toFixed(0)}% WR
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Color Legend */}
      <div className="flex items-center gap-4 justify-center text-xs">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: "rgb(255, 0, 0)" }}
          />
          <span style={{ color: "var(--text-muted)" }}>Negative</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: "rgb(255, 255, 255)" }}
          />
          <span style={{ color: "var(--text-muted)" }}>Zero</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: "rgb(0, 255, 0)" }}
          />
          <span style={{ color: "var(--text-muted)" }}>Positive</span>
        </div>
        {stats.optimalCell && (
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{
                borderColor: "var(--accent-blue)",
                borderWidth: "2px",
                backgroundColor: "transparent",
              }}
            />
            <span style={{ color: "var(--text-muted)" }}>Optimal</span>
          </div>
        )}
      </div>

      {/* Entry Hour Returns Bar Chart */}
      {heatmapData.entry_hour_returns.length > 0 && (
        <div
          className="rounded-lg p-6 mt-6"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
          <h4
            style={{ color: "var(--text-heading)" }}
            className="font-bold mb-4"
          >
            Entry Hour Returns
          </h4>

          {/* Find min and max for bar chart */}
          {(() => {
            const minReturn = Math.min(
              ...heatmapData.entry_hour_returns.map((h) => h.total_return)
            );
            const maxReturn = Math.max(
              ...heatmapData.entry_hour_returns.map((h) => h.total_return)
            );
            const range = maxReturn - minReturn || 1;

            return (
              <div className="space-y-2">
                {heatmapData.entry_hour_returns.map((hourData) => {
                  const height =
                    ((hourData.total_return - minReturn) / range) * 100;
                  const isPositive = hourData.total_return > 0;

                  return (
                    <div
                      key={hourData.hour}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="w-8 text-right text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {hourData.hour.toString().padStart(2, "0")}:00
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div
                          className="h-6 rounded transition-all"
                          style={{
                            width: `${Math.max(2, height)}%`,
                            backgroundColor: isPositive
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                            opacity: 0.8,
                          }}
                        />
                        <div
                          className="text-xs font-semibold"
                          style={{
                            color: isPositive
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                            minWidth: "60px",
                          }}
                        >
                          {isPositive ? "+" : ""}
                          {hourData.total_return.toFixed(2)}%
                        </div>
                      </div>
                      <div
                        className="w-12 text-right text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {hourData.win_rate.toFixed(0)}% WR
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Optimal Cell Info */}
      {stats.optimalCell && (
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            borderColor: "var(--accent-blue)",
            borderWidth: "1px",
          }}
        >
          <p
            style={{ color: "var(--accent-blue)" }}
            className="text-sm font-medium"
          >
            Optimal Parameters: SL {stats.optimalCell.sl_pct.toFixed(1)}% / TP{" "}
            {stats.optimalCell.tp_pct.toFixed(1)}% = +
            {stats.optimalCell.total_return.toFixed(2)}% ({" "}
            {stats.optimalCell.total_trades} trades, {" "}
            {stats.optimalCell.win_rate.toFixed(1)}% win rate )
          </p>
        </div>
      )}
    </div>
  );
}
