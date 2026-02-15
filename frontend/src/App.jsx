import { Component, useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { fetchMarkets, fetchAnalytics, fetchAIPredictions, fetchHealth, fetchDrawdown, fetchMaxActive, updateMaxActive, overrideMarket } from "./api";
import { useTheme } from "./ThemeContext";
import MarketCard from "./MarketCard";
import MarketDetail from "./MarketDetail";
import Results from "./Results";
import HistoryView from "./HistoryView";

// ─── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 max-w-3xl mx-auto mt-10">
          <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
          <pre className="text-sm text-red-300 bg-red-950 rounded p-4 overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            className="mt-4 px-4 py-2 bg-th-surface text-th-heading rounded hover:opacity-80"
          >
            Go back to overview
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Health Dot ──────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  ok:      { dot: "bg-green-400", label: "All systems operational" },
  warning: { dot: "bg-yellow-400", label: "Data may be stale" },
  error:   { dot: "bg-red-400", label: "System error" },
};

function HealthDot({ health }) {
  if (!health) return null;
  const style = STATUS_STYLE[health.status] || STATUS_STYLE.error;
  const c = health.checks || {};
  return (
    <div className="relative group">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${style.dot}`} title={style.label} />
      <div className="absolute right-0 top-5 hidden group-hover:block bg-th-card border border-th rounded-lg p-3 text-xs w-56 z-50 shadow-lg">
        <p className="font-semibold text-th-heading mb-2">{style.label}</p>
        <div className="space-y-1 text-th-muted">
          <p>{c.db ? "OK" : "FAIL"} Database</p>
          <p>{c.candles ? "OK" : "STALE"} Candles {c.candles_latest ? `(${c.candles_latest})` : ""}</p>
          <p>{c.analysis ? "OK" : "STALE"} Analysis {c.analysis_latest ? `(${c.analysis_latest})` : ""}</p>
          <p>{c.ai_outlook ? "OK" : "STALE"} AI Outlook {c.ai_outlook_latest ? `(${c.ai_outlook_latest})` : ""}</p>
          <p className="pt-1 text-th-secondary">{c.active_markets || 0} active markets</p>
        </div>
      </div>
    </div>
  );
}

// ─── Notification Panel ──────────────────────────────────────────────────────

function NotificationPanel({ health, drawdown }) {
  const [open, setOpen] = useState(false);

  // Build notification list from health + drawdown data
  const notifications = [];

  if (health?.checks) {
    const c = health.checks;
    if (c.analysis_latest) {
      notifications.push({
        type: "info",
        text: `Analysis completed: ${c.analysis_latest}`,
      });
    }
    if (c.candles_latest) {
      notifications.push({
        type: "info",
        text: `Candles last updated: ${c.candles_latest}`,
      });
    }
    if (c.active_markets) {
      notifications.push({
        type: "success",
        text: `${c.active_markets} markets active this week`,
      });
    }
    if (!c.db) {
      notifications.push({ type: "error", text: "Database connection failed" });
    }
    if (!c.candles) {
      notifications.push({ type: "warning", text: "Candle data may be stale" });
    }
    if (!c.analysis) {
      notifications.push({ type: "warning", text: "Analysis data may be stale" });
    }
  }

  // Drawdown alerts
  if (drawdown) {
    for (const d of drawdown) {
      if (d.is_active && d.week_pnl_percent < -2) {
        notifications.push({
          type: "warning",
          text: `${d.symbol} down ${d.week_pnl_percent.toFixed(2)}% this week`,
        });
      }
      if (d.is_active && d.week_pnl_percent > 3) {
        notifications.push({
          type: "success",
          text: `${d.symbol} up +${d.week_pnl_percent.toFixed(2)}% this week`,
        });
      }
    }
  }

  const hasWarnings = notifications.some((n) => n.type === "error" || n.type === "warning");

  const TYPE_COLORS = {
    info: "text-blue-400",
    success: "text-emerald-400",
    warning: "text-amber-400",
    error: "text-rose-400",
  };

  const TYPE_DOTS = {
    info: "bg-blue-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    error: "bg-rose-400",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-th-surface transition-colors text-th-muted hover:text-th-heading"
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M13.5 6.75a4.5 4.5 0 1 0-9 0c0 5.25-2.25 6.75-2.25 6.75h13.5s-2.25-1.5-2.25-6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10.3 15.75a1.5 1.5 0 0 1-2.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {hasWarnings && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-th-base" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 bg-th-card border border-th rounded-xl shadow-xl z-50 w-80 max-h-80 overflow-y-auto">
          <div className="px-4 py-3 border-b border-th">
            <h4 className="text-sm font-semibold text-th-heading">Notifications</h4>
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-th-muted">No notifications</p>
          ) : (
            <div className="divide-y divide-th">
              {notifications.map((n, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOTS[n.type]}`} />
                  <span className={`text-sm ${TYPE_COLORS[n.type]}`}>{n.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Theme Toggle Button ─────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg hover:bg-th-surface transition-colors text-th-muted hover:text-th-heading"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="3.75" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M9 1.5v1.5M9 15v1.5M3.7 3.7l1.06 1.06M13.24 13.24l1.06 1.06M1.5 9H3M15 9h1.5M3.7 14.3l1.06-1.06M13.24 4.76l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M15.75 9.86A6.75 6.75 0 1 1 8.14 2.25 5.25 5.25 0 0 0 15.75 9.86Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

// ─── Drawdown Sidebar ────────────────────────────────────────────────────────

function DrawdownSidebar({ drawdown }) {
  if (!drawdown || drawdown.length === 0) return null;
  const active = drawdown.filter((d) => d.is_active);
  if (active.length === 0) return null;

  const totalPnl = active.reduce((s, d) => s + d.week_pnl_percent, 0);

  return (
    <div className="bg-th-card border border-th rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-th-secondary uppercase tracking-wider">This Week&apos;s Risk</h3>
        <span className={`font-mono text-sm font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}%
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {active.map((d) => (
          <Link
            key={d.symbol}
            to={`/market/${d.symbol}`}
            className="bg-th-card-hover rounded-lg px-3 py-2 hover:bg-th-surface transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-th-heading">{d.symbol}</span>
              {d.open_trades > 0 && (
                <span className="text-[9px] px-1 rounded bg-blue-900/40 text-blue-400">{d.open_trades} open</span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-th-faint">{d.week_wins}W/{d.week_losses}L</span>
              <span className={`font-mono font-semibold ${d.week_pnl_percent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {d.week_pnl_percent >= 0 ? "+" : ""}{d.week_pnl_percent.toFixed(2)}%
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── View Mode Toggle ────────────────────────────────────────────────────────

function ViewToggle({ mode, onToggle }) {
  return (
    <div className="flex gap-1 bg-th-card border border-th rounded-lg p-0.5">
      <button
        onClick={() => onToggle("grid")}
        className={`p-1.5 rounded-md transition-colors ${mode === "grid" ? "bg-th-surface text-th-heading" : "text-th-muted hover:text-th-secondary"}`}
        title="Grid view"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      </button>
      <button
        onClick={() => onToggle("table")}
        className={`p-1.5 rounded-md transition-colors ${mode === "table" ? "bg-th-surface text-th-heading" : "text-th-muted hover:text-th-secondary"}`}
        title="Table view"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function ActiveMarketsInput({ maxActive, onUpdate }) {
  const [value, setValue] = useState(maxActive);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { setValue(maxActive); }, [maxActive]);

  const handleChange = (newVal) => {
    const clamped = Math.max(1, Math.min(14, newVal));
    setValue(clamped);
    setSaving(true);
    setErr(null);
    updateMaxActive(clamped)
      .then((res) => onUpdate(res.max_active))
      .catch((e) => { setValue(maxActive); setErr(e.message); })
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-th-secondary">Activate top</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleChange(value - 1)}
          disabled={value <= 1 || saving}
          className="w-7 h-7 rounded-md bg-th-surface text-th-heading hover:bg-th-card-hover disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold transition-colors"
        >
          -
        </button>
        <span className="w-8 text-center font-mono text-lg font-bold text-th-heading">{value}</span>
        <button
          onClick={() => handleChange(value + 1)}
          disabled={value >= 14 || saving}
          className="w-7 h-7 rounded-md bg-th-surface text-th-heading hover:bg-th-card-hover disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold transition-colors"
        >
          +
        </button>
      </div>
      <span className="text-sm text-th-secondary">markets</span>
      {saving && <span className="text-xs text-th-faint animate-pulse">saving...</span>}
      {err && <span className="text-xs text-rose-400">{err}</span>}
    </div>
  );
}

function Overview({ markets, analytics, aiPredictions, drawdown, maxActive, onMaxActiveUpdate, onToggleActive, loading, error }) {
  const [viewMode, setViewMode] = useState("grid");

  // Sort markets: ranked markets first (by rank ascending), unranked at bottom
  const sorted = [...markets].sort((a, b) => {
    const ra = analytics[a.symbol]?.rank;
    const rb = analytics[b.symbol]?.rank;
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return 0;
  });

  return (
    <>
      {loading && <p className="text-th-muted">Loading markets...</p>}
      {error && (
        <p className="text-red-400 bg-red-950 px-4 py-3 rounded">{error}</p>
      )}

      <DrawdownSidebar drawdown={drawdown} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-6 flex-wrap">
          <h2 className="text-lg font-semibold text-th-heading">{markets.length} Markets</h2>
          <ActiveMarketsInput maxActive={maxActive} onUpdate={onMaxActiveUpdate} />
        </div>
        <ViewToggle mode={viewMode} onToggle={setViewMode} />
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((m) => (
            <MarketCard key={m.symbol} market={m} analytics={analytics[m.symbol]} aiPrediction={aiPredictions[m.symbol]} onToggleActive={onToggleActive} viewMode="grid" />
          ))}
        </div>
      ) : (
        <div className="bg-th-card border border-th rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_100px_80px_80px_80px_60px_80px] gap-2 px-4 py-2 text-[10px] text-th-faint uppercase tracking-wide border-b border-th font-medium">
            <span></span>
            <span>Symbol</span>
            <span className="text-right">Price</span>
            <span className="text-right">Score</span>
            <span className="text-right">Win %</span>
            <span className="text-right">BT Ret</span>
            <span className="text-center">AI</span>
            <span className="text-right">Rank</span>
          </div>
          {sorted.map((m) => (
            <MarketCard key={m.symbol} market={m} analytics={analytics[m.symbol]} aiPrediction={aiPredictions[m.symbol]} onToggleActive={onToggleActive} viewMode="table" />
          ))}
        </div>
      )}
    </>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [markets, setMarkets] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [aiPredictions, setAiPredictions] = useState({});
  const [health, setHealth] = useState(null);
  const [drawdown, setDrawdown] = useState([]);
  const [maxActive, setMaxActive] = useState(6);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const refreshAnalytics = () => {
    return fetchAnalytics().then((analyticsData) => {
      const bySymbol = {};
      for (const a of analyticsData) bySymbol[a.symbol] = a;
      setAnalytics(bySymbol);
    }).catch(() => {});
  };

  const handleToggleActive = (symbol, active) => {
    return overrideMarket(symbol, active).then(() => refreshAnalytics());
  };

  useEffect(() => {
    Promise.all([
      fetchMarkets(),
      fetchAnalytics().catch(() => []),
      fetchAIPredictions().catch(() => []),
    ])
      .then(([marketsData, analyticsData, aiData]) => {
        setMarkets(marketsData);
        const bySymbol = {};
        for (const a of analyticsData) {
          bySymbol[a.symbol] = a;
        }
        setAnalytics(bySymbol);
        const aiBySymbol = {};
        for (const p of aiData) {
          aiBySymbol[p.symbol] = p;
        }
        setAiPredictions(aiBySymbol);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetchHealth().then(setHealth).catch(() => {});
    fetchDrawdown().then(setDrawdown).catch(() => {});
    fetchMaxActive().then((res) => setMaxActive(res.max_active)).catch(() => {});
  }, []);

  const NAV_ITEMS = [
    { path: "/", label: "Markets" },
    { path: "/results", label: "Results" },
    { path: "/history", label: "History" },
  ];

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-[1920px] mx-auto">
      <header className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="hover:opacity-80 transition">
              <h1 className="text-2xl sm:text-3xl font-bold text-th-heading">LongEntry Market Scanner</h1>
            </Link>
            <HealthDot health={health} />
          </div>
          <div className="flex items-center gap-2">
            <NotificationPanel health={health} drawdown={drawdown} />
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-4 mt-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-sm transition ${
                location.pathname === item.path
                  ? "text-th-heading font-medium"
                  : "text-th-faint hover:text-th-secondary"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <ErrorBoundary>
        <Routes>
          <Route
            path="/"
            element={
              <Overview
                markets={markets}
                analytics={analytics}
                aiPredictions={aiPredictions}
                drawdown={drawdown}
                maxActive={maxActive}
                onMaxActiveUpdate={(val) => { setMaxActive(val); refreshAnalytics(); }}
                onToggleActive={handleToggleActive}
                loading={loading}
                error={error}
              />
            }
          />
          <Route path="/market/:symbol" element={<MarketDetail markets={markets} />} />
          <Route path="/results" element={<Results />} />
          <Route path="/history" element={<HistoryView />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}
