"use client";

import { useState, useEffect } from "react";

interface HealthStatus {
  status: "ok" | "warning" | "critical";
  message: string;
  timestamp: string;
  checks?: Record<string, boolean>;
}

export default function HealthDot() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch("/api/health");
        if (response.ok) {
          const data = await response.json();
          setHealth({
            status: data.status || "ok",
            message: data.message || "All systems operational",
            timestamp: new Date().toLocaleTimeString(),
            checks: data.checks,
          });
        } else {
          setHealth({
            status: "critical",
            message: "Health check failed",
            timestamp: new Date().toLocaleTimeString(),
          });
        }
      } catch (error) {
        setHealth({
          status: "critical",
          message: "Unable to reach health endpoint",
          timestamp: new Date().toLocaleTimeString(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div
        className="w-3 h-3 rounded-full animate-pulse"
        style={{ backgroundColor: "var(--accent-amber)" }}
      />
    );
  }

  const getColor = () => {
    switch (health?.status) {
      case "ok":
        return "var(--accent-green)";
      case "warning":
        return "var(--accent-amber)";
      case "critical":
        return "var(--accent-red)";
      default:
        return "var(--text-muted)";
    }
  };

  return (
    <div className="relative">
      <button
        className="w-3 h-3 rounded-full transition-opacity hover:opacity-70"
        style={{ backgroundColor: getColor() }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label="Health status"
      />

      {showTooltip && health && (
        <div
          className="absolute right-0 mt-2 w-48 p-3 rounded-md shadow-lg text-sm z-50"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-body)",
            border: "1px solid var(--border-solid)",
          }}
        >
          <div className="font-semibold" style={{ color: "var(--text-heading)" }}>
            {health.status === "ok" ? "All OK" : "Issues Detected"}
          </div>
          <p className="mt-1">{health.message}</p>
          {health.checks && (
            <div className="mt-2 space-y-1 text-xs">
              {Object.entries(health.checks).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{key}:</span>
                  <span
                    style={{
                      color: value ? "var(--accent-green)" : "var(--accent-red)",
                    }}
                  >
                    {value ? "OK" : "Failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div
            className="mt-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {health.timestamp}
          </div>
        </div>
      )}
    </div>
  );
}
