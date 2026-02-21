//+------------------------------------------------------------------+
//| FixedLongEntry_Server.mq5 — Server-driven long entry EA         |
//| Smart position management: split TP, break-even, trailing stop   |
//| Pulls config from server periodically, enters BUY at entry time  |
//| Attach to each of the 14 charts                                  |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "2.00"
#property strict

#include <Trade\Trade.mqh>

input group "==== Server Integration ===="
input string   ServerURL = "";              // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";              // API Key for authentication

input group "==== Risk Settings ===="
input double   RiskAmount = 100.0;          // Risk Amount in Account Currency

input group "==== Trading Settings ===="
input ulong    MagicNumber = 100001;        // Base Magic Number (runner uses +1)
input string   TradeComment = "LongEntry";  // Trade Comment
input int      ConfigRefreshHours = 4;      // Config refresh interval (hours)

// Server config (refreshed periodically)
bool     g_active           = false;
int      g_entryHour        = 0;
int      g_entryMinute      = 0;
double   g_slPercent        = 0;
double   g_tpPercent        = 0;
string   g_weekStart        = "";

// Smart position management config
double   g_tp1ClosePct      = 0.5;          // Fraction of position to close at TP1 (0-1)
double   g_tp2Percent       = 0.0;          // Extended TP target as % (0 = disabled/legacy)
string   g_aiConfidence     = "none";       // "high", "medium", "low", "none"
bool     g_useTrailingStop  = false;        // Enable trailing stop on runner
double   g_trailingStopDist = 0.0;          // Trailing distance as % of entry price

// State tracking
datetime g_lastConfigFetch  = 0;
bool     g_tradedToday      = false;
datetime g_lastTradeDate    = 0;
bool     g_tp1Hit           = false;        // TP1 position closed
bool     g_breakEvenSet     = false;        // Break-even applied to runner
double   g_entryPrice       = 0;            // Entry price for trailing calculation
double   g_runnerOpenPrice  = 0;            // Runner position open price

CTrade   g_trade;


//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(MagicNumber);

   if(StringLen(ServerURL) == 0)
     {
      Print("[LongEntry] WARNING: ServerURL is empty — EA will not trade");
      return INIT_SUCCEEDED;
     }

   Print("[LongEntry] Initialized for ", _Symbol,
         " | Magic: ", MagicNumber,
         " | Risk: ", DoubleToString(RiskAmount, 2),
         " | Refresh: every ", ConfigRefreshHours, "h");

   // Fetch config immediately on init
   FetchConfig();

   return INIT_SUCCEEDED;
  }


//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(StringLen(ServerURL) == 0)
      return;

   // Skip weekends
   MqlDateTime dt;
   TimeCurrent(dt);
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return;

   // Reset traded-today flag on new day
   datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if(g_lastTradeDate < todayStart)
     {
      g_tradedToday = false;
      g_tp1Hit = false;
      g_breakEvenSet = false;
      g_entryPrice = 0;
      g_runnerOpenPrice = 0;
     }

   // Fetch config periodically (every ConfigRefreshHours hours)
   int refreshSeconds = ConfigRefreshHours * 3600;
   if(refreshSeconds <= 0) refreshSeconds = 14400;  // fallback to 4h
   if(TimeCurrent() - g_lastConfigFetch >= refreshSeconds)
      FetchConfig();

   // Check if it's entry time
   if(!g_active || g_tradedToday)
     {
      // Even if not trading today, manage open positions
      ManageOpenPositions();
      return;
     }

   if(dt.hour == g_entryHour && dt.min >= g_entryMinute)
      ExecuteEntry();
   else
      // Manage any open positions
      ManageOpenPositions();
  }


