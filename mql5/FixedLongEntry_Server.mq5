//+------------------------------------------------------------------+
//| FixedLongEntry_Server.mq5 — Server-driven long entry EA         |
//| Pulls config from server periodically, enters BUY at entry time |
//| Attach to each of the 14 charts                                 |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>

input group "==== Server Integration ===="
input string   ServerURL = "";              // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";              // API Key for authentication

input group "==== Risk Settings ===="
input double   RiskAmount = 100.0;          // Risk Amount in Account Currency

input group "==== Trading Settings ===="
input ulong    MagicNumber = 100001;        // Magic Number
input string   TradeComment = "LongEntry";  // Trade Comment
input int      ConfigRefreshHours = 4;      // Config refresh interval (hours)

// Server config (refreshed periodically)
bool     g_active       = false;
int      g_entryHour    = 0;
int      g_entryMinute  = 0;
double   g_slPercent    = 0;
double   g_tpPercent    = 0;
string   g_weekStart    = "";

// State tracking
datetime g_lastConfigFetch = 0;
bool     g_tradedToday     = false;
datetime g_lastTradeDate   = 0;

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
      g_tradedToday = false;

   // Fetch config periodically (every ConfigRefreshHours hours)
   int refreshSeconds = ConfigRefreshHours * 3600;
   if(refreshSeconds <= 0) refreshSeconds = 14400;  // fallback to 4h
   if(TimeCurrent() - g_lastConfigFetch >= refreshSeconds)
      FetchConfig();

   // Check if it's entry time
   if(!g_active || g_tradedToday)
      return;

   if(dt.hour == g_entryHour && dt.min >= g_entryMinute)
      ExecuteEntry();
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

   // Parse JSON response
   g_active      = GetJsonBool(json, "active");
   g_entryHour   = (int)GetJsonDouble(json, "entryHour");
   g_entryMinute = (int)GetJsonDouble(json, "entryMinute");
   g_slPercent   = GetJsonDouble(json, "slPercent");
   g_tpPercent   = GetJsonDouble(json, "tpPercent");
   g_weekStart   = GetJsonString(json, "weekStart");

   Print("[LongEntry] Config: active=", g_active,
         " entry=", IntegerToString(g_entryHour), ":",
         StringFormat("%02d", g_entryMinute),
         " SL=", DoubleToString(g_slPercent, 2), "%",
         " TP=", DoubleToString(g_tpPercent, 2), "%",
         " week=", g_weekStart);
  }


//+------------------------------------------------------------------+
//| Execute a BUY trade with server-assigned parameters               |
//+------------------------------------------------------------------+
void ExecuteEntry()
  {
   // Check if we already have a position with this magic number
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

   // Calculate SL and TP prices
   double slPrice = ask * (1.0 - g_slPercent / 100.0);
   double tpPrice = ask * (1.0 + g_tpPercent / 100.0);

   // Normalize to tick size
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize > 0)
     {
      slPrice = MathRound(slPrice / tickSize) * tickSize;
      tpPrice = MathRound(tpPrice / tickSize) * tickSize;
     }

   // Calculate lot size based on risk
   double lots = CalculateLotSize(ask, slPrice);
   if(lots <= 0)
     {
      Print("[LongEntry] ERROR: Could not calculate valid lot size");
      return;
     }

   // Place the BUY order
   if(g_trade.Buy(lots, _Symbol, ask, slPrice, tpPrice, TradeComment))
     {
      Print("[LongEntry] BUY ", DoubleToString(lots, 2), " ", _Symbol,
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
//| Check if there's already an open position with our magic number   |
//+------------------------------------------------------------------+
bool HasOpenPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol)
        {
         if(PositionGetInteger(POSITION_MAGIC) == (long)MagicNumber)
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
