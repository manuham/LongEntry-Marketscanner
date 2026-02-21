//+------------------------------------------------------------------+
//| ScreenshotSender.mq5 — Captures D1/H4/H1/M5 chart screenshots  |
//| and uploads them to the LongEntry server for AI analysis.        |
//| Runs on ONE chart, handles all symbols via offline charts.       |
//| Trigger: Friday after 12:00 server time (same window as DataSender)
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property strict

input group "==== Server Settings ===="
input string   ServerURL   = "";     // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey      = "";     // API Key for authentication

input group "==== Screenshot Settings ===="
input int      ScreenWidth  = 1600;  // Screenshot width in pixels
input int      ScreenHeight = 900;   // Screenshot height in pixels
input int      MaxRetries   = 3;     // Max upload retries per screenshot
input int      RetryDelaySec = 30;   // Seconds between retries
input int      SymbolDelaySec = 2;   // Delay between symbols (rate limiting)

// All symbols to capture
string g_symbols[];
int    g_symbolCount = 0;

// Timeframes to capture
ENUM_TIMEFRAMES g_timeframes[] = {PERIOD_D1, PERIOD_H4, PERIOD_H1, PERIOD_M5};
string g_tfNames[] = {"D1", "H4", "H1", "M5"};

// State
bool g_uploadedToday = false;
datetime g_lastUploadDate = 0;


//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   // Build symbol list from the Market Watch
   // Alternatively, hardcode the 14 core symbols:
   string coreSymbols[] = {
      "XAUUSD", "XAGUSD",
      "US500", "US100", "US30",
      "GER40", "UK100", "FRA40", "EU50", "SPN35", "N25",
      "JP225", "HK50", "AUS200"
   };

   g_symbolCount = ArraySize(coreSymbols);
   ArrayResize(g_symbols, g_symbolCount);
   for(int i = 0; i < g_symbolCount; i++)
      g_symbols[i] = coreSymbols[i];

   // Load last upload date
   string gvName = "ScreenshotSender_LastDate";
   if(GlobalVariableCheck(gvName))
      g_lastUploadDate = (datetime)GlobalVariableGet(gvName);

   Print("[ScreenshotSender] Initialized | ", g_symbolCount, " symbols | ",
         "Last upload: ", (g_lastUploadDate > 0 ? TimeToString(g_lastUploadDate, TIME_DATE) : "never"));

   return INIT_SUCCEEDED;
  }


//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Only run on Fridays
   MqlDateTime dt;
   TimeCurrent(dt);
   if(dt.day_of_week != 5)
     {
      g_uploadedToday = false;  // Reset for next Friday
      return;
     }

   // Already uploaded today
   if(g_uploadedToday)
      return;

   // Check last upload date to avoid duplicates across restarts
   datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if(g_lastUploadDate >= todayStart)
     {
      g_uploadedToday = true;
      return;
     }

   // Only run after noon
   if(dt.hour < 12)
      return;

   // Run the screenshot capture and upload
   Print("[ScreenshotSender] Starting screenshot capture for ", g_symbolCount, " symbols");
   CaptureAndUploadAll();

   g_uploadedToday = true;
   g_lastUploadDate = TimeCurrent();
   GlobalVariableSet("ScreenshotSender_LastDate", (double)g_lastUploadDate);

   Print("[ScreenshotSender] All screenshots captured and uploaded");
  }


//+------------------------------------------------------------------+
//| Capture and upload screenshots for all symbols and timeframes     |
//+------------------------------------------------------------------+
void CaptureAndUploadAll()
  {
   // Calculate week_start (Monday of current week)
   MqlDateTime dt;
   TimeCurrent(dt);
   datetime current = TimeCurrent();
   // day_of_week: 0=Sun, 1=Mon, ..., 5=Fri
   int daysFromMonday = dt.day_of_week - 1;
   if(daysFromMonday < 0) daysFromMonday = 6;  // Sunday
   datetime monday = current - daysFromMonday * 86400;
   string weekStart = TimeToString(monday, TIME_DATE);
   StringReplace(weekStart, ".", "-");  // 2026.02.16 → 2026-02-16

   int totalScreenshots = 0;
   int successCount = 0;

   for(int s = 0; s < g_symbolCount; s++)
     {
      string symbol = g_symbols[s];

      // Check if symbol is available
      if(!SymbolSelect(symbol, true))
        {
         Print("[ScreenshotSender] Symbol not available: ", symbol, " — skipping");
         continue;
        }

      for(int t = 0; t < ArraySize(g_timeframes); t++)
        {
         totalScreenshots++;
         string tfName = g_tfNames[t];

         // Capture screenshot to a local file
         string filename = symbol + "_" + tfName + ".png";
         if(CaptureChart(symbol, g_timeframes[t], filename))
           {
            // Upload to server
            if(UploadScreenshot(symbol, tfName, weekStart, filename))
              {
               successCount++;
               Print("[ScreenshotSender] OK: ", symbol, " ", tfName);
              }
            else
              {
               Print("[ScreenshotSender] UPLOAD FAILED: ", symbol, " ", tfName);
              }
           }
         else
           {
            Print("[ScreenshotSender] CAPTURE FAILED: ", symbol, " ", tfName);
           }
        }

      // Rate limit between symbols
      if(s < g_symbolCount - 1)
         Sleep(SymbolDelaySec * 1000);
     }

   Print("[ScreenshotSender] Complete: ", successCount, "/", totalScreenshots, " screenshots uploaded");
  }