//+------------------------------------------------------------------+
//| Fetch trading config from server                                  |
//+------------------------------------------------------------------+
void FetchConfig()
  {
   // Build clean symbol name (strip broker suffixes)
   string symbol = _Symbol;
   StringReplace(symbol, ".cash", "");

   string url = ServerURL + "/config/" + symbol;
   string headers = "X-API-Key: " + APIKey + "\r\n";

   char postData[];  // empty for GET request
   char result[];
   string resultHeaders;
   int timeout = 30000;

   ResetLastError();
   int res = WebRequest("GET", url, headers, timeout, postData, result, resultHeaders);

   if(res != 200)
     {
      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[LongEntry] Config fetch failed (code ", res, "): ", errBody);
      // Fail-safe: deactivate on error
      g_active = false;
      return;
     }

   string json = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   g_lastConfigFetch = TimeCurrent();

   // Parse legacy config
   g_active      = GetJsonBool(json, "active");
   g_entryHour   = (int)GetJsonDouble(json, "entryHour");
   g_entryMinute = (int)GetJsonDouble(json, "entryMinute");
   g_slPercent   = GetJsonDouble(json, "slPercent");
   g_tpPercent   = GetJsonDouble(json, "tpPercent");
   g_weekStart   = GetJsonString(json, "weekStart");

   // Parse smart position management config
   g_tp1ClosePct = GetJsonDouble(json, "tp1ClosePct");
   g_tp2Percent = GetJsonDouble(json, "tp2Percent");
   g_aiConfidence = GetJsonString(json, "aiConfidence");
   g_useTrailingStop = GetJsonBool(json, "useTrailingStop");
   g_trailingStopDist = GetJsonDouble(json, "trailingStopDistance");

   // Default values if not provided
   if(g_tp1ClosePct <= 0 || g_tp1ClosePct > 1)
      g_tp1ClosePct = 0.5;
   if(g_trailingStopDist < 0)
      g_trailingStopDist = 0;

   // Build log message
   string smartMode = (g_tp2Percent > 0) ? "SMART" : "LEGACY";
   Print("[LongEntry] Config: active=", g_active,
         " entry=", IntegerToString(g_entryHour), ":",
         StringFormat("%02d", g_entryMinute),
         " SL=", DoubleToString(g_slPercent, 2), "%",
         " TP=", DoubleToString(g_tpPercent, 2), "%",
         " week=", g_weekStart,
         " [", smartMode, "]");

   if(g_tp2Percent > 0)
     {
      Print("[LongEntry] Smart Mode: TP1Close=", DoubleToString(g_tp1ClosePct * 100, 1), "%",
            " TP2=", DoubleToString(g_tp2Percent, 2), "%",
            " AI=", g_aiConfidence,
            " Trail=", (g_useTrailingStop ? "YES" : "NO"));
     }
  }


