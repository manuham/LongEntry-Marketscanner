"""
Market Context — Free external data for AI prompt enrichment.

Sources:
- VIX/DXY levels (Yahoo Finance) — volatility and dollar strength
- Basic market correlations

All data is cached to minimize API calls.
"""

import logging
import json
import time

logger = logging.getLogger(__name__)

# Simple in-memory cache
_cache = {}
CACHE_TTL = {
    "vix": 7200,        # 2 hours
    "dxy": 7200,        # 2 hours
}


def _get_cached(key: str):
    """Get cached value if not expired."""
    if key in _cache:
        data, ts = _cache[key]
        ttl = CACHE_TTL.get(key.split("_")[0], 3600)
        if time.time() - ts < ttl:
            return data
    return None


def _set_cached(key: str, data):
    """Cache a value with timestamp."""
    _cache[key] = (data, time.time())


async def get_market_context(symbol: str) -> dict:
    """Get external market context for a symbol.

    Returns a dict with available context data.
    Failures are gracefully handled — returns partial data.
    """
    context = {}

    # VIX level (relevant for all markets)
    vix = await _fetch_vix()
    if vix:
        context["vix"] = vix

    # DXY (US Dollar Index — relevant for gold, international indices)
    dxy = await _fetch_dxy()
    if dxy:
        context["dxy"] = dxy

    # Market-specific context
    if symbol in ("XAUUSD", "XAGUSD"):
        context["note"] = "Precious metals: watch DXY inverse correlation and real yields"
    elif symbol in ("US500", "US100", "US30"):
        context["note"] = "US indices: watch VIX for volatility regime, Fed policy"
    elif symbol in ("GER40", "FRA40", "EU50", "SPN35"):
        context["note"] = "European indices: watch ECB policy, EUR/USD, energy prices"
    elif symbol in ("UK100",):
        context["note"] = "UK index: watch BOE policy, GBP/USD, commodity exposure"
    elif symbol in ("JP225",):
        context["note"] = "Japan index: watch BOJ policy, USD/JPY, yen carry trade"
    elif symbol in ("HK50",):
        context["note"] = "HK index: watch PBOC, China policy, geopolitics"
    elif symbol in ("AUS200",):
        context["note"] = "Australia index: watch RBA, commodity prices, AUD/USD"
    elif symbol == "N25":
        context["note"] = "Netherlands index: watch ECB policy, European sentiment"

    return context


async def _fetch_vix() -> dict | None:
    """Fetch VIX level — try Yahoo Finance API."""
    cached = _get_cached("vix")
    if cached:
        return cached

    try:
        import urllib.request
        url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d"
        req = urllib.request.Request(url, headers={"User-Agent": "LongEntry/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        chart = data.get("chart", {}).get("result", [{}])[0]
        quote = chart.get("indicators", {}).get("quote", [{}])[0]
        closes = quote.get("close", [])

        if closes:
            current = closes[-1]
            if current:
                result = {
                    "level": round(current, 2),
                    "regime": "low" if current < 15 else "normal" if current < 25 else "elevated" if current < 35 else "extreme",
                }
                _set_cached("vix", result)
                return result
    except Exception as e:
        logger.debug("VIX fetch failed: %s", e)

    return None


async def _fetch_dxy() -> dict | None:
    """Fetch DXY (US Dollar Index) level."""
    cached = _get_cached("dxy")
    if cached:
        return cached

    try:
        import urllib.request
        url = "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d"
        req = urllib.request.Request(url, headers={"User-Agent": "LongEntry/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        chart = data.get("chart", {}).get("result", [{}])[0]
        quote = chart.get("indicators", {}).get("quote", [{}])[0]
        closes = quote.get("close", [])

        if closes:
            current = closes[-1]
            if current:
                result = {
                    "level": round(current, 2),
                    "trend": "strong" if current > 105 else "neutral" if current > 98 else "weak",
                }
                _set_cached("dxy", result)
                return result
    except Exception as e:
        logger.debug("DXY fetch failed: %s", e)

    return None


def format_context_for_prompt(context: dict) -> str:
    """Format market context as a text block for AI prompt injection."""
    if not context:
        return ""

    lines = ["MARKET CONTEXT:"]

    if "vix" in context:
        vix = context["vix"]
        lines.append(f"- VIX: {vix['level']} ({vix['regime']} volatility regime)")

    if "dxy" in context:
        dxy = context["dxy"]
        lines.append(f"- DXY (US Dollar): {dxy['level']} ({dxy['trend']})")

    if "note" in context:
        lines.append(f"- Context: {context['note']}")

    return "\n".join(lines)
