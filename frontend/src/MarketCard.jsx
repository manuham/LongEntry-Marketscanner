const CATEGORY_COLORS = {
  commodity: "border-yellow-600",
  index: "border-blue-600",
};

export default function MarketCard({ market }) {
  const borderColor = CATEGORY_COLORS[market.category] || "border-gray-600";

  return (
    <div
      className={`bg-gray-900 rounded-lg p-4 border-l-4 ${borderColor} hover:bg-gray-800 transition`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold">{market.symbol}</h3>
          <p className="text-sm text-gray-400">{market.name}</p>
        </div>
        <span className="text-xs uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400">
          {market.category}
        </span>
      </div>

      <div className="mt-3">
        {market.latest_price != null ? (
          <p className="text-2xl font-mono">
            {market.latest_price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        ) : (
          <p className="text-gray-500 text-sm italic">No data yet</p>
        )}
      </div>

      {market.latest_time && (
        <p className="text-xs text-gray-500 mt-1">
          {new Date(market.latest_time).toLocaleString()}
        </p>
      )}
    </div>
  );
}
