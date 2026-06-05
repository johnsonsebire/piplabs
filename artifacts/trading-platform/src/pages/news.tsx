import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Globe, TrendingUp, Minus, RefreshCw, AlertTriangle, Clock } from "lucide-react";

interface EconomyEvent {
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

function getImpactClass(impact: string): string {
  const level = (impact || "").toLowerCase();
  if (level === "high" || level === "3") return "economy-impact-high";
  if (level === "medium" || level === "2") return "economy-impact-medium";
  return "economy-impact-low";
}

function getImpactLabel(impact: string): string {
  const level = (impact || "").toLowerCase();
  if (level === "high" || level === "3") return "HIGH";
  if (level === "medium" || level === "2") return "MED";
  return "LOW";
}

function getActualSentiment(actual: string, forecast: string): "positive" | "negative" | "neutral" {
  if (!actual || !forecast) return "neutral";
  const a = parseFloat(actual.replace(/[^0-9.-]/g, ""));
  const f = parseFloat(forecast.replace(/[^0-9.-]/g, ""));
  if (isNaN(a) || isNaN(f)) return "neutral";
  if (a > f) return "positive";
  if (a < f) return "negative";
  return "neutral";
}

export default function NewsPage() {
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  const { data: events, isLoading, isError, refetch, isFetching } = useQuery<EconomyEvent[]>({
    queryKey: ["/api/market/economy-calendar"],
    queryFn: async () => {
      const res = await fetch("/api/market/economy-calendar");
      if (!res.ok) throw new Error("Failed to fetch economy calendar");
      return res.json();
    },
    refetchInterval: 60000, // refresh every 60s
  });

  // Get unique countries for filter
  const countries = useMemo(() => {
    if (!events) return [];
    const set = new Set(events.map(e => e.country).filter(Boolean));
    return Array.from(set).sort();
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter(e => {
      if (filter !== "all") {
        const level = (e.impact || "").toLowerCase();
        if (filter === "high" && level !== "high" && level !== "3") return false;
        if (filter === "medium" && level !== "medium" && level !== "2") return false;
        if (filter === "low" && level !== "low" && level !== "1" && level !== "") return false;
      }
      if (countryFilter !== "all" && e.country !== countryFilter) return false;
      return true;
    });
  }, [events, filter, countryFilter]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, EconomyEvent[]> = {};
    filteredEvents.forEach(e => {
      const key = e.date || "Unknown Date";
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return groups;
  }, [filteredEvents]);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden max-w-7xl mx-auto p-6 gap-5">
        {/* Header */}
        <div className="shrink-0 space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold font-mono uppercase tracking-tight text-foreground">Economy Calendar</h1>
              <p className="text-xs font-mono text-muted-foreground mt-1 uppercase tracking-wider">
                Live economic events & indicators • Powered by FCSAPI
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="economy-refresh-btn"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span>{isFetching ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="economy-filter-bar">
            <div className="economy-tab-group">
              <button 
                onClick={() => setFilter("all")}
                className={`session-tab-btn ${filter === "all" ? "session-tab-btn--active" : ""}`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>All Events</span>
              </button>
              <button 
                onClick={() => setFilter("high")}
                className={`session-tab-btn ${filter === "high" ? "session-tab-btn--active economy-tab-high" : ""}`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>High Impact</span>
              </button>
              <button 
                onClick={() => setFilter("medium")}
                className={`session-tab-btn ${filter === "medium" ? "session-tab-btn--active" : ""}`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Medium</span>
              </button>
              <button 
                onClick={() => setFilter("low")}
                className={`session-tab-btn ${filter === "low" ? "session-tab-btn--active" : ""}`}
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Low</span>
              </button>
            </div>

            {countries.length > 0 && (
              <div className="economy-country-filter">
                <select
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                  className="economy-country-select"
                >
                  <option value="all">All Countries</option>
                  {countries.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {events && (
              <span className="economy-event-count">
                {filteredEvents.length} / {events.length} events
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="economy-loading">
              <div className="economy-loading-dot" />
              <span>Fetching live economic data...</span>
            </div>
          ) : isError ? (
            <div className="economy-error">
              <AlertTriangle className="w-5 h-5" />
              <span>Failed to load economy calendar. Check your FCSAPI key.</span>
              <button onClick={() => refetch()} className="economy-retry-btn">Retry</button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="economy-empty">
              <Calendar className="w-8 h-8 text-muted-foreground" />
              <span>No economic events match your filters</span>
            </div>
          ) : (
            <div className="economy-events-container">
              {Object.entries(groupedEvents).map(([date, dateEvents]) => (
                <div key={date} className="economy-date-group">
                  <div className="economy-date-header">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{date}</span>
                    <span className="economy-date-count">{dateEvents.length} events</span>
                  </div>
                  
                  {/* Table Header */}
                  <div className="economy-table-header">
                    <span className="economy-col-time">Time</span>
                    <span className="economy-col-country">Country</span>
                    <span className="economy-col-impact">Impact</span>
                    <span className="economy-col-event">Event</span>
                    <span className="economy-col-actual">Actual</span>
                    <span className="economy-col-forecast">Forecast</span>
                    <span className="economy-col-previous">Previous</span>
                  </div>

                  {/* Event Rows */}
                  {dateEvents.map((event, idx) => {
                    const sentiment = getActualSentiment(event.actual, event.forecast);
                    return (
                      <div
                        key={`${event.title}-${event.time}-${idx}`}
                        className={`economy-event-row ${idx % 2 === 0 ? "economy-event-row--even" : ""}`}
                      >
                        <span className="economy-col-time">
                          <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                          {event.time || "--:--"}
                        </span>
                        <span className="economy-col-country">
                          <span className="economy-country-badge">{event.country || "—"}</span>
                        </span>
                        <span className="economy-col-impact">
                          <span className={`economy-impact-badge ${getImpactClass(event.impact)}`}>
                            {getImpactLabel(event.impact)}
                          </span>
                        </span>
                        <span className="economy-col-event" title={event.title}>
                          {event.title || "Unknown Event"}
                        </span>
                        <span className={`economy-col-actual ${
                          sentiment === "positive" ? "economy-val-positive" :
                          sentiment === "negative" ? "economy-val-negative" : ""
                        }`}>
                          {event.actual || "—"}
                        </span>
                        <span className="economy-col-forecast">
                          {event.forecast || "—"}
                        </span>
                        <span className="economy-col-previous">
                          {event.previous || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}