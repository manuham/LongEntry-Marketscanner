//+------------------------------------------------------------------+
//| ResultSender.mq5 — Sends weekly trade results to LongEntry server|
//| Attach to same charts as FixedLongEntry_Server EA               |
//| Trigger: Friday after market close (runs alongside DataSender)   |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property strict

input group "==== Server Settings ===="
input string   ServerURL = "";     // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";     // API Key for authentication

// Track last send
datetime g_lastSendTime = 0;


int OnInit()
  {
   string gvName = "ResultSender_LastSend_" + _Symbol;
   if(GlobalVariableCheck(gvName))
      g_lastSendTime = (datetime)GlobalVariableGet(gvName);

   Print("[ResultSender] Initialized for ", _Symbol,
         " | Last send: ", (g_lastSendTime > 0 ? TimeToString(g_lastSendTime) : "never"));
   return INIT_SUCCEEDED;
  }


void OnTick()
  {
   // Only run on Fridays
   MqlDateTime dt;
   TimeCurrent(dt);
   if(dt.day_of_week != 5)
      return;

   // Check if already sent today
   datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if(g_lastSendTime >= todayStart)
      return;

   // Run late Friday (after 15:00 server time)
   if(dt.hour < 15)
      return;

   // Calculate week start (Monday)
   datetime now = TimeCurrent();
   datetime weekStart = now - (dt.day_of_week - 1) * 86400;
   weekStart = StringToTime(TimeToString(weekStart, TIME_DATE));  // midnight

   // Count this week's trades from deal history
   int trades = 0, wins = 0, losses = 0;
   double totalPnl = 0.0;

   datetime weekEnd = weekStart + 5 * 86400;  // Friday midnight
   if(HistorySelect(weekStart, weekEnd))
     {
      int totalDeals = HistoryDealsTotal();
      for(int i = 0; i < totalDeals; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;

         // Only count deals for this symbol that are trade exits
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol) continue;
         int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT) continue;

         double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                       + HistoryDealGetDouble(ticket, DEAL_SWAP)
                       + HistoryDealGetDouble(ticket, DEAL_COMMISSION);

         trades++;
         if(profit > 0) wins++;
         else losses++;
         totalPnl += profit;
        }
     }

   // Convert P&L to percentage of account balance at week start
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double pnlPct = (balance > 0) ? (totalPnl / balance * 100.0) : 0.0;

   // Format week_start as YYYY-MM-DD
   MqlDateTime wsDt;
   TimeToStruct(weekStart, wsDt);
   string weekStartStr = StringFormat("%04d-%02d-%02d", wsDt.year, wsDt.mon, wsDt.day);

   // Build JSON payload
   string json = "{";
   json += "\"symbol\":\"" + _Symbol + "\",";
   json += "\"weekStart\":\"" + weekStartStr + "\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"trades_taken\":" + IntegerToString(trades) + ",";
   json += "\"wins\":" + IntegerToString(wins) + ",";
   json += "\"losses\":" + IntegerToString(losses) + ",";
   json += "\"total_pnl_percent\":" + DoubleToString(pnlPct, 4);
   json += "}";

   // Send to server
   string url = ServerURL + "/results";
   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);  // remove null terminator

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   int httpCode = WebRequest("POST", url, headers, 5000, postData, result, resultHeaders);

   if(httpCode == 200)
     {
      Print("[ResultSender] OK — ", _Symbol, " week ", weekStartStr,
            ": ", trades, " trades, ", wins, "W/", losses, "L, PnL ",
            DoubleToString(pnlPct, 2), "%");

      g_lastSendTime = TimeCurrent();
      string gvName = "ResultSender_LastSend_" + _Symbol;
      GlobalVariableSet(gvName, (double)g_lastSendTime);
     }
   else
     {
      string resp = CharArrayToString(result);
      Print("[ResultSender] FAILED — HTTP ", httpCode, " for ", _Symbol,
            ": ", resp);
     }
  }


void OnDeinit(const int reason)
  {
   Print("[ResultSender] Deinitialized for ", _Symbol);
  }
