import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useListBacktests,
  getListBacktestsQueryKey,
} from "@workspace/api-client-react";
import {
  Activity, ArrowLeft, TrendingUp, TrendingDown, Clock, DollarSign, LineChart, AlertCircle,
} from "lucide-react";

type SimTrade = {
  id: number;
  entryAt: string;
  exitAt: string;
  direction: string;
  type: string;
  duration: string;
  entry: number;
  exit: number;
  stake: number;
  pnl: number;
  outcome: "win" | "loss";
};

type BacktestResults = {
  trades?: SimTrade[];
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SUPPORTED_GRANULARITIES = [60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 7200, 10800, 14400, 28800, 86400];

function pickGranularity(durationSec: number): number {
  const target = Math.max(60, Math.floor(durationSec / 20));
  let best = 60;
  for (const g of SUPPORTED_GRANULARITIES) {
    if (g <= target) best = g;
  }
  return best;
}

function fetchCandlesFromDeriv(
  symbol: string,
  startSec: number,
  endSec: number,
  granularity: number,
): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch (_e) {
      reject(new Error("Failed to create WebSocket connection"));
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Timeout fetching historical data from Deriv")));
    }, 20000);

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: Math.min(Math.max(Math.ceil((endSec - startSec) / granularity) + 20, 60), 1000),
          end: endSec,
          granularity,
          style: "candles",
        }));
      } catch (_e) {
        clearTimeout(timer);
        finish(() => reject(new Error("Failed to send request")));
      }
    };

    ws.onmessage = (event) => {
      let data: any;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.error) {
        clearTimeout(timer);
        finish(() => reject(new Error(data.error.message ?? "Deriv API error")));
        return;
      }

      if (data.msg_type === "candles" && Array.isArray(data.candles)) {
        const candles: Candle[] = data.candles
          .map((c: any) => ({
            time: Number(c.epoch),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          }))
          .filter((c: Candle) =>
            Number.isFinite(c.time) &&
            Number.isFinite(c.open) &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low) &&
            Number.isFinite(c.close)
          )
          .sort((a: Candle, b: Candle) => a.time - b.time);
        clearTimeout(timer);
        finish(() => resolve(candles));
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      finish(() => reject(new Error("WebSocket connection error")));
    };

    ws.onclose = () => {
      clearTimeout(timer);
      if (!settled) {
        finish(() => reject(new Error("Connection closed before receiving data")));
      }
    };
  });
}

function parseResults(raw: string | null | undefined): BacktestResults {
  if (!raw) return {};
  try { return JSON.parse(raw) as BacktestResults; } catch { return {}; }
}

