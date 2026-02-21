"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import {
  setMaxActiveMarkets,
  setMaxActiveStocks,
  getErrorMessage,
} from "@/lib/api";

interface ActiveControlProps {
  currentValue: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  isStocks?: boolean;
}

export default function ActiveControl({
  currentValue,
  onValueChange,
  min = 1,
  max = 14,
  label = "Max Active",
  isStocks = false,
}: ActiveControlProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIncrement = async () => {
    if (currentValue >= max) return;
    const newValue = currentValue + 1;
    await updateValue(newValue);
  };

  const handleDecrement = async () => {
    if (currentValue <= min) return;
    const newValue = currentValue - 1;
    await updateValue(newValue);
  };

  const updateValue = async (newValue: number) => {
    setIsLoading(true);
    setError(null);
    try {
      if (isStocks) {
        await setMaxActiveStocks(newValue);
      } else {
        await setMaxActiveMarkets(newValue);
      }
      onValueChange(newValue);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-3">
        <button
          onClick={handleDecrement}
          disabled={isLoading || currentValue <= min}
          className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-body)",
          }}
          title="Decrease"
          aria-label="Decrease max active"
        >
          <Minus size={18} />
        </button>

        <div className="text-center min-w-[100px]">
          <div
            className="text-xs font-semibold uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--text-heading)" }}
          >
            {currentValue}
          </div>
        </div>

        <button
          onClick={handleIncrement}
          disabled={isLoading || currentValue >= max}
          className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-body)",
          }}
          title="Increase"
          aria-label="Increase max active"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div
          className="text-xs px-2 py-1 rounded"
          style={{
            backgroundColor: "rgba(244, 63, 94, 0.1)",
            color: "var(--accent-red)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
