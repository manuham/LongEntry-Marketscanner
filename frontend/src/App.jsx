import { useEffect, useState } from "react";
import { fetchMarkets, fetchAnalytics } from "./api";
import MarketCard from "./MarketCard";

export default function App() {
  const [markets, setMarkets] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchMarkets(),
      fetchAnalytics().catch(() => []),
    ])
      .then(([marketsData, analyticsData]) => {
        setMarkets(marketsData);
        // Index analytics by symbol for easy lookup
        const bySymbol = {};
        for (const a of analyticsData) {
          bySymbol[a.symbol] = a;
        }
        setAnalytics(bySymbol);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">LongEntry Market Scanner</h1>
        <p className="text-gray-400 mt-1">14 Markets &middot; Weekly Overview</p>
      </header>

      {loading && <p className="text-gray-400">Loading markets...</p>}
      {error && (
        <p className="text-red-400 bg-red-950 px-4 py-3 rounded">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {markets.map((m) => (
          <MarketCard key={m.symbol} market={m} analytics={analytics[m.symbol]} />
        ))}
      </div>
    </div>
  );
}