//+------------------------------------------------------------------+
//| Execute a BUY trade with smart position management                |
//+------------------------------------------------------------------+
void ExecuteEntry()
  {
   // Check if we already have a position with these magic numbers
   if(HasOpenPosition())
     {
      g_tradedToday = true;
      return;
     }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(ask <= 0)
     {
      Print("[LongEntry] ERROR: Invalid Ask price");
      return;
     }

   g_entryPrice = ask;

   // Calculate SL and TP prices
   double slPrice = ask * (1.0 - g_slPercent / 100.0);
   double tpPrice = ask * (1.0 + g_tpPercent / 100.0);

   // For smart mode, also calculate TP2
   double tp2Price = 0;
   if(g_tp2Percent > 0)
      tp2Price = ask * (1.0 + g_tp2Percent / 100.0);

   // Normalize to tick size
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize > 0)
     {
      slPrice = MathRound(slPrice / tickSize) * tickSize;
      tpPrice = MathRound(tpPrice / tickSize) * tickSize;
      if(tp2Price > 0)
         tp2Price = MathRound(tp2Price / tickSize) * tickSize;
     }

   // Calculate total lot size based on risk
   double totalLots = CalculateLotSize(ask, slPrice);
   if(totalLots <= 0)
     {
      Print("[LongEntry] ERROR: Could not calculate valid lot size");
      return;
     }

   // ==================== SMART MODE (Split TP) ====================
   if(g_tp2Percent > 0)
     {
      double tp1Lots = totalLots * g_tp1ClosePct;
      double runnerLots = totalLots * (1.0 - g_tp1ClosePct);

      // Normalize lot sizes
      double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      if(lotStep > 0)
        {
         tp1Lots = MathFloor(tp1Lots / lotStep) * lotStep;
         runnerLots = MathFloor(runnerLots / lotStep) * lotStep;
        }

      // Position 1: TP1 with original TP
      if(tp1Lots > 0)
        {
         if(g_trade.Buy(tp1Lots, _Symbol, ask, slPrice, tpPrice, TradeComment))
           {
            Print("[LongEntry] SMART TP1: BUY ", DoubleToString(tp1Lots, 2), " ", _Symbol,
                  " @ ", DoubleToString(ask, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)),
                  " SL=", DoubleToString(slPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)),
                  " TP1=", DoubleToString(tpPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)));
           }
         else
           {
            Print("[LongEntry] ERROR: TP1 position failed — ", g_trade.ResultRetcodeDescription());
            return;
           }
        }

      // Position 2: Runner with TP2
      if(runnerLots > 0)
        {
         // Use MagicNumber + 1 for runner to distinguish positions
         g_trade.SetExpertMagicNumber(MagicNumber + 1);
         if(g_trade.Buy(runnerLots, _Symbol, ask, slPrice, tp2Price, TradeComment))
           {
            g_runnerOpenPrice = ask;
            Print("[LongEntry] SMART Runner: BUY ", DoubleToString(runnerLots, 2), " ", _Symbol,
                  " @ ", DoubleToString(ask, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)),
                  " SL=", DoubleToString(slPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)),
                  " TP2=", DoubleToString(tp2Price, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)));
           }
         else
           {
            Print("[LongEntry] ERROR: Runner position failed — ", g_trade.ResultRetcodeDescription());
           }
         // Reset magic number back
         g_trade.SetExpertMagicNumber(MagicNumber);
        }

      g_tradedToday = true;
      g_lastTradeDate = TimeCurrent();
     }
   // ==================== LEGACY MODE (Single Position) ====================
   else
     {
      if(g_trade.Buy(totalLots, _Symbol, ask, slPrice, tpPrice, TradeComment))
        {
         Print("[LongEntry] LEGACY: BUY ", DoubleToString(totalLots, 2), " ", _Symbol,
               " @ ", DoubleToString(ask, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)),
               " SL=", DoubleToString(slPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)),
               " TP=", DoubleToString(tpPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)));
         g_tradedToday = true;
         g_lastTradeDate = TimeCurrent();
        }
      else
        {
         Print("[LongEntry] ERROR: Buy failed — ", g_trade.ResultRetcodeDescription());
        }
     }
  }


//+------------------------------------------------------------------+
//| Manage open positions: break-even, trailing stop                  |
//+------------------------------------------------------------------+
void ManageOpenPositions()
  {
   if(g_tp2Percent <= 0 || g_entryPrice <= 0)
      return; // Only in smart mode

   // Find runner position (MagicNumber + 1)
   int runnerIdx = -1;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol)
        {
         if(PositionGetInteger(POSITION_MAGIC) == (long)(MagicNumber + 1))
           {
            runnerIdx = i;
            break;
           }
        }
     }

   if(runnerIdx < 0)
      return; // No runner position

   // ==================== CHECK FOR TP1 HIT ====================
   if(!g_tp1Hit)
     {
      // Check if TP1 position (MagicNumber) is closed
      bool tp1Closed = true;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         if(PositionGetSymbol(i) == _Symbol)
           {
            if(PositionGetInteger(POSITION_MAGIC) == (long)MagicNumber)
              {
               tp1Closed = false;
               break;
              }
           }
        }

      if(tp1Closed)
        {
         g_tp1Hit = true;
         Print("[LongEntry] TP1 position closed, runner is now active");
        }
     }

   // ==================== BREAK-EVEN LOGIC ====================
   if(g_tp1Hit && !g_breakEvenSet)
     {
      if(PositionSelectByTicket(PositionGetTicket(runnerIdx)))
        {
         double currentSL = PositionGetDouble(POSITION_SL);
         // Move SL to entry price (break-even)
         if(currentSL < g_entryPrice)
           {
            double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
            double newSL = g_entryPrice;
            if(tickSize > 0)
               newSL = MathRound(newSL / tickSize) * tickSize;

            if(g_trade.PositionModify(PositionGetTicket(runnerIdx), newSL, PositionGetDouble(POSITION_TP)))
              {
               Print("[LongEntry] Break-Even: Runner SL moved to entry price ", DoubleToString(newSL, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)));
               g_breakEvenSet = true;
              }
            else
              {
               Print("[LongEntry] WARNING: Failed to set break-even — ", g_trade.ResultRetcodeDescription());
              }
           }
        }
     }

   // ==================== TRAILING STOP LOGIC ====================
   if(g_useTrailingStop && g_entryPrice > 0 && g_runnerOpenPrice > 0)
     {
      if(PositionSelectByTicket(PositionGetTicket(runnerIdx)))
        {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double trailDist = g_entryPrice * g_trailingStopDist / 100.0;
         double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);

         if(tickSize > 0)
            trailDist = MathRound(trailDist / tickSize) * tickSize;

         // Only trail if in profit beyond trail distance
         if(bid > g_entryPrice + trailDist)
           {
            double newSL = bid - trailDist;
            if(tickSize > 0)
               newSL = MathRound(newSL / tickSize) * tickSize;

            double currentSL = PositionGetDouble(POSITION_SL);
            // Only move SL up, never down
            if(newSL > currentSL)
              {
               if(g_trade.PositionModify(PositionGetTicket(runnerIdx), newSL, PositionGetDouble(POSITION_TP)))
                 {
                  Print("[LongEntry] Trailing Stop: Runner SL updated to ", DoubleToString(newSL, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)));
                 }
              }
           }
        }
     }
  }


