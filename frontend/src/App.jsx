import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { fetchMarkets, fetchAnalytics } from "./api";
import MarketCard from "./MarketCard";
import MarketDetail from "./MarketDetail";

function Overview({ markets, analytics, loading, error }) {
  return (
    <>
      {loading && <p className="text-gray-400">Loading markets...</p>}
      {error && (
        <p className="text-red-400 bg-red-950 px-4 py-3 rounded">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {markets.map((m) => (
          <MarketCard key={m.symbol} market={m} analytics={analytics[m.symbol]} />
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [markets, setMarkets] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    Promise.all([
      fetchMarkets(),
      fetchAnalytics().catch(() => []),
    ])
      .then(([marketsData, analyticsData]) => {
        setMarkets(marketsData);
        const bySymbol = {};
        for (const a of analyticsData) {
          bySymbol[a.symbol] = a;
        }
        setAnalytics(bySymbol);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <Link to="/" className="hover:opacity-80 transition">
          <h1 className="text-3xl font-bold">LongEntry Market Scanner</h1>
        </Link>
        {isHome && (
          <p className="text-gray-400 mt-1">14 Markets &middot; Weekly Overview</p>
        )}
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <Overview
              markets={markets}
              analytics={analytics}
              loading={loading}
              error={error}
            />
          }
        />
        <Route path="/market/:symbol" element={<MarketDetail markets={markets} />} />
      </Routes>
    </div>
  );
}