//+------------------------------------------------------------------+
//| Capture a chart screenshot for a specific symbol and timeframe    |
//+------------------------------------------------------------------+
bool CaptureChart(string symbol, ENUM_TIMEFRAMES timeframe, string filename)
  {
   // Open a new chart for this symbol/timeframe
   long chartId = ChartOpen(symbol, timeframe);
   if(chartId == 0)
     {
      Print("[ScreenshotSender] Failed to open chart: ", symbol, " ", EnumToString(timeframe));
      return false;
     }

   // Configure chart appearance for optimal AI reading
   ChartSetInteger(chartId, CHART_MODE, CHART_CANDLES);
   ChartSetInteger(chartId, CHART_SHOW_GRID, false);
   ChartSetInteger(chartId, CHART_SHOW_VOLUMES, false);
   ChartSetInteger(chartId, CHART_SHOW_ASK_LINE, false);
   ChartSetInteger(chartId, CHART_SHOW_BID_LINE, true);
   ChartSetInteger(chartId, CHART_AUTOSCROLL, true);
   ChartSetInteger(chartId, CHART_SHIFT, true);
   ChartSetInteger(chartId, CHART_SHOW_DATE_SCALE, true);
   ChartSetInteger(chartId, CHART_SHOW_PRICE_SCALE, true);

   // Set colors for clean readability
   ChartSetInteger(chartId, CHART_COLOR_BACKGROUND, clrWhite);
   ChartSetInteger(chartId, CHART_COLOR_FOREGROUND, clrBlack);
   ChartSetInteger(chartId, CHART_COLOR_CANDLE_BULL, clrGreen);
   ChartSetInteger(chartId, CHART_COLOR_CANDLE_BEAR, clrRed);
   ChartSetInteger(chartId, CHART_COLOR_CHART_UP, clrGreen);
   ChartSetInteger(chartId, CHART_COLOR_CHART_DOWN, clrRed);

   // Allow chart to render
   ChartRedraw(chartId);
   Sleep(500);

   // Take screenshot
   bool captured = ChartScreenShot(chartId, filename, ScreenWidth, ScreenHeight,
                                    ALIGN_RIGHT);

   // Close the chart
   ChartClose(chartId);

   if(!captured)
     {
      Print("[ScreenshotSender] ChartScreenShot failed for ", symbol);
      return false;
     }

   return true;
  }


//+------------------------------------------------------------------+
//| Upload a screenshot to the server                                 |
//+------------------------------------------------------------------+
bool UploadScreenshot(string symbol, string timeframe, string weekStart, string filename)
  {
   // Read the screenshot file
   int fileHandle = FileOpen(filename, FILE_READ | FILE_BIN);
   if(fileHandle == INVALID_HANDLE)
     {
      Print("[ScreenshotSender] Cannot open file: ", filename);
      return false;
     }

   int fileSize = (int)FileSize(fileHandle);
   if(fileSize <= 0)
     {
      FileClose(fileHandle);
      Print("[ScreenshotSender] Empty file: ", filename);
      return false;
     }

   uchar fileData[];
   ArrayResize(fileData, fileSize);
   FileReadArray(fileHandle, fileData, 0, fileSize);
   FileClose(fileHandle);

   // Base64 encode the image data
   string base64Data = Base64Encode(fileData);

   // Strip broker suffix from symbol
   string cleanSymbol = symbol;
   StringReplace(cleanSymbol, ".cash", "");

   // Build JSON payload
   string json = "{";
   json += "\"symbol\":\"" + cleanSymbol + "\",";
   json += "\"timeframe\":\"" + timeframe + "\",";
   json += "\"weekStart\":\"" + weekStart + "\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"image_base64\":\"" + base64Data + "\"";
   json += "}";

   // Send to server
   string url = ServerURL + "/screenshots";
   string headers = "Content-Type: application/json\r\n";

   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);

   for(int attempt = 1; attempt <= MaxRetries; attempt++)
     {
      char result[];
      string resultHeaders;
      int timeout = 30000;

      int res = WebRequest("POST", url, headers, timeout, postData, result, resultHeaders);

      if(res == 200)
        {
         string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
         // Clean up local file
         FileDelete(filename);
         return true;
        }

      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[ScreenshotSender] Upload attempt ", attempt, "/", MaxRetries,
            " failed (code ", res, "): ", errBody);

      if(attempt < MaxRetries)
         Sleep(RetryDelaySec * 1000);
     }

   // Clean up file even on failure
   FileDelete(filename);
   return false;
  }


//+------------------------------------------------------------------+
//| Base64 encoding implementation                                    |
//| MQL5 doesn't have built-in base64, so we implement it here       |
//+------------------------------------------------------------------+
string Base64Encode(const uchar &data[])
  {
   static const string b64chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

   int dataLen = ArraySize(data);
   string result = "";

   // Pre-allocate approximate result size
   int resultLen = (dataLen + 2) / 3 * 4;

   for(int i = 0; i < dataLen; i += 3)
     {
      int b0 = data[i];
      int b1 = (i + 1 < dataLen) ? data[i + 1] : 0;
      int b2 = (i + 2 < dataLen) ? data[i + 2] : 0;

      int combined = (b0 << 16) | (b1 << 8) | b2;

      result += StringSubstr(b64chars, (combined >> 18) & 0x3F, 1);
      result += StringSubstr(b64chars, (combined >> 12) & 0x3F, 1);
      result += (i + 1 < dataLen) ? StringSubstr(b64chars, (combined >> 6) & 0x3F, 1) : "=";
      result += (i + 2 < dataLen) ? StringSubstr(b64chars, combined & 0x3F, 1) : "=";
     }

   return result;
  }


//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("[ScreenshotSender] Deinitialized");
  }