//+------------------------------------------------------------------+
//| Calculate lot size from risk amount                               |
//+------------------------------------------------------------------+
double CalculateLotSize(double entryPrice, double slPrice)
  {
   double slDistance = MathAbs(entryPrice - slPrice);
   if(slDistance <= 0)
      return 0;

   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double lotStep   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);

   if(tickSize <= 0 || tickValue <= 0 || lotStep <= 0)
     {
      Print("[LongEntry] ERROR: Invalid symbol properties for lot calc");
      return 0;
     }

   // Risk per lot = (SL distance / tick size) * tick value
   double riskPerLot = (slDistance / tickSize) * tickValue;
   if(riskPerLot <= 0)
      return 0;

   double lots = RiskAmount / riskPerLot;

   // Round to lot step
   lots = MathFloor(lots / lotStep) * lotStep;

   // Clamp to broker limits
   lots = MathMax(lots, minLot);
   lots = MathMin(lots, maxLot);

   return NormalizeDouble(lots, 2);
  }


//+------------------------------------------------------------------+
//| Check if there's already an open position with our magic numbers  |
//+------------------------------------------------------------------+
bool HasOpenPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol)
        {
         long magic = PositionGetInteger(POSITION_MAGIC);
         // Check both TP1 (MagicNumber) and Runner (MagicNumber+1)
         if(magic == (long)MagicNumber || magic == (long)(MagicNumber + 1))
            return true;
        }
     }
   return false;
  }


//+------------------------------------------------------------------+
//| JSON parsing helpers (no JSON library in MQL5)                    |
//+------------------------------------------------------------------+
string GetJsonString(string json, string key)
  {
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos < 0)
      return "";
   pos += StringLen(search);
   int endPos = StringFind(json, "\"", pos);
   if(endPos < 0)
      return "";
   return StringSubstr(json, pos, endPos - pos);
  }

double GetJsonDouble(string json, string key)
  {
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
      return 0;
   pos += StringLen(search);

   // Find end: comma, closing brace, or end of string
   string numStr = "";
   for(int i = pos; i < StringLen(json); i++)
     {
      ushort ch = StringGetCharacter(json, i);
      if(ch == ',' || ch == '}' || ch == ' ' || ch == '\n')
         break;
      numStr += ShortToString(ch);
     }
   return StringToDouble(numStr);
  }

bool GetJsonBool(string json, string key)
  {
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
      return false;
   pos += StringLen(search);

   // Skip whitespace
   while(pos < StringLen(json) && StringGetCharacter(json, pos) == ' ')
      pos++;

   // Check for "true"
   if(StringSubstr(json, pos, 4) == "true")
      return true;
   return false;
  }


//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("[LongEntry] Deinitialized for ", _Symbol, " (reason: ", reason, ")");
  }
