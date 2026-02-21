"use client";

import { Trade } from "@/lib/types";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useState } from "react";

interface TradeTableProps {
  trades: Trade[];
}

type SortKey = keyof Trade | "direction";
type SortDirection = "asc" | "desc";

export default function TradeTable({ trades }: TradeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("open_time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedTrades = [...trades].sort((a, b) => {
    let aVal: any = a[sortKey as keyof Trade];
    let bVal: any = b[sortKey as keyof Trade];

    if (sortKey === "direction") {
      aVal = a.open_price && a.close_price ? (a.close_price > a.open_price ? 1 : -1) : 0;
      bVal = b.open_price && b.close_price ? (b.close_price > b.open_price ? 1 : -1) : 0;
    }

    if (aVal === null || aVal === undefined) aVal = 0;
    if (bVal === null || bVal === undefined) bVal = 0;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else {
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    }
  });

  const SortHeader = ({
    label,
    sortKeyValue,
  }: {
    label: string;
    sortKeyValue: SortKey;
  }) => (
    <button
      onClick={() => handleSort(sortKeyValue)}
      className="flex items-center gap-1 transition-colors hover:opacity-70"
      style={{ color: "var(--text-heading)" }}
    >
      {label}
      {sortKey === sortKeyValue && (
        <span style={{ color: "var(--accent-blue)" }}>
          {sortDirection === "asc" ? "▲" : "▼"}
        </span>
      )}
    </button>
  );

  if (trades.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
        No trades recorded
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead
          style={{
            backgroundColor: "var(--bg-surface)",
            borderBottomColor: "var(--border)",
            borderBottomWidth: "1px",
          }}
        >
          <tr>
            <th className="px-4 py-3 text-left font-semibold">
              <SortHeader label="Date" sortKeyValue="open_time" />
            </th>
            <th className="px-4 py-3 text-left font-semibold">
              <SortHeader label="Direction" sortKeyValue="direction" />
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              <SortHeader label="Entry" sortKeyValue="open_price" />
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              <SortHeader label="Exit" sortKeyValue="close_price" />
            </th>
            <th className="px-4 py-3 text-right font-semibold">SL</th>
            <th className="px-4 py-3 text-right font-semibold">TP</th>
            <th className="px-4 py-3 text-right font-semibold">
              <SortHeader label="P&L %" sortKeyValue="pnl_percent" />
            </th>
            <th className="px-4 py-3 text-left font-semibold">Duration</th>
          </tr>
        </thead>
        <tbody>
          {sortedTrades.map((trade, index) => {
            const isWin = (trade.pnl_percent ?? 0) > 0;
            const pnlColor = isWin ? "var(--accent-green)" : "var(--accent-red)";

            const openDate = new Date(trade.open_time);
            const closeDate = trade.close_time
              ? new Date(trade.close_time)
              : null;

            const duration = closeDate
              ? (() => {
                  const diffMs = closeDate.getTime() - openDate.getTime();
                  const diffMins = Math.round(diffMs / (1000 * 60));
                  const hours = Math.floor(diffMins / 60);
                  const mins = diffMins % 60;
                  if (hours > 0) {
                    return `${hours}h ${mins}m`;
                  }
                  return `${mins}m`;
                })()
              : "Open";

            const isLong =
              trade.close_price && trade.open_price
                ? trade.close_price > trade.open_price
                : null;

            return (
              <tr
                key={index}
                style={{
                  borderBottomColor: "var(--border)",
                  borderBottomWidth: "1px",
                }}
                className="hover:opacity-80 transition-opacity"
              >
                <td
                  className="px-4 py-3"
                  style={{ color: "var(--text-body)" }}
                >
                  {openDate.toLocaleDateString()} {openDate.toLocaleTimeString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isLong === true ? (
                      <ArrowUp
                        size={16}
                        style={{ color: "var(--accent-green)" }}
                      />
                    ) : isLong === false ? (
                      <ArrowDown
                        size={16}
                        style={{ color: "var(--accent-red)" }}
                      />
                    ) : null}
                    <span
                      style={{
                        color:
                          isLong === true
                            ? "var(--accent-green)"
                            : isLong === false
                              ? "var(--accent-red)"
                              : "var(--text-muted)",
                      }}
                      className="font-medium"
                    >
                      {isLong === true
                        ? "LONG"
                        : isLong === false
                          ? "SHORT"
                          : "N/A"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--text-body)" }}>
                  {trade.open_price?.toFixed(2) ?? "N/A"}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--text-body)" }}>
                  {trade.close_price?.toFixed(2) ?? "N/A"}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                  {trade.sl_price?.toFixed(2) ?? "—"}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                  {trade.tp_price?.toFixed(2) ?? "—"}
                </td>
                <td
                  className="px-4 py-3 text-right font-semibold"
                  style={{ color: pnlColor }}
                >
                  {(trade.pnl_percent ?? 0) >= 0 ? "+" : ""}
                  {trade.pnl_percent?.toFixed(2) ?? "0.00"}%
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                  {duration}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
