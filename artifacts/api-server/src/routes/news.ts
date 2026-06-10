import { Router, type IRouter } from "express";
import { GetMarketNewsQueryParams, GetMarketNewsResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const FCSAPI_KEY = process.env.FCSAPI_KEY || "";
const FCSAPI_BASE = "https://fcsapi.com/api-v3/forex";

interface FCSCalendarEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
  [key: string]: any;
}

/**
 * Economy Calendar endpoint – returns raw calendar data from FCSAPI
 */
router.get("/market/economy-calendar", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const url = `${FCSAPI_BASE}/economy?access_key=${FCSAPI_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`FCSAPI error: ${response.status} ${response.statusText}`);
      res.json([]);
      return;
    }
    
    const data: any = await response.json();
    
    if (!data || !data.response) {
      res.json([]);
      return;
    }

    // Return the raw economy calendar events
    const events = Array.isArray(data.response) ? data.response : [];
    res.json(events);
  } catch (err: any) {
    console.error("Economy calendar fetch error:", err?.message || err);
    res.json([]);
  }
});


/**
 * Legacy market news endpoint — now powered by FCSAPI economy calendar
 * Transforms calendar events into the existing news-item schema for backward compatibility
 */
router.get("/market/news", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetMarketNewsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit = 30 } = params.data;

  try {
    const url = `${FCSAPI_BASE}/economy?access_key=${FCSAPI_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`FCSAPI error: ${response.status} ${response.statusText}`);
      res.json(GetMarketNewsResponse.parse([]));
      return;
    }
    
    const data: any = await response.json();
    
    if (!data || !data.response) {
      res.json(GetMarketNewsResponse.parse([]));
      return;
    }

    const events: FCSCalendarEvent[] = Array.isArray(data.response) ? data.response : [];
    
    // Transform calendar events to news items
    const newsItems = events.slice(0, limit).map((event, idx) => {
      const eventDate = event.date && event.time 
        ? new Date(`${event.date}T${event.time}:00Z`)
        : new Date();

      // Build a summary from actual/forecast/previous values
      const parts: string[] = [];
      if (event.actual) parts.push(`Actual: ${event.actual}`);
      if (event.forecast) parts.push(`Forecast: ${event.forecast}`);
      if (event.previous) parts.push(`Previous: ${event.previous}`);
      const summary = parts.length > 0 ? parts.join(" | ") : "No data available yet";

      // Derive sentiment from actual vs forecast
      let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
      if (event.actual && event.forecast) {
        const actual = parseFloat(event.actual.replace(/[^0-9.-]/g, ""));
        const forecast = parseFloat(event.forecast.replace(/[^0-9.-]/g, ""));
        if (!isNaN(actual) && !isNaN(forecast)) {
          if (actual > forecast) sentiment = "bullish";
          else if (actual < forecast) sentiment = "bearish";
        }
      }

      return {
        id: `fcs-${idx}-${event.date || ""}`,
        title: `[${event.country || "GLOBAL"}] ${event.title || "Economic Event"}`,
        summary,
        url: "https://fcsapi.com",
        source: `${event.country || "Global"} Economy`,
        category: "forex" as const,
        sentiment,
        publishedAt: isNaN(eventDate.getTime()) ? new Date().toISOString() : eventDate.toISOString(),
      };
    });

    res.json(GetMarketNewsResponse.parse(newsItems));
  } catch (err: any) {
    console.error("Market news fetch error:", err?.message || err);
    res.json(GetMarketNewsResponse.parse([]));
  }
});

export default router;
