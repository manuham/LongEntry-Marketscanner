"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import {
  setMaxActiveMarkets,
  getErrorMessage,
} from "@/lib/api";

interface ActiveControlProps {
  currentValue: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export default function ActiveControl({
  currentValue,
  onValueChange,
  min = 1,
  max = 14,
  label = "Max Active",
}: ActiveControlProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIncrement = async () => {
    if (currentValue >= max) return;
    await updateValue(currentValue + 1);
  };

  const handleDecrement = async () => {
    if (currentValue <= min) return;
    await updateValue(currentValue - 1);
  };

  const updateValue = async (newValue: number) => {
    setIsLoading(true);
    setError(null);
    try {
      await setMaxActiveMarkets(newValue);
      onValueChange(newValue);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      <div
        className="flex items-center rounded-lg overflow-hidden"
        style={{
          border: "1px solid var(--border-solid)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <button
          onClick={handleDecrement}
          disabled={isLoading || currentValue <= min}
          className="px-2.5 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: "var(--text-body)" }}
          aria-label="Decrease max active"
        >
          <Minus size={14} />
        </button>

        <div
          className="px-4 py-1.5 text-center min-w-[80px]"
          style={{
            backgroundColor: "var(--bg-card)",
            borderLeft: "1px solid var(--border-solid)",
            borderRight: "1px solid var(--border-solid)",
          }}
        >
          <div
            className="text-[10px] font-medium uppercase tracking-wide"
            style={{ color: "var(--text-faint)" }}
          >
            Max Active
          </div>
          <div
            className="text-lg font-bold leading-tight"
            style={{ color: "var(--text-heading)" }}
          >
            {currentValue}
          </div>
        </div>

        <button
          onClick={handleIncrement}
          disabled={isLoading || currentValue >= max}
          className="px-2.5 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: "var(--text-body)" }}
          aria-label="Increase max active"
        >
          <Plus size={14} />
        </button>
      </div>

      {error && (
        <div
          className="text-xs px-2 py-1 rounded"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            color: "var(--accent-red)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