function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return out;
  for (const p of q.split("&")) {
    const [k, v = ""] = p.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

function TradeChartRenderer({ trade, candles }: { trade: SimTrade; candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;
    setChartError(null);

    (async () => {
      let lib: typeof import("lightweight-charts");
      try {
        lib = await import("lightweight-charts");
      } catch (err) {
        if (!cancelled) setChartError(err instanceof Error ? err.message : "Failed to load chart library");
        return;
      }
      if (cancelled || !container) return;

      try {
        const { createChart, LineStyle, CrosshairMode } = lib;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;

        const chart = createChart(container, {
          layout: { background: { color: "transparent" }, textColor: "#888" },
          grid: {
            vertLines: { color: "rgba(120, 120, 120, 0.1)" },
            horzLines: { color: "rgba(120, 120, 120, 0.1)" },
          },
          width,
          height,
          timeScale: { timeVisible: true, secondsVisible: false, borderColor: "rgba(120, 120, 120, 0.3)" },
          rightPriceScale: { borderColor: "rgba(120, 120, 120, 0.3)" },
          crosshair: { mode: CrosshairMode.Normal },
        });

        const candleSeries = (chart as any).addCandlestickSeries({
          upColor: "#10b981",
          downColor: "#ef4444",
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        });

        candleSeries.setData(
          candles.map(c => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        candleSeries.createPriceLine({
          price: trade.entry,
          color: trade.direction === "CALL" ? "#10b981" : "#ef4444",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Entry: ${trade.entry.toFixed(4)}`,
        });

        candleSeries.createPriceLine({
          price: trade.exit,
          color: trade.outcome === "win" ? "#10b981" : "#ef4444",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Exit: ${trade.exit.toFixed(4)}`,
        });

        const entrySec = Math.floor(new Date(trade.entryAt).getTime() / 1000);
        const exitSec = Math.floor(new Date(trade.exitAt).getTime() / 1000);

        try {
          candleSeries.setMarkers([
            {
              time: entrySec as any,
              position: trade.direction === "CALL" ? "belowBar" : "aboveBar",
              color: trade.direction === "CALL" ? "#10b981" : "#ef4444",
              shape: trade.direction === "CALL" ? "arrowUp" : "arrowDown",
              text: `ENTRY ${trade.direction}`,
              size: 2,
            },
            {
              time: exitSec as any,
              position: trade.outcome === "win" ? "aboveBar" : "belowBar",
              color: trade.outcome === "win" ? "#10b981" : "#ef4444",
              shape: "circle",
              text: `EXIT ${trade.outcome.toUpperCase()}`,
              size: 2,
            },
          ]);
        } catch {
          /* markers are nice-to-have */
        }

        chart.timeScale().fitContent();

        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width: w, height: h } = entry.contentRect;
            if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
          }
        });
        ro.observe(container);

        cleanup = () => {
          ro.disconnect();
          try { chart.remove(); } catch { /* noop */ }
        };
      } catch (err) {
        if (!cancelled) setChartError(err instanceof Error ? err.message : "Failed to render chart");
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [trade, candles]);

  if (chartError) {
    return (
      <div className="w-full h-[500px] rounded-lg bg-muted/5 border border-border/50 flex items-center justify-center">
        <p className="text-xs font-mono text-destructive px-4 text-center">Chart render error: {chartError}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[500px] rounded-lg bg-muted/5 border border-border/50"
    />
  );
}

export default function TradeChartPage() {
  const [location] = useLocation();

  // Parse query params from window.location.search since wouter's useLocation
  // only returns the pathname.
  const query = useMemo(
    () => parseQuery(typeof window !== "undefined" ? window.location.search : ""),
    [location], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const backtestId = parseInt(query.backtestId ?? "", 10);
  const tradeId = parseInt(query.tradeId ?? "", 10);
  const hasValidParams = Number.isFinite(backtestId) && Number.isFinite(tradeId);

  // Load all backtests then pick the matching one. The list endpoint already
  // includes the parsed `results` JSON so we have all trades.
  const params = {};
  const { data: backtests, isLoading: isBacktestsLoading } = useListBacktests(
    params,
    { query: { enabled: hasValidParams, queryKey: getListBacktestsQueryKey(params) } }
  );

  const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;
  const results = parseResults(backtest?.results);
  const trade = results.trades?.find(t => t.id === tradeId);
  const symbol = backtest?.symbol ?? "";

  // Fetch candles
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleLoading, setCandleLoading] = useState(false);
  const [candleError, setCandleError] = useState<string | null>(null);

  useEffect(() => {
    if (!trade || !symbol) {
      setCandles([]);
      setCandleError(null);
      setCandleLoading(false);
      return;
    }

    const entrySec = Math.floor(new Date(trade.entryAt).getTime() / 1000);
    const exitSec = Math.floor(new Date(trade.exitAt).getTime() / 1000);
    const tradeDuration = Math.max(exitSec - entrySec, 60);
    const buffer = Math.max(tradeDuration * 2, 300);
    const startSec = entrySec - buffer;
    const endSec = exitSec + buffer;
    const granularity = pickGranularity(tradeDuration);

    let cancelled = false;
    setCandleLoading(true);
    setCandleError(null);
    setCandles([]);

    fetchCandlesFromDeriv(symbol, startSec, endSec, granularity)
      .then((data) => {
        if (cancelled) return;
        setCandles(data);
        setCandleLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setCandleError(err?.message ?? "Failed to load chart data");
        setCandleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trade?.id, trade?.entryAt, trade?.exitAt, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryDate = trade ? new Date(trade.entryAt) : null;
  const exitDate = trade ? new Date(trade.exitAt) : null;
  const durationMs = entryDate && exitDate ? exitDate.getTime() - entryDate.getTime() : 0;
  const durationStr = durationMs >= 60000
    ? `${Math.round(durationMs / 60000)} min`
    : `${Math.round(durationMs / 1000)} sec`;

  // ─── Render states ────────────────────────────────────────────────────────
  if (!hasValidParams) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Card className="p-12 border-border rounded-xl flex flex-col items-center justify-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm font-mono uppercase text-muted-foreground">Missing backtest or trade reference</p>
              <p className="text-xs font-mono text-muted-foreground/70 mt-2">
                Open a trade chart from the Backtest results page.
              </p>
              <Link href="/backtest">
                <Button variant="outline" className="mt-6 rounded-lg font-mono uppercase">
                  <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                  Back to Backtest
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isBacktestsLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Card className="p-12 border-border rounded-xl flex flex-col items-center justify-center">
              <Activity className="h-8 w-8 text-primary animate-spin mb-4" />
              <p className="text-sm font-mono uppercase text-muted-foreground">Loading trade...</p>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!backtest || !trade) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Card className="p-12 border-border rounded-xl flex flex-col items-center justify-center">
              <AlertCircle className="h-12 w-12 text-destructive/60 mb-4" />
              <p className="text-sm font-mono uppercase text-muted-foreground">
                {!backtest ? `Backtest #${backtestId} not found` : `Trade #${tradeId} not found`}
              </p>
              <Link href="/backtest">
                <Button variant="outline" className="mt-6 rounded-lg font-mono uppercase">
                  <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                  Back to Backtest
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <LineChart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">
                  Trade #{trade.id} · {symbol}
                </h1>
                <p className="text-sm text-muted-foreground font-mono mt-0.5">
                  Backtest #{backtest.id} · {entryDate?.toLocaleString()} → {exitDate?.toLocaleString()}
                </p>
              </div>
            </div>
            <Link href="/backtest">
              <Button variant="outline" className="rounded-lg font-mono uppercase text-xs h-9">
                <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                Back to Backtest
              </Button>
            </Link>
          </div>

          {/* Trade Summary */}
          <Card className="border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border">
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  {trade.direction === "CALL" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>Direction</span>
                </span>
                <span className={`text-lg font-bold font-mono leading-none ${trade.direction === "CALL" ? "text-primary" : "text-destructive"}`}>
                  {trade.direction}
                </span>
              </div>
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Entry Price</span>
                <span className="text-lg font-bold font-mono text-foreground leading-none tabular-nums">{trade.entry.toFixed(4)}</span>
              </div>
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Exit Price</span>
                <span className="text-lg font-bold font-mono text-foreground leading-none tabular-nums">{trade.exit.toFixed(4)}</span>
              </div>
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>Duration</span>
                </span>
                <span className="text-lg font-bold font-mono text-foreground leading-none">{durationStr}</span>
              </div>
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" />
                  <span>P&amp;L</span>
                </span>
                <span className={`text-lg font-bold font-mono leading-none tabular-nums ${trade.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                  {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                </span>
              </div>
            </div>
          </Card>

          {/* Chart */}
          <Card className="border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">Price Chart</h2>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                Real candles from Deriv
              </span>
            </div>
            <div className="p-5">
              {candleLoading && (
                <div className="flex flex-col items-center justify-center h-[500px]">
                  <Activity className="h-8 w-8 text-primary animate-spin mb-4" />
                  <p className="text-sm font-mono uppercase text-muted-foreground">Loading historical data...</p>
                  <p className="text-xs font-mono text-muted-foreground/60 mt-2">Fetching candles from Deriv</p>
                </div>
              )}
              {candleError && !candleLoading && (
                <div className="flex flex-col items-center justify-center h-[500px]">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 max-w-md">
                    <p className="text-sm font-mono text-destructive">Error: {candleError}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-2">
                      Symbol "{symbol}" may not have historical data available for this period.
                    </p>
                  </div>
                </div>
              )}
              {!candleLoading && !candleError && candles.length > 0 && (
                <>
                  <TradeChartRenderer trade={trade} candles={candles} />
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary"></div>
                      <span className="text-muted-foreground uppercase">Entry: {trade.entry.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${trade.outcome === "win" ? "bg-primary" : "bg-destructive"}`}></div>
                      <span className="text-muted-foreground uppercase">Exit: {trade.exit.toFixed(4)} ({trade.outcome})</span>
                    </div>
                    <div className="ml-auto text-muted-foreground/60">
                      {candles.length} candles
                    </div>
                  </div>
                </>
              )}
              {!candleLoading && !candleError && candles.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[500px]">
                  <p className="text-sm font-mono uppercase text-muted-foreground">No data available</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
