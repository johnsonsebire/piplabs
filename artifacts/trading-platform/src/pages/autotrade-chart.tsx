import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity, ArrowLeft, TrendingUp, TrendingDown, Clock, DollarSign, LineChart, AlertCircle,
} from "lucide-react";
import { useListStrategies, useListIndicators } from "@workspace/api-client-react";
import { computeIndicator, parseIndicatorConfig } from "@/lib/indicators";

type AutoTrade = {
  id: number;
  symbol: string;
  direction: string; // "call" | "put" | "buy" | "sell"
  stake: number;
  entryPrice: number | null;
  exitPrice: number | null;
  currentProfit: number | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  duration: number | null;
  durationUnit: string | null;
  mode: string;
  strategyId: number | null;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  indicators?: Record<string, number>;
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

function normaliseDirection(dir: string): "CALL" | "PUT" {
  const d = dir.toUpperCase();
  if (d === "CALL" || d === "BUY") return "CALL";
  return "PUT";
}

function TradeChartRenderer({ trade, candles, strategy, userIndicators }: { trade: AutoTrade; candles: Candle[]; strategy?: any; userIndicators?: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const oscRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [chartError, setChartError] = useState<string | null>(null);
  const direction = normaliseDirection(trade.direction);
  const entryPrice = trade.entryPrice ?? 0;
  const exitPrice = trade.exitPrice ?? 0;
  const pnl = trade.currentProfit ?? 0;
  const outcome = pnl >= 0 ? "win" : "loss";

  const { newCandles, overlayKeys, oscillatorKeys, oscillatorGroups } = useMemo(() => {
    const empty = { newCandles: candles, overlayKeys: [] as string[], oscillatorKeys: [] as string[], oscillatorGroups: [] as [string, string[]][] };
    if (!candles.length || !strategy) return empty;

    const refs = new Set<string>();
    const userIndMap = new Map<string, any>();
    if (userIndicators) {
      for (const ind of userIndicators) {
        const cfg = parseIndicatorConfig(ind.parameters, ind.code);
        if (cfg) userIndMap.set(ind.name.trim().toLowerCase(), cfg);
      }
    }

    try {
      const code = JSON.parse(strategy.code);
      const allLegs = [code.legs?.buy, code.legs?.sell, code.buy, code.sell].filter(Boolean);
      if (allLegs.length === 0 && Array.isArray(code.conditions)) allLegs.push(code);
      allLegs.forEach((leg: any) => {
        if (leg?.conditions) {
          leg.conditions.forEach((cond: any) => {
            const skip = ["PRICE", "CLOSE", "OPEN", "HIGH", "LOW"];
            if (cond.indicatorA && !skip.includes(cond.indicatorA) && !isNaN(Number(cond.indicatorA)) === false) refs.add(cond.indicatorA.trim());
            if (cond.indicatorB && !skip.includes(cond.indicatorB) && isNaN(Number(cond.indicatorB))) refs.add(cond.indicatorB.trim());
          });
        }
      });
    } catch (e) {}

    const detectedRefs = Array.from(refs);
    detectedRefs.forEach(ref => {
      const upper = ref.toUpperCase();
      if (upper.startsWith("STOCH_") || upper === "STOCH") { refs.add("STOCH_K"); refs.add("STOCH_D"); }
      else if (upper.startsWith("MACD") || upper === "MACD_SIGNAL") { refs.add("MACD"); refs.add("MACD_SIGNAL"); }
      else if (upper.startsWith("BB_") || upper === "BB") { refs.add("BB_UPPER"); refs.add("BB_LOWER"); refs.add("BB_MIDDLE"); }
    });

    const mappedCandles = candles.map(c => ({ ...c, indicators: {} as Record<string, number> }));

    refs.forEach(ref => {
      let config = userIndMap.get(ref.trim().toLowerCase()) ?? null;
      if (!config) {
        const matchMA = ref.match(/^(SMA|EMA|WMA|TMA)\((\d+)\)$/i);
        if (matchMA) config = { type: "MA", subtype: matchMA[1].toUpperCase(), period: parseInt(matchMA[2], 10) };
        const matchRSIn = ref.match(/^RSI\((\d+)\)$/i);
        if (matchRSIn) config = { type: "RSI", period: parseInt(matchRSIn[1], 10) };
        if (ref.toUpperCase() === "RSI") config = { type: "RSI", period: 14 };
        const matchCCIn = ref.match(/^CCI\((\d+)\)$/i);
        if (matchCCIn) config = { type: "CCI", period: parseInt(matchCCIn[1], 10) };
        if (ref.toUpperCase() === "CCI") config = { type: "CCI", period: 20 };
        if (ref.toUpperCase() === "MACD" || ref.toUpperCase() === "MACD_SIGNAL") config = { type: "MACD", fast: 12, slow: 26, signal: 9 };
        if (["BB_UPPER","BB_LOWER","BB_MIDDLE"].includes(ref.toUpperCase())) config = { type: "BB", period: 20 };
        if (["STOCH_K","STOCH_D"].includes(ref.toUpperCase())) config = { type: "STOCH", kPeriod: 14, dPeriod: 3 };
        if (ref.toUpperCase() === "ATR") config = { type: "ATR", period: 14 };
      }

      if (config) {
        try {
          const indSeries = computeIndicator(ref, ref, config, mappedCandles as any);
          if (indSeries) {
            let targetData = indSeries.data;
            const upperRef = ref.toUpperCase();
            if (config.type === "STOCH" && upperRef === "STOCH_D") targetData = indSeries.additionalSeries?.[0]?.data || [];
            else if (config.type === "MACD" && upperRef === "MACD_SIGNAL") targetData = indSeries.additionalSeries?.[1]?.data || [];
            else if (config.type === "BB") {
              if (upperRef === "BB_UPPER") targetData = indSeries.additionalSeries?.[0]?.data || [];
              else if (upperRef === "BB_LOWER") targetData = indSeries.additionalSeries?.[1]?.data || [];
            }
            if (targetData) {
              const timeIndex = new Map(mappedCandles.map((c, i) => [c.time, i]));
              for (const pt of targetData) {
                const idx = timeIndex.get(pt.time);
                if (idx !== undefined) mappedCandles[idx].indicators![ref] = pt.value;
              }
            }
          }
        } catch {}
      }
    });

    const OSCILLATOR_TYPES = new Set(["RSI", "MACD", "STOCH", "CCI", "ATR"]);
    const ovKeys: string[] = [];
    const osKeys: string[] = [];

    refs.forEach(ref => {
      const cfg = userIndMap.get(ref.trim().toLowerCase());
      let isOsc = false;
      if (cfg) { isOsc = OSCILLATOR_TYPES.has((cfg.type || "").toUpperCase()); }
      else {
        const upper = ref.toUpperCase();
        isOsc = upper.startsWith("RSI") || upper.startsWith("CCI") || upper.startsWith("MACD") || upper.startsWith("STOCH") || upper.startsWith("ATR");
      }
      (isOsc ? osKeys : ovKeys).push(ref);
    });

    const groups: Record<string, string[]> = {};
    osKeys.forEach(key => {
      const upper = key.toUpperCase();
      let groupName = key;
      if (upper.startsWith("STOCH")) groupName = "Stochastic";
      else if (upper.startsWith("MACD")) groupName = "MACD";
      else if (upper.startsWith("CCI")) groupName = "CCI";
      else if (upper.startsWith("RSI")) groupName = "RSI";
      else if (upper.startsWith("ATR")) groupName = "ATR";
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(key);
    });

    return { newCandles: mappedCandles, overlayKeys: ovKeys, oscillatorKeys: osKeys, oscillatorGroups: Object.entries(groups) };
  }, [candles, strategy, userIndicators]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || newCandles.length === 0) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;
    setChartError(null);

    (async () => {
      let isDisposed = false;
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
          timeScale: { timeVisible: true, secondsVisible: true, borderColor: "rgba(120, 120, 120, 0.3)" },
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

        const overlayColors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
        const indicatorSeriesMap = new Map<string, any>();

        overlayKeys.forEach((key, i) => {
          const lineSeries = chart.addLineSeries({
            color: overlayColors[i % overlayColors.length],
            lineWidth: 2,
            title: key,
            priceScaleId: "right",
            lastValueVisible: true,
            priceLineVisible: false,
          });
          indicatorSeriesMap.set(key, lineSeries);
        });

        const oscChartsList: any[] = [];
        const oscColors = ["#06b6d4", "#f97316", "#a855f7", "#22c55e"];

        oscillatorGroups.forEach(([groupName, keys], groupIdx) => {
          const oscContainer = oscRefs.current[groupName];
          if (!oscContainer) return;

          const oscChart = lib.createChart(oscContainer, {
            width: oscContainer.clientWidth || 800,
            height: oscContainer.clientHeight || 120,
            layout: { background: { color: "transparent" }, textColor: "#888" },
            grid: { vertLines: { color: "rgba(120, 120, 120, 0.1)" }, horzLines: { color: "rgba(120, 120, 120, 0.1)" } },
            timeScale: { 
              timeVisible: false, secondsVisible: false, 
              borderColor: "rgba(120,120,120,0.2)", rightOffset: 0,
            },
            rightPriceScale: { borderColor: "rgba(120,120,120,0.2)", minimumWidth: 80 },
            leftPriceScale: { visible: false },
            crosshair: { mode: 1 },
          });
          oscChartsList.push(oscChart);

          keys.forEach((key, keyIdx) => {
            const lineSeries = oscChart.addLineSeries({
              color: oscColors[(groupIdx + keyIdx) % oscColors.length],
              lineWidth: 2, title: key, priceScaleId: "right",
              lastValueVisible: true, priceLineVisible: false,
            });
            indicatorSeriesMap.set(key, lineSeries);
          });

          let syncingMain = false; let syncingOsc = false;
          chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
            if (syncingOsc || isDisposed) return; syncingMain = true;
            try { if (range && oscChart) oscChart.timeScale().setVisibleLogicalRange(range); } catch {}
            syncingMain = false;
          });
          oscChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
            if (syncingMain || isDisposed) return; syncingOsc = true;
            try { if (range) chart.timeScale().setVisibleLogicalRange(range); } catch {}
            syncingOsc = false;
          });

          setTimeout(() => {
            if (isDisposed) return;
            try {
              const mainWidth = (chart.priceScale("right") as any).width?.() ?? 80;
              oscChart.applyOptions({ rightPriceScale: { minimumWidth: mainWidth } });
              chart.applyOptions({ rightPriceScale: { minimumWidth: mainWidth } });
            } catch {}
          }, 200);
        });

        candleSeries.setData(
          newCandles.map(c => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        indicatorSeriesMap.forEach((lineSeries, key) => {
          const data = newCandles.map((c: any) => {
            const val = c.indicators?.[key];
            if (val !== undefined && val !== null && Number.isFinite(val)) {
              return { time: c.time as any, value: val };
            }
            return { time: c.time as any };
          });
          lineSeries.setData(data as any);
        });

        // Entry price line
        if (entryPrice > 0) {
          candleSeries.createPriceLine({
            price: entryPrice,
            color: direction === "CALL" ? "#10b981" : "#ef4444",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Entry: ${entryPrice.toFixed(4)}`,
          });
        }

        // Exit price line (only if trade is closed)
        if (exitPrice > 0 && trade.closedAt) {
          candleSeries.createPriceLine({
            price: exitPrice,
            color: outcome === "win" ? "#10b981" : "#ef4444",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Exit: ${exitPrice.toFixed(4)}`,
          });
        }

        // Entry / exit markers
        const entrySec = Math.floor(new Date(trade.openedAt).getTime() / 1000);
        const markers: any[] = [
          {
            time: entrySec as any,
            position: direction === "CALL" ? "belowBar" : "aboveBar",
            color: direction === "CALL" ? "#10b981" : "#ef4444",
            shape: direction === "CALL" ? "arrowUp" : "arrowDown",
            text: `ENTRY ${direction}`,
            size: 2,
          },
        ];

        if (trade.closedAt) {
          const exitSec = Math.floor(new Date(trade.closedAt).getTime() / 1000);
          markers.push({
            time: exitSec as any,
            position: outcome === "win" ? "aboveBar" : "belowBar",
            color: outcome === "win" ? "#10b981" : "#ef4444",
            shape: "circle",
            text: `EXIT ${outcome.toUpperCase()} ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
            size: 2,
          });
        }

        try {
          candleSeries.setMarkers(markers);
        } catch {
          /* markers are nice-to-have */
        }

        if (newCandles.length > 100) {
          chart.timeScale().setVisibleLogicalRange({ from: newCandles.length - 100, to: newCandles.length - 1 });
        } else {
          chart.timeScale().fitContent();
        }
        
        const chartMap = new Map<Element, any>();
        chartMap.set(container, chart);
        
        oscillatorGroups.forEach(([groupName], idx) => {
          const oscContainer = oscRefs.current[groupName];
          if (oscContainer && oscChartsList[idx]) {
            chartMap.set(oscContainer, oscChartsList[idx]);
          }
        });

        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width: w, height: h } = entry.contentRect;
            const targetChart = chartMap.get(entry.target);
            if (targetChart && w > 0 && h > 0) {
               try { targetChart.applyOptions({ width: w, height: h }); } catch {}
            }
          }
        });
        ro.observe(container);
        oscillatorGroups.forEach(([groupName]) => {
          const oscContainer = oscRefs.current[groupName];
          if (oscContainer) ro.observe(oscContainer);
        });

        cleanup = () => {
          isDisposed = true;
          ro.disconnect();
          try { chart.remove(); } catch { /* noop */ }
          oscChartsList.forEach(oc => { try { oc.remove(); } catch {} });
        };
      } catch (err) {
        if (!cancelled) setChartError(err instanceof Error ? err.message : "Failed to render chart");
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [trade.id, newCandles.length > 0 ? newCandles[0].time : 0, overlayKeys.join(","), oscillatorKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (chartError) {
    return (
      <div className="w-full h-[500px] rounded-lg bg-muted/5 border border-border/50 flex items-center justify-center">
        <p className="text-xs font-mono text-destructive px-4 text-center">Chart render error: {chartError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full border border-border/50 rounded-lg overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-[500px] bg-muted/5 shrink-0"
      />
      {oscillatorGroups.map(([groupName]) => (
        <div 
          key={groupName}
          className="h-[120px] shrink-0 border-t border-border/50 relative bg-background/50 w-full"
          ref={el => { oscRefs.current[groupName] = el; }}
        />
      ))}
    </div>
  );
}

export default function AutoTradeChartPage() {
  const [location] = useLocation();

  const query = useMemo(
    () => parseQuery(typeof window !== "undefined" ? window.location.search : ""),
    [location], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const tradeId = parseInt(query.tradeId ?? "", 10);
  const hasValidParams = Number.isFinite(tradeId) && tradeId > 0;

  // Fetch the trade from the API
  const [trade, setTrade] = useState<AutoTrade | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const { data: strategies } = useListStrategies({});
  const { data: userIndicators } = useListIndicators({});
  const strategy = strategies?.find(s => s.id === trade?.strategyId);

  useEffect(() => {
    if (!hasValidParams) return;
    setTradeLoading(true);
    setTradeError(null);
    setTrade(null);
    fetch(`/api/trades/${tradeId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Trade not found (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setTrade(data);
        setTradeLoading(false);
      })
      .catch((err) => {
        setTradeError(err?.message ?? "Failed to load trade");
        setTradeLoading(false);
      });
  }, [tradeId, hasValidParams]);

  // Fetch candles once trade is loaded
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleLoading, setCandleLoading] = useState(false);
  const [candleError, setCandleError] = useState<string | null>(null);

  useEffect(() => {
    if (!trade || !trade.symbol || !trade.openedAt) {
      setCandles([]);
      return;
    }

    const entrySec = Math.floor(new Date(trade.openedAt).getTime() / 1000);
    const exitSec = trade.closedAt
      ? Math.floor(new Date(trade.closedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    const tradeDuration = Math.max(exitSec - entrySec, 60);
    const buffer = Math.max(tradeDuration * 2, 300);
    const startSec = entrySec - buffer;
    const endSec = exitSec + buffer;
    
    // Auto-trader always uses 1-minute (60) granularity internally for evaluation
    const granularity = 60;

    let cancelled = false;
    setCandleLoading(true);
    setCandleError(null);
    setCandles([]);

    fetchCandlesFromDeriv(trade.symbol, startSec, endSec, granularity)
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

    return () => { cancelled = true; };
  }, [trade?.id, trade?.openedAt, trade?.closedAt, trade?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const direction = trade ? normaliseDirection(trade.direction) : "CALL";
  const pnl = trade?.currentProfit ?? 0;
  const outcome = pnl >= 0 ? "win" : "loss";
  const openedDate = trade ? new Date(trade.openedAt) : null;
  const closedDate = trade?.closedAt ? new Date(trade.closedAt) : null;
  const durationMs = openedDate && closedDate ? closedDate.getTime() - openedDate.getTime() : null;
  const durationStr = durationMs != null
    ? durationMs >= 60000
      ? `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`
      : `${Math.round(durationMs / 1000)}s`
    : trade?.duration
      ? `${trade.duration}${trade.durationUnit ?? ""}`
      : "—";

  // ─── Render states ────────────────────────────────────────────────────────
  if (!hasValidParams) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Card className="p-12 border-border rounded-xl flex flex-col items-center justify-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm font-mono uppercase text-muted-foreground">Missing trade reference</p>
              <p className="text-xs font-mono text-muted-foreground/70 mt-2">
                Open a chart from the Auto Trading sessions page.
              </p>
              <Link href="/autotrade">
                <Button variant="outline" className="mt-6 rounded-lg font-mono uppercase">
                  <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                  Back to Auto Trade
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (tradeLoading) {
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

  if (tradeError || !trade) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Card className="p-12 border-border rounded-xl flex flex-col items-center justify-center">
              <AlertCircle className="h-12 w-12 text-destructive/60 mb-4" />
              <p className="text-sm font-mono uppercase text-muted-foreground">
                {tradeError ?? `Trade #${tradeId} not found`}
              </p>
              <Link href="/autotrade">
                <Button variant="outline" className="mt-6 rounded-lg font-mono uppercase">
                  <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                  Back to Auto Trade
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 mt-4">

          {/* Page Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <LineChart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">
                  Trade #{trade.id} · {trade.symbol}
                </h1>
                <p className="text-sm text-muted-foreground font-mono mt-0.5">
                  Auto Trade ·{" "}
                  {openedDate?.toLocaleString()}
                  {closedDate ? ` → ${closedDate.toLocaleString()}` : " (open)"}
                </p>
              </div>
            </div>
            <Link href="/autotrade">
              <Button variant="outline" className="rounded-lg font-mono uppercase text-xs h-9">
                <ArrowLeft className="h-3.5 w-3.5 mr-2" />
                Back to Auto Trade
              </Button>
            </Link>
          </div>

          {/* Trade Summary */}
          <Card className="border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border">
              {/* Direction */}
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  {direction === "CALL" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>Direction</span>
                </span>
                <span className={`text-lg font-bold font-mono leading-none ${direction === "CALL" ? "text-primary" : "text-destructive"}`}>
                  {direction}
                </span>
              </div>
              {/* Entry */}
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Entry Price</span>
                <span className="text-lg font-bold font-mono text-foreground leading-none tabular-nums">
                  {trade.entryPrice != null ? trade.entryPrice.toFixed(4) : "—"}
                </span>
              </div>
              {/* Exit */}
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Exit Price</span>
                <span className="text-lg font-bold font-mono text-foreground leading-none tabular-nums">
                  {trade.exitPrice != null ? trade.exitPrice.toFixed(4) : "—"}
                </span>
              </div>
              {/* Stake */}
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" />
                  <span>Stake</span>
                </span>
                <span className="text-lg font-bold font-mono text-foreground leading-none tabular-nums">
                  ${trade.stake.toFixed(2)}
                </span>
              </div>
              {/* Duration */}
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>Duration</span>
                </span>
                <span className="text-lg font-bold font-mono text-foreground leading-none">{durationStr}</span>
              </div>
              {/* P&L */}
              <div className="px-5 py-4 bg-card flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" />
                  <span>P&amp;L</span>
                </span>
                <span className={`text-lg font-bold font-mono leading-none tabular-nums ${pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  {" "}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${outcome === "win" ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}>
                    {outcome.toUpperCase()}
                  </span>
                </span>
              </div>
            </div>
          </Card>

          {/* Status badge for open trades */}
          {trade.status === "open" && (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg w-fit">
              <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span className="text-xs font-mono uppercase text-primary font-bold">Live Trade — Chart shows data up to now</span>
            </div>
          )}

          {/* Chart */}
          <Card className="border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">Price Chart — {trade.symbol}</h2>
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
                      Symbol "{trade.symbol}" may not have historical data available for this period.
                    </p>
                  </div>
                </div>
              )}
              {!candleLoading && !candleError && candles.length > 0 && (
                <>
                  <TradeChartRenderer trade={trade} candles={candles} strategy={strategy} userIndicators={userIndicators} />
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-mono">
                    {trade.entryPrice != null && (
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${direction === "CALL" ? "bg-primary" : "bg-destructive"}`} />
                        <span className="text-muted-foreground uppercase">Entry: {trade.entryPrice.toFixed(4)}</span>
                      </div>
                    )}
                    {trade.closedAt && trade.exitPrice != null && (
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${outcome === "win" ? "bg-primary" : "bg-destructive"}`} />
                        <span className="text-muted-foreground uppercase">Exit: {trade.exitPrice.toFixed(4)} ({outcome})</span>
                      </div>
                    )}
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
