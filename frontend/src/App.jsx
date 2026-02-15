import { Component, useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { fetchMarkets, fetchAnalytics, fetchAIPredictions, fetchHealth } from "./api";
import MarketCard from "./MarketCard";
import MarketDetail from "./MarketDetail";
import Results from "./Results";

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
            className="mt-4 px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
          >
            Go back to overview
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <div className="absolute right-0 top-5 hidden group-hover:block bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs w-56 z-50 shadow-lg">
        <p className="font-semibold text-gray-200 mb-2">{style.label}</p>
        <div className="space-y-1 text-gray-400">
          <p>{c.db ? "OK" : "FAIL"} Database</p>
          <p>{c.candles ? "OK" : "STALE"} Candles {c.candles_latest ? `(${c.candles_latest})` : ""}</p>
          <p>{c.analysis ? "OK" : "STALE"} Analysis {c.analysis_latest ? `(${c.analysis_latest})` : ""}</p>
          <p>{c.ai_outlook ? "OK" : "STALE"} AI Outlook {c.ai_outlook_latest ? `(${c.ai_outlook_latest})` : ""}</p>
          <p className="pt-1 text-gray-300">{c.active_markets || 0} active markets</p>
        </div>
      </div>
    </div>
  );
}

function Overview({ markets, analytics, aiPredictions, loading, error }) {
  return (
    <>
      {loading && <p className="text-gray-400">Loading markets...</p>}
      {error && (
        <p className="text-red-400 bg-red-950 px-4 py-3 rounded">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {markets.map((m) => (
          <MarketCard key={m.symbol} market={m} analytics={analytics[m.symbol]} aiPrediction={aiPredictions[m.symbol]} />
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [markets, setMarkets] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [aiPredictions, setAiPredictions] = useState({});
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

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
  }, []);

  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen p-6 max-w-[1920px] mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="hover:opacity-80 transition">
            <h1 className="text-3xl font-bold">LongEntry Market Scanner</h1>
          </Link>
          <HealthDot health={health} />
        </div>
        <nav className="flex gap-4 mt-2">
          <Link to="/" className={`text-sm ${isHome ? "text-white" : "text-gray-500 hover:text-gray-300"} transition`}>
            Markets
          </Link>
          <Link to="/results" className={`text-sm ${location.pathname === "/results" ? "text-white" : "text-gray-500 hover:text-gray-300"} transition`}>
            Results
          </Link>
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
                loading={loading}
                error={error}
              />
            }
          />
          <Route path="/market/:symbol" element={<MarketDetail markets={markets} />} />
          <Route path="/results" element={<Results />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}
