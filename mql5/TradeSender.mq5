//+------------------------------------------------------------------+
//| TradeSender.mq5 — Sends individual trade records to server       |
//| Attach to same charts as FixedLongEntry_Server EA                |
//| Detects closed trades and uploads open/close/SL/TP/PnL details   |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property strict

input group "==== Server Settings ===="
input string   ServerURL    = "";        // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey       = "";        // API Key for authentication

input group "==== Trade Filter ===="
input ulong    MagicNumber  = 100001;    // Magic Number (must match FixedLongEntry_Server)
input string   TradeComment = "LongEntry"; // Trade Comment filter

// Track last processed deal ticket
ulong    g_lastDealTicket = 0;
datetime g_lastCheckTime  = 0;


int OnInit()
  {
   // Restore last-sent ticket from global variable
   string gvName = "TradeSender_LastTicket_" + _Symbol;
   if(GlobalVariableCheck(gvName))
      g_lastDealTicket = (ulong)GlobalVariableGet(gvName);

   Print("[TradeSender] Initialized for ", _Symbol,
         " | Magic: ", MagicNumber,
         " | Last ticket: ", g_lastDealTicket);
   return INIT_SUCCEEDED;
  }


void OnTick()
  {
   if(StringLen(ServerURL) == 0)
      return;

   // Only check once per minute to avoid spamming
   datetime now = TimeCurrent();
   if(now - g_lastCheckTime < 60)
      return;
   g_lastCheckTime = now;

   // Scan history for closed trades
   ScanAndSendTrades();
  }


