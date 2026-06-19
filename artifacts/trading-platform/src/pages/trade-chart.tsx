import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { parseIndicatorConfig, computeIndicator } from "@/lib/indicators";
import { getSymbolDisplayName } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useListBacktests, getListBacktestsQueryKey, useListStrategies, useListIndicators } from "@workspace/api-client-react";
import { Activity, ArrowLeft, TrendingUp, TrendingDown, Clock, DollarSign, LineChart, AlertCircle } from "lucide-react";

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
  granularitySec?: number;
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

        // Remove duplicates by time (required by lightweight-charts)
        const uniqueCandles: Candle[] = [];
        for (const c of candles) {
          if (uniqueCandles.length === 0 || c.time > uniqueCandles[uniqueCandles.length - 1].time) {
            uniqueCandles.push(c);
          }
        }

        clearTimeout(timer);
        finish(() => resolve(uniqueCandles));
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


function normaliseDirection(dir: string): "CALL" | "PUT" {
  const d = dir.toUpperCase();
  if (d === "CALL" || d === "BUY") return "CALL";
  return "PUT";
}

function TradeChartRenderer({ trade, candles, strategy, userIndicators }: { trade: SimTrade; candles: Candle[]; strategy?: any; userIndicators?: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const oscRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [chartError, setChartError] = useState<string | null>(null);
  const direction = normaliseDirection(trade.direction);
  const entryPrice = trade.entry ?? 0;
  const exitPrice = trade.exit ?? 0;
  const pnl = trade.pnl ?? 0;
  const outcome = pnl >= 0 ? "win" : "loss";

  const cleanedCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    const cleaned = candles
      .filter(c => c && c.time != null && c.open != null && c.high != null && c.low != null && c.close != null)
      .map(c => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter(c => 
        Number.isFinite(c.time) && 
        Number.isFinite(c.open) && 
        Number.isFinite(c.high) && 
        Number.isFinite(c.low) && 
        Number.isFinite(c.close)
      )
      .sort((a, b) => a.time - b.time);

    const unique: typeof cleaned = [];
    for (const c of cleaned) {
      if (unique.length === 0 || c.time > unique[unique.length - 1].time) {
        unique.push(c);
      }
    }
    return unique;
  }, [candles]);

  const { newCandles, overlayKeys, oscillatorKeys, oscillatorGroups } = useMemo(() => {
    const empty = { newCandles: cleanedCandles, overlayKeys: [] as string[], oscillatorKeys: [] as string[], oscillatorGroups: [] as [string, string[]][] };
    if (!cleanedCandles.length || !strategy) return empty;

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
        const allConds = [
          ...(leg.conditions || []),
          ...(leg.marketFilters || []),
          ...(leg.triggers || []),
          ...(leg.confirmations || [])
        ];
        allConds.forEach((cond: any) => {
          const skip = ["CURRENT PRICE", "PRICE", "CLOSE", "OPEN", "HIGH", "LOW"];
          if (cond.indicatorA && !skip.includes(cond.indicatorA) && !isNaN(Number(cond.indicatorA)) === false) refs.add(cond.indicatorA.trim());
          if (cond.indicatorB && !skip.includes(cond.indicatorB) && isNaN(Number(cond.indicatorB))) refs.add(cond.indicatorB.trim());
        });
      });
    } catch (e) {}

    const detectedRefs = Array.from(refs);
    detectedRefs.forEach(ref => {
      const upper = ref.toUpperCase();
      if (upper.startsWith("STOCH_") || upper === "STOCH") { refs.add("STOCH_K"); refs.add("STOCH_D"); }
      else if (upper.startsWith("MACD") || upper === "MACD_SIGNAL") { refs.add("MACD"); refs.add("MACD_SIGNAL"); refs.add("MACD_HIST"); }
      else if (upper.startsWith("BB_") || upper === "BB") { refs.add("BB_UPPER"); refs.add("BB_LOWER"); refs.add("BB_MIDDLE"); }
    });

    const mappedCandles = cleanedCandles.map(c => ({ ...c, indicators: {} as Record<string, any> }));

    refs.forEach(ref => {
      let config = userIndMap.get(ref.trim().toLowerCase()) ?? null;
      if (!config) {
        const matchMA = ref.match(/^(SMA|EMA|WMA|TMA)\s*\(?\s*(\d+)\s*\)?$/i);
        if (matchMA) config = { type: "MA", subtype: matchMA[1].toUpperCase(), period: parseInt(matchMA[2], 10) };
        const matchRSIn = ref.match(/^RSI\s*\(?\s*(\d+)\s*\)?$/i);
        if (matchRSIn) config = { type: "RSI", period: parseInt(matchRSIn[1], 10) };
        if (ref.toUpperCase() === "RSI") config = { type: "RSI", period: 14 };
        const matchCCIn = ref.match(/^CCI\s*\(?\s*(\d+)\s*\)?$/i);
        if (matchCCIn) config = { type: "CCI", period: parseInt(matchCCIn[1], 10) };
        if (ref.toUpperCase() === "CCI") config = { type: "CCI", period: 20 };
        if (ref.toUpperCase() === "MACD" || ref.toUpperCase() === "MACD_SIGNAL" || ref.toUpperCase() === "MACD_HIST") config = { type: "MACD", fast: 12, slow: 26, signal: 9 };
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
            else if (config.type === "MACD" && upperRef === "MACD_HIST") targetData = indSeries.additionalSeries?.[0]?.data || [];
            else if (config.type === "BB") {
              if (upperRef === "BB_UPPER") targetData = indSeries.additionalSeries?.[0]?.data || [];
              else if (upperRef === "BB_LOWER") targetData = indSeries.additionalSeries?.[1]?.data || [];
            }
            if (targetData) {
              const timeIndex = new Map(mappedCandles.map((c, i) => [c.time, i]));
              for (const pt of targetData) {
                const idx = timeIndex.get(pt.time);
                if (idx !== undefined) {
                  if (upperRef === "MACD_HIST") mappedCandles[idx].indicators[ref] = { value: pt.value, color: (pt as any).color };
                  else mappedCandles[idx].indicators[ref] = pt.value;
                }
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

        const dummySeriesList: any[] = [];
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
            // Add a dummy series so the oscillator chart has the exact same time axis as the main chart
            if (keyIdx === 0) {
              const dummySeries = oscChart.addLineSeries({
                color: "transparent",
                lineWidth: 0 as any,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
              });
              dummySeriesList.push(dummySeries);
            }
          if (key.toUpperCase() === "MACD_HIST") {
            const histSeries = oscChart.addHistogramSeries({
              color: "#26a69a",
              priceFormat: { type: 'volume' },
              priceScaleId: "right",
              lastValueVisible: true,
              priceLineVisible: false,
            });
            indicatorSeriesMap.set(key, histSeries);
          } else {
            const lineSeries = oscChart.addLineSeries({
              color: oscColors[(groupIdx + keyIdx) % oscColors.length],
              lineWidth: 2, title: key, priceScaleId: "right",
              lastValueVisible: true, priceLineVisible: false,
            });
            indicatorSeriesMap.set(key, lineSeries);
          }
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

        dummySeriesList.forEach(dummy => {
          dummy.setData(newCandles.map(c => ({ time: c.time as any, value: 0 })));
        });

        indicatorSeriesMap.forEach((lineSeries, key) => {
        const data = newCandles
          .map((c: any) => {
            const val = c.indicators?.[key];
            if (val !== undefined && val !== null) {
              if (key.toUpperCase() === "MACD_HIST" && typeof val === "object") {
                return { time: c.time as any, value: val.value, color: val.color };
              }
              return { time: c.time as any, value: typeof val === "object" ? val.value : val };
            }
            return null;
          })
          .filter((d: any) => d && d.value !== undefined && d.value !== null && Number.isFinite(d.value));
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
        if (exitPrice > 0 && trade.exitAt) {
          candleSeries.createPriceLine({
            price: exitPrice,
            color: outcome === "win" ? "#10b981" : "#ef4444",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Exit: ${exitPrice.toFixed(4)}`,
          });
        }

        // Helper to find closest candle time to prevent lightweight-charts crash on non-existent timestamps
        const findClosestCandleTime = (timeSec: number, candlesList: any[]) => {
          if (candlesList.length === 0) return timeSec;
          let closest = candlesList[0].time;
          let minDiff = Math.abs(timeSec - closest);
          for (let i = 1; i < candlesList.length; i++) {
            const diff = Math.abs(timeSec - candlesList[i].time);
            if (diff < minDiff) {
              minDiff = diff;
              closest = candlesList[i].time;
            } else if (candlesList[i].time > timeSec) {
              break;
            }
          }
          return closest;
        };

        // Entry / exit markers
        const rawEntrySec = Math.floor(new Date(trade.entryAt).getTime() / 1000);
        const entrySec = findClosestCandleTime(rawEntrySec, newCandles);
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

        if (trade.exitAt) {
          const rawExitSec = Math.floor(new Date(trade.exitAt).getTime() / 1000);
          const exitSec = findClosestCandleTime(rawExitSec, newCandles);
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
      <div style={{ position: "relative", flexShrink: 0, height: "500px", width: "100%", display: "flex", flexDirection: "column" }}>
        <div 
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 0,
            opacity: 0.05,
            pointerEvents: "none",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%"
          }}
        >
          <img 
            src="/assets/brand.png" 
            alt="Brand Watermark" 
            style={{ maxWidth: "50%", maxHeight: "50%", filter: "grayscale(100%)" }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div
          ref={containerRef}
          className="w-full h-full bg-muted/5 relative"
          style={{ zIndex: 1 }}
        />
      </div>
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

  const { data: strategies } = useListStrategies({});
  const { data: userIndicators } = useListIndicators({});

  const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;
  const strategy = strategies?.find(s => s.id === backtest?.strategyId);
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
    const granularity = results?.granularitySec || pickGranularity(tradeDuration);

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
                  Trade #{trade.id} · {getSymbolDisplayName(symbol)}
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
                      Symbol "{getSymbolDisplayName(symbol)}" may not have historical data available for this period.
                    </p>
                  </div>
                </div>
              )}
              {!candleLoading && !candleError && candles.length > 0 && (
                <>
                  <TradeChartRenderer trade={trade} candles={candles} strategy={strategy} userIndicators={userIndicators} />
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