void ScanAndSendTrades()
  {
   // Look back 7 days for any unsent closed trades
   datetime fromTime = TimeCurrent() - 7 * 86400;
   datetime toTime   = TimeCurrent();

   if(!HistorySelect(fromTime, toTime))
      return;

   int totalDeals = HistoryDealsTotal();
   string tradesJson = "";
   int tradeCount = 0;

   for(int i = 0; i < totalDeals; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      // Skip already-sent deals
      if(ticket <= g_lastDealTicket) continue;

      // Only our symbol
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol) continue;

      // Only trade exits (closed positions)
      int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;

      // Only our magic number
      long dealMagic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      if(dealMagic != (long)MagicNumber) continue;

      // Get close details
      datetime closeTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      double   closePrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double   closeLots  = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double   profit     = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                          + HistoryDealGetDouble(ticket, DEAL_SWAP)
                          + HistoryDealGetDouble(ticket, DEAL_COMMISSION);

      // Find the matching entry deal via position ID
      long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      datetime openTime   = 0;
      double   openPrice  = 0;
      double   slPrice    = 0;
      double   tpPrice    = 0;
      double   lotSize    = closeLots;

      // Search for the entry deal
      if(HistorySelectByPosition(posId))
        {
         int posDeals = HistoryDealsTotal();
         for(int j = 0; j < posDeals; j++)
           {
            ulong entryTicket = HistoryDealGetTicket(j);
            if(entryTicket == 0) continue;

            int dealEntry = (int)HistoryDealGetInteger(entryTicket, DEAL_ENTRY);
            if(dealEntry == DEAL_ENTRY_IN)
              {
               openTime  = (datetime)HistoryDealGetInteger(entryTicket, DEAL_TIME);
               openPrice = HistoryDealGetDouble(entryTicket, DEAL_PRICE);
               lotSize   = HistoryDealGetDouble(entryTicket, DEAL_VOLUME);
               break;
              }
           }

         // Re-select full history for continuation of outer loop
         HistorySelect(fromTime, toTime);
        }

      // Get SL/TP from the order if available
      // Try to get from the position's order
      long orderTicket = HistoryDealGetInteger(ticket, DEAL_ORDER);
      if(orderTicket > 0 && HistoryOrderSelect(orderTicket))
        {
         slPrice = HistoryOrderGetDouble(orderTicket, ORDER_SL);
         tpPrice = HistoryOrderGetDouble(orderTicket, ORDER_TP);
        }

      // If SL/TP not on the closing order, try the opening order
      if(slPrice == 0 && tpPrice == 0 && openTime > 0)
        {
         // Search orders for this position
         if(HistorySelect(fromTime, toTime))
           {
            int totalOrders = HistoryOrdersTotal();
            for(int k = 0; k < totalOrders; k++)
              {
               ulong oTicket = HistoryOrderGetTicket(k);
               if(oTicket == 0) continue;
               if(HistoryOrderGetInteger(oTicket, ORDER_POSITION_ID) == posId)
                 {
                  double oSl = HistoryOrderGetDouble(oTicket, ORDER_SL);
                  double oTp = HistoryOrderGetDouble(oTicket, ORDER_TP);
                  if(oSl > 0) slPrice = oSl;
                  if(oTp > 0) tpPrice = oTp;
                  if(slPrice > 0 && tpPrice > 0) break;
                 }
              }
           }
        }

      // Calculate PnL percent based on account balance
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double pnlPct  = (balance > 0) ? (profit / balance * 100.0) : 0.0;
      string result  = (profit > 0) ? "win" : "loss";

      // Format timestamps as ISO 8601
      string openTimeStr  = FormatISO(openTime);
      string closeTimeStr = FormatISO(closeTime);

      // Build JSON for this trade
      if(tradeCount > 0) tradesJson += ",";
      tradesJson += "{";
      tradesJson += "\"symbol\":\"" + _Symbol + "\",";
      tradesJson += "\"open_time\":\"" + openTimeStr + "\",";
      tradesJson += "\"close_time\":\"" + closeTimeStr + "\",";
      tradesJson += "\"open_price\":" + DoubleToString(openPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      tradesJson += "\"close_price\":" + DoubleToString(closePrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      tradesJson += "\"sl_price\":" + DoubleToString(slPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      tradesJson += "\"tp_price\":" + DoubleToString(tpPrice, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      tradesJson += "\"lot_size\":" + DoubleToString(lotSize, 2) + ",";
      tradesJson += "\"pnl_amount\":" + DoubleToString(profit, 2) + ",";
      tradesJson += "\"pnl_percent\":" + DoubleToString(pnlPct, 4) + ",";
      tradesJson += "\"result\":\"" + result + "\",";
      tradesJson += "\"magic_number\":" + IntegerToString(MagicNumber);
      tradesJson += "}";
      tradeCount++;

      // Update last processed ticket
      g_lastDealTicket = ticket;
     }

   // Send if we have new trades
   if(tradeCount > 0)
      SendTrades(tradesJson, tradeCount);
  }


void SendTrades(string tradesJson, int count)
  {
   string json = "{";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"trades\":[" + tradesJson + "]";
   json += "}";

   string url = ServerURL + "/trades";
   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);  // remove null terminator

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   int httpCode = WebRequest("POST", url, headers, 10000, postData, result, resultHeaders);

   if(httpCode == 200)
     {
      Print("[TradeSender] OK — sent ", count, " trade(s) for ", _Symbol);

      // Persist last ticket
      string gvName = "TradeSender_LastTicket_" + _Symbol;
      GlobalVariableSet(gvName, (double)g_lastDealTicket);
     }
   else
     {
      string resp = CharArrayToString(result);
      Print("[TradeSender] FAILED — HTTP ", httpCode, " for ", _Symbol, ": ", resp);

      // Reset ticket so we retry next time
      string gvName = "TradeSender_LastTicket_" + _Symbol;
      if(GlobalVariableCheck(gvName))
         g_lastDealTicket = (ulong)GlobalVariableGet(gvName);
     }
  }


string FormatISO(datetime dt)
  {
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
  }


void OnDeinit(const int reason)
  {
   Print("[TradeSender] Deinitialized for ", _Symbol);
  }
