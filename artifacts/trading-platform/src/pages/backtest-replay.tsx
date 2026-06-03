import { useEffect, useRef, useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { 
  useListBacktests, 
  getListBacktestsQueryKey,
  useListStrategies,
  useListIndicators
} from "@workspace/api-client-react";
import { computeIndicator, parseIndicatorConfig } from "@/lib/indicators";
import { 
  Play, Pause, FastForward, ArrowLeft, Activity, 
  SkipForward, Calendar, Clock, Target, Maximize2,
  ChevronLeft, ChevronRight
} from "lucide-react";

type SimTrade = {
  id: number; entryAt: string; exitAt: string; direction: string;
  type: string; duration: string; entry: number; exit: number; stake: number; pnl: number; outcome: "win" | "loss";
};

type Candle = { time: number; open: number; high: number; low: number; close: number; };

function parseResults(raw: string | null | undefined) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function timeframeShort(seconds?: number | null): string {
  if (!seconds) return "1m";
  if (seconds === 60) return "1m";
  if (seconds === 120) return "2m";
  if (seconds === 180) return "3m";
  if (seconds === 300) return "5m";
  if (seconds === 600) return "10m";
  if (seconds === 900) return "15m";
  if (seconds === 1800) return "30m";
  if (seconds === 3600) return "1h";
  if (seconds === 7200) return "2h";
  if (seconds === 14400) return "4h";
  if (seconds === 28800) return "8h";
  if (seconds === 86400) return "1d";
  return `${Math.round(seconds / 60)}m`;
}

export default function BacktestReplayPage() {
  const [, params] = useRoute("/backtest/:id/replay");
  const backtestId = params?.id ? parseInt(params.id, 10) : NaN;
  const { toast } = useToast();

  const { data: backtests, isLoading: isBacktestsLoading } = useListBacktests(
    {}, { query: { enabled: !isNaN(backtestId), queryKey: getListBacktestsQueryKey({}) } }
  );

  const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;
  const results = useMemo(() => parseResults(backtest?.results), [backtest]);
  const trades: SimTrade[] = results.trades || [];

  const { data: strategies } = useListStrategies({});
  const strategy = strategies?.find(s => s.id === backtest?.strategyId);

  const { data: userIndicators } = useListIndicators({});

  const [rawCandles, setRawCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  const detectedTimeframe = useMemo(() => {
    if (rawCandles.length < 2) return "1m";
    const diffs: Record<number, number> = {};
    for (let i = 1; i < Math.min(rawCandles.length, 100); i++) {
      const diff = rawCandles[i].time - rawCandles[i - 1].time;
      if (diff > 0) {
        diffs[diff] = (diffs[diff] || 0) + 1;
      }
    }
    let maxCount = 0;
    let commonDiff = 60;
    for (const [diffStr, count] of Object.entries(diffs)) {
      if (count > maxCount) {
        maxCount = count;
        commonDiff = Number(diffStr);
      }
    }
    return timeframeShort(commonDiff);
  }, [rawCandles]);

  const timeframeWarning = useMemo(() => {
    if (rawCandles.length < 2 || !results?.duration) return null;
    
    // Auto-detect the average difference between candles
    let totalDiff = 0;
    let count = 0;
    for (let i = 1; i < Math.min(rawCandles.length, 10); i++) {
      const d = rawCandles[i].time - rawCandles[i - 1].time;
      if (d > 0) {
        totalDiff += d;
        count++;
      }
    }
    if (count === 0) return null;
    const avgCandleSec = totalDiff / count;
    
    // Get trade duration in seconds
    let durationSec = results.duration * 60;
    const unit = String(results.durationUnit || "m").toLowerCase();
    if (unit === "s") durationSec = results.duration;
    if (unit === "h") durationSec = results.duration * 3600;
    if (unit === "d") durationSec = results.duration * 86400;
    
    if (avgCandleSec > durationSec) {
      return `The candle interval in this dataset (${timeframeShort(avgCandleSec).toUpperCase()}) is longer than the set trade duration (${results.duration}${results.durationUnit?.toUpperCase()}). Because of this, each trade will exit at the very next available candle (i.e. after 1 candle). To see multiple candles play out per trade, run your backtest on a smaller timeframe (e.g. 1M) or increase the trade duration.`;
    }
    return null;
  }, [rawCandles, results]);

  const stats = useMemo(() => {
    let winBuyCount = 0; let winBuyPnl = 0;
    let loseBuyCount = 0; let loseBuyPnl = 0;
    let winSellCount = 0; let winSellPnl = 0;
    let loseSellCount = 0; let loseSellPnl = 0;

    for (const t of trades) {
      const isWin = t.outcome === "win";
      const isCall = t.direction === "CALL";
      
      if (isCall) {
        if (isWin) { winBuyCount++; winBuyPnl += t.pnl; }
        else { loseBuyCount++; loseBuyPnl += t.pnl; }
      } else {
        if (isWin) { winSellCount++; winSellPnl += t.pnl; }
        else { loseSellCount++; loseSellPnl += t.pnl; }
      }
    }

    return {
      winBuyCount, winBuyPnl: Math.round(winBuyPnl * 100) / 100,
      loseBuyCount, loseBuyPnl: Math.round(loseBuyPnl * 100) / 100,
      winSellCount, winSellPnl: Math.round(winSellPnl * 100) / 100,
      loseSellCount, loseSellPnl: Math.round(loseSellPnl * 100) / 100,
    };
  }, [trades]);

  const { candles, indicatorRefs, indicatorStatus, overlayKeys, oscillatorKeys } = useMemo(() => {
    const empty = { candles: [] as any[], indicatorRefs: new Set<string>(), indicatorStatus: {} as Record<string, { computed: boolean; sampleValues: number[]; error?: string }>, overlayKeys: [] as string[], oscillatorKeys: [] as string[] };
    if (!rawCandles.length) return empty;

    // Deep-copy candles so we can safely write indicator values
    const newCandles = rawCandles.map(c => ({ ...c, indicators: { ...((c as any).indicators || {}) } }));

    const refs = new Set<string>();
    const status: Record<string, { computed: boolean; sampleValues: number[]; error?: string }> = {};

    // Build a name -> indicator config lookup from the user's saved indicators
    const userIndMap = new Map<string, any>();
    if (userIndicators) {
      for (const ind of userIndicators) {
        // parseIndicatorConfig reads the stored parameters JSON
        const cfg = parseIndicatorConfig(ind.parameters, ind.code);
        if (cfg) userIndMap.set(ind.name.trim().toLowerCase(), cfg);
      }
    }

    if (strategy) {
      try {
        const code = JSON.parse(strategy.code);
        // Support v2 (buy/sell legs) and v1 (conditions at root)
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
      } catch (e: any) {
        console.error("Strategy parse error", e);
      }

      // Ensure companion lines are also added for multi-line indicators
      const detectedRefs = Array.from(refs);
      detectedRefs.forEach(ref => {
        const upper = ref.toUpperCase();
        if (upper.startsWith("STOCH_") || upper === "STOCH") {
          refs.add("STOCH_K");
          refs.add("STOCH_D");
        } else if (upper.startsWith("MACD") || upper === "MACD_SIGNAL") {
          refs.add("MACD");
          refs.add("MACD_SIGNAL");
        } else if (upper.startsWith("BB_") || upper === "BB") {
          refs.add("BB_UPPER");
          refs.add("BB_LOWER");
          refs.add("BB_MIDDLE");
        }
      });

      refs.forEach(ref => {
        // Check if backend already supplied values
        const backendHas = (newCandles[0] as any).indicators?.[ref] !== undefined;
        if (backendHas) {
          status[ref] = { computed: true, sampleValues: newCandles.slice(0, 3).map((c: any) => c.indicators?.[ref]).filter((v: any) => v != null) };
          return;
        }

        // 1. Try to resolve using the user's saved indicator config (EMA3 -> {type:MA, subtype:EMA, period:3})
        let config = userIndMap.get(ref.trim().toLowerCase()) ?? null;

        // 2. Fall back to parsing as an inline shorthand (EMA(14), RSI, etc.)
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
            const indSeries = computeIndicator(ref, ref, config, newCandles as any);
            if (indSeries) {
              let targetData = indSeries.data;
              
              // Extract the correct series for multi-line indicators
              const upperRef = ref.toUpperCase();
              if (config.type === "STOCH") {
                if (upperRef === "STOCH_D") {
                  targetData = indSeries.additionalSeries?.[0]?.data || [];
                }
              } else if (config.type === "MACD") {
                if (upperRef === "MACD_SIGNAL") {
                  targetData = indSeries.additionalSeries?.[1]?.data || [];
                }
              } else if (config.type === "BB") {
                if (upperRef === "BB_UPPER") {
                  targetData = indSeries.additionalSeries?.[0]?.data || [];
                } else if (upperRef === "BB_LOWER") {
                  targetData = indSeries.additionalSeries?.[1]?.data || [];
                }
              }

              if (targetData && targetData.length > 0) {
                // Write values into newCandles by index (faster than find)
                const timeIndex = new Map(newCandles.map((c, i) => [c.time, i]));
                for (const pt of targetData) {
                  const idx = timeIndex.get(pt.time);
                  if (idx !== undefined) (newCandles[idx] as any).indicators[ref] = pt.value;
                }
                status[ref] = { computed: true, sampleValues: targetData.slice(0, 3).map(d => d.value) };
              } else {
                status[ref] = { computed: false, sampleValues: [], error: `computeIndicator returned no data for sub-series ${ref}` };
              }
            } else {
              status[ref] = { computed: false, sampleValues: [], error: "computeIndicator returned no data" };
            }
          } catch (e: any) {
            status[ref] = { computed: false, sampleValues: [], error: e.message };
          }
        } else {
          status[ref] = { computed: false, sampleValues: [], error: `Cannot parse indicator format: "${ref}"` };
        }
      });
    }

    // Classify each indicator as overlay or oscillator using the user's saved config
    const OSCILLATOR_TYPES = new Set(["RSI", "MACD", "STOCH", "CCI", "ATR"]);
    const overlayKeys: string[] = [];
    const oscillatorKeys: string[] = [];

    refs.forEach(ref => {
      const cfg = userIndMap.get(ref.trim().toLowerCase());
      let isOsc = false;
      if (cfg) {
        isOsc = OSCILLATOR_TYPES.has((cfg.type || "").toUpperCase());
      } else {
        // Fallback by name
        const upper = ref.toUpperCase();
        isOsc = upper.startsWith("RSI") || upper.startsWith("CCI") || upper.startsWith("MACD") ||
                upper.startsWith("STOCH") || upper.startsWith("ATR");
      }
      (isOsc ? oscillatorKeys : overlayKeys).push(ref);
    });

    return { candles: newCandles, indicatorRefs: refs, indicatorStatus: status, overlayKeys, oscillatorKeys };
  }, [rawCandles, strategy, userIndicators]);


  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1 = 1 candle per second (adjust base ms)
  const [currentIndex, setCurrentIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const oscChartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<any>(null);
  
  const dummySeriesRefs = useRef<any[]>([]);
  const oscRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const oscillatorGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    oscillatorKeys.forEach(key => {
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
    return Object.entries(groups);
  }, [oscillatorKeys]);

  const seekTo = (index: number) => {
    if (candles.length === 0 || !seriesRef.current) return;
    const clampedIndex = Math.max(0, Math.min(candles.length - 1, index));

    const slice = candles.slice(0, clampedIndex + 1);

    seriesRef.current.setData(slice.map(c => ({ ...c, time: c.time as any })));

    if (dummySeriesRefs.current.length > 0) {
      dummySeriesRefs.current.forEach(ds => {
        ds.setData(slice.map(c => ({ time: c.time as any, value: 0 })));
      });
    }

    if (indicatorSeriesRef.current) {
      indicatorSeriesRef.current.forEach((lineSeries: any, key: string) => {
        const data = slice
          .map(c => ({ time: c.time as any, value: c.indicators?.[key] }))
          .filter(d => d.value !== undefined && d.value !== null && Number.isFinite(d.value));
        lineSeries.setData(data as any);
      });
    }

    addMarkersForTrades(seriesRef.current, trades, clampedIndex, candles);
    setCurrentIndex(clampedIndex);
  };

  const handleSeek = (index: number) => {
    setIsPlaying(false);
    seekTo(index);
  };

  useEffect(() => {
    if (isNaN(backtestId)) return;
    setCandlesLoading(true);
    fetch(`/api/backtests/${backtestId}/candles`)
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          try {
            const parsed = JSON.parse(errText);
            throw new Error(parsed.error || "Failed to fetch candles");
          } catch (e: any) {
            if (e.message !== "Failed to fetch candles" && !e.message.startsWith("Unexpected token")) {
              throw e;
            }
            throw new Error(errText || "Failed to fetch candles");
          }
        }
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error("Invalid format");
        setRawCandles(data);
        setCandlesLoading(false);
      })
      .catch((err) => {
        setCandlesError(err.message);
        setCandlesLoading(false);
      });
  }, [backtestId]);

  // Chart initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    let cleanup = () => {};
    (async () => {
      const lib = await import("lightweight-charts");
      if (!containerRef.current) return;

      const commonLayout = {
        background: { type: lib.ColorType.Solid, color: "transparent" },
        textColor: "#888",
      };
      const commonGrid = {
        vertLines: { color: "rgba(120, 120, 120, 0.1)" },
        horzLines: { color: "rgba(120, 120, 120, 0.1)" },
      };

      // ── Main price chart ──────────────────────────────────────────────────
      const chart = lib.createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 400,
        layout: commonLayout,
        grid: commonGrid,
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: "rgba(120,120,120,0.2)" },
        rightPriceScale: { borderColor: "rgba(120,120,120,0.2)" },
      });
      chartRef.current = chart;

      const series = chart.addCandlestickSeries({
        upColor: "#10b981", downColor: "#ef4444",
        borderUpColor: "#10b981", borderDownColor: "#ef4444",
        wickUpColor: "#10b981", wickDownColor: "#ef4444",
      });
      seriesRef.current = series;

      const overlayColors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
      const indicatorSeriesMap = new Map<string, any>();

      // Add overlay indicators to main chart
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

      // ── Oscillator charts (separate panels) ───────────────────────────
      const oscChartsList: any[] = [];
      const oscColors = ["#06b6d4", "#f97316", "#a855f7", "#22c55e"];
      dummySeriesRefs.current = [];

      oscillatorGroups.forEach(([groupName, keys], groupIdx) => {
        const oscContainer = oscRefs.current[groupName];
        if (!oscContainer) return;

        const oscChart = lib.createChart(oscContainer, {
          width: oscContainer.clientWidth || 800,
          height: oscContainer.clientHeight || 120,
          layout: commonLayout,
          grid: commonGrid,
          timeScale: { 
            timeVisible: false, 
            secondsVisible: false, 
            borderColor: "rgba(120,120,120,0.2)",
            rightOffset: 0,
          },
          rightPriceScale: { borderColor: "rgba(120,120,120,0.2)", minimumWidth: 80 },
          leftPriceScale: { visible: false },
          crosshair: { mode: 1 },
        });
        oscChartsList.push(oscChart);

        keys.forEach((key, keyIdx) => {
          const lineSeries = oscChart.addLineSeries({
            color: oscColors[(groupIdx + keyIdx) % oscColors.length],
            lineWidth: 2,
            title: key,
            priceScaleId: "right",
            lastValueVisible: true,
            priceLineVisible: false,
          });
          indicatorSeriesMap.set(key, lineSeries);
        });

        // Add a hidden dummy series to align the timescale of both charts
        const dummySeries = oscChart.addLineSeries({
          color: "transparent",
          priceLineVisible: false,
          lastValueVisible: false,
        });
        dummySeriesRefs.current.push(dummySeries);

        // Sync timescales bidirectionally
        let syncingMain = false;
        let syncingOsc = false;
        chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (syncingOsc) return;
          syncingMain = true;
          if (range && oscChart) oscChart.timeScale().setVisibleLogicalRange(range);
          syncingMain = false;
        });
        oscChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (syncingMain) return;
          syncingOsc = true;
          if (range) chart.timeScale().setVisibleLogicalRange(range);
          syncingOsc = false;
        });

        // Force same right price scale width on main chart so both align
        chart.applyOptions({ rightPriceScale: { minimumWidth: 80 } });

        // Sync price scale widths after data loads (use setTimeout to let chart measure)
        setTimeout(() => {
          try {
            const mainWidth = (chart.priceScale("right") as any).width?.() ?? 80;
            oscChart.applyOptions({ rightPriceScale: { minimumWidth: mainWidth } });
            chart.applyOptions({ rightPriceScale: { minimumWidth: mainWidth } });
          } catch {}
        }, 200);
      });

      indicatorSeriesRef.current = indicatorSeriesMap;

      // ── Seed data ─────────────────────────────────────────────────────────
      const setAllData = (slice: any[]) => {
        series.setData(slice.map(c => ({ ...c, time: c.time as any })));
        if (dummySeriesRefs.current.length > 0) {
          dummySeriesRefs.current.forEach(ds => {
            ds.setData(slice.map(c => ({ time: c.time as any, value: 0 })));
          });
        }
        indicatorSeriesMap.forEach((lineSeries, key) => {
          const data = slice
            .map(c => ({ time: c.time as any, value: c.indicators?.[key] }))
            .filter(d => d.value !== undefined && d.value !== null && Number.isFinite(d.value));
          lineSeries.setData(data as any);
        });
        oscChartsList.forEach(oc => {
          try { oc.timeScale().fitContent(); } catch {}
        });
        chart.timeScale().fitContent();
      };

      const initialCount = Math.min(50, candles.length);
      setAllData(candles.slice(0, initialCount));
      addMarkersForTrades(series, trades, initialCount - 1, candles);
      setCurrentIndex(initialCount - 1);

      // ── Resize observers ──────────────────────────────────────────────────
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            if (entry.target === container) {
              chart.applyOptions({ width, height });
            } else {
              oscChartsList.forEach(oc => {
                try { oc.applyOptions({ width, height }); } catch {}
              });
            }
          }
        }
      });
      ro.observe(container);
      oscillatorGroups.forEach(([groupName]) => {
        const oscContainer = oscRefs.current[groupName];
        if (oscContainer) ro.observe(oscContainer);
      });

      cleanup = () => {
        ro.disconnect();
        try { chart.remove(); } catch {}
        oscChartsList.forEach(oc => {
          try { oc.remove(); } catch {}
        });
      };
    })();

    return () => cleanup();
  }, [candles, overlayKeys, oscillatorKeys]);


  // Replay interval
  useEffect(() => {
    if (!isPlaying || currentIndex >= candles.length - 1 || !seriesRef.current) return;

    const baseIntervalMs = 500; 
    const msPerCandle = baseIntervalMs / speed;

    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        const nextIdx = prev + 1;
        if (nextIdx >= candles.length) {
          setIsPlaying(false);
          return prev;
        }
        const candle = candles[nextIdx];
        seriesRef.current.update({ ...candle, time: candle.time as any });
        if (dummySeriesRefs.current.length > 0) {
          dummySeriesRefs.current.forEach(ds => {
            ds.update({ time: candle.time as any, value: 0 });
          });
        }
        if (indicatorSeriesRef.current && candle.indicators) {
          indicatorSeriesRef.current.forEach((lineSeries: any, key: string) => {
            const val = (candle as any).indicators?.[key];
            if (val !== undefined && val !== null && Number.isFinite(val)) {
              lineSeries.update({ time: candle.time as any, value: val });
            }
          });
        }
        addMarkersForTrades(seriesRef.current, trades, nextIdx, candles);
        return nextIdx;
      });
    }, msPerCandle);

    return () => clearInterval(interval);
  }, [isPlaying, speed, currentIndex, candles, trades]);

  function addMarkersForTrades(series: any, allTrades: SimTrade[], maxIdx: number, allCandles: Candle[]) {
    if (!allTrades || allTrades.length === 0 || maxIdx < 0) return;
    
    const maxTime = allCandles[maxIdx].time;
    const markers: any[] = [];
    
    for (const t of allTrades) {
      const entryTime = Math.floor(new Date(t.entryAt).getTime() / 1000);
      const exitTime = Math.floor(new Date(t.exitAt).getTime() / 1000);
      
      if (entryTime <= maxTime) {
        markers.push({
          time: entryTime as any,
          position: t.direction === "CALL" ? "belowBar" : "aboveBar",
          color: t.direction === "CALL" ? "#10b981" : "#ef4444",
          shape: t.direction === "CALL" ? "arrowUp" : "arrowDown",
          text: t.direction === "CALL" ? "BUY" : "SELL",
        });
      }
      if (exitTime <= maxTime) {
        markers.push({
          time: exitTime as any,
          position: t.outcome === "win" ? "aboveBar" : "belowBar",
          color: t.outcome === "win" ? "#10b981" : "#ef4444",
          shape: "circle",
          text: `EXIT (${t.outcome})`,
        });
      }
    }
    
    // Sort markers by time as required by lightweight-charts
    markers.sort((a, b) => a.time - b.time);
    
    // Deduplicate markers at exact same timestamps by offsetting slightly or skipping
    const uniqueMarkers = [];
    let lastTime = 0;
    for (const m of markers) {
      if (m.time !== lastTime) {
        uniqueMarkers.push(m);
        lastTime = m.time;
      }
    }
    
    try {
      series.setMarkers(uniqueMarkers);
    } catch {
      // Ignore marker errors
    }
  }

  const handleShowAll = () => {
    setIsPlaying(false);
    seekTo(candles.length - 1);
  };

  const handleReset = () => {
    setIsPlaying(false);
    seekTo(Math.min(50, candles.length) - 1);
  };

  if (isNaN(backtestId)) return <AppLayout><div className="p-8 text-center text-muted-foreground font-mono">Invalid Backtest ID</div></AppLayout>;

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] w-full flex flex-col bg-background">
        
        {/* Header */}
        <div className="p-4 border-b border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/backtest">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold font-mono uppercase tracking-tight text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Visual Replay: Backtest #{backtestId}
              </h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {backtest?.symbol} · Timeframe: {timeframeShort(results?.granularitySec || (candles.length > 1 ? candles[1].time - candles[0].time : 60)).toUpperCase()} · Duration: {results?.duration}{results?.durationUnit?.toUpperCase()} · {trades.length} Trades
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-muted/20 p-2 rounded-lg border border-border">
            <Button variant="outline" size="sm" onClick={handleReset} className="font-mono text-xs h-7">
              Reset
            </Button>

            <div className="flex items-center gap-1 border-l border-border pl-2">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => handleSeek(Math.max(0, currentIndex - 10))}
                disabled={currentIndex <= 0 || candles.length === 0}
                title="Rewind 10 Candles"
              >
                <FastForward className="h-3.5 w-3.5 rotate-180" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => handleSeek(Math.max(0, currentIndex - 1))}
                disabled={currentIndex <= 0 || candles.length === 0}
                title="Step Back 1 Candle"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              
              <Button 
                variant={isPlaying ? "destructive" : "default"} 
                size="sm" 
                className="font-mono text-xs h-7 font-bold min-w-[85px]"
                onClick={() => {
                  setIsPlaying(!isPlaying);
                }}
                disabled={currentIndex >= candles.length - 1 || candles.length === 0}
              >
                {isPlaying ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>

              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => handleSeek(Math.min(candles.length - 1, currentIndex + 1))}
                disabled={currentIndex >= candles.length - 1 || candles.length === 0}
                title="Step Forward 1 Candle"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => handleSeek(Math.min(candles.length - 1, currentIndex + 10))}
                disabled={currentIndex >= candles.length - 1 || candles.length === 0}
                title="Fast Forward 10 Candles"
              >
                <FastForward className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2 ml-2 px-2 border-l border-border">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Speed</span>
              <Button variant="ghost" size="sm" className={`h-6 px-2 text-xs font-mono ${speed === 1 ? 'bg-primary/20 text-primary' : ''}`} onClick={() => setSpeed(1)}>1x</Button>
              <Button variant="ghost" size="sm" className={`h-6 px-2 text-xs font-mono ${speed === 5 ? 'bg-primary/20 text-primary' : ''}`} onClick={() => setSpeed(5)}>5x</Button>
              <Button variant="ghost" size="sm" className={`h-6 px-2 text-xs font-mono ${speed === 20 ? 'bg-primary/20 text-primary' : ''}`} onClick={() => setSpeed(20)}>20x</Button>
            </div>

            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
               <Button variant="secondary" size="sm" onClick={handleShowAll} className="font-mono text-xs h-7 text-primary bg-primary/10 hover:bg-primary/20">
                 <Maximize2 className="h-3 w-3 mr-1" /> Show All
               </Button>
            </div>
          </div>
        </div>

        {/* Diagnostic Panel */}
        <div className="shrink-0 border-b border-border bg-black/40 px-4 py-2 flex flex-wrap gap-4 items-start text-[10px] font-mono">
          {timeframeWarning && (
            <div className="w-full px-3 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 flex items-center gap-2 mb-2">
              <span className="font-bold text-[10px]">⚠️ {timeframeWarning}</span>
            </div>
          )}
          {/* Strategy info */}
          <div className="flex flex-col gap-0.5 min-w-[180px]">
            <span className="text-muted-foreground uppercase tracking-widest">Strategy</span>
            {strategy ? (
              <span className="text-primary font-bold">{strategy.name ?? `Strategy #${strategy.id}`}</span>
            ) : backtest?.strategyId ? (
              <span className="text-yellow-400">ID #{backtest.strategyId} – not loaded yet</span>
            ) : (
              <span className="text-destructive">No strategy linked to this backtest</span>
            )}
          </div>

          {/* Indicator refs parsed from strategy */}
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="text-muted-foreground uppercase tracking-widest">Indicators Detected from Strategy</span>
            {candlesError ? (
              <span className="text-yellow-400">Not available (No candle data)</span>
            ) : indicatorRefs.size === 0 ? (
              <span className="text-yellow-400">None found – strategy may have no indicator conditions, or strategy not loaded</span>
            ) : (
              <div className="flex flex-wrap gap-2 mt-0.5">
                {Array.from(indicatorRefs).map(ref => {
                  const s = indicatorStatus[ref];
                  return (
                    <span
                      key={ref}
                      title={s?.error ?? (s?.computed ? `Sample values: ${s.sampleValues.join(", ")}` : "Not computed")}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        s?.computed ? "bg-primary/20 text-primary border-primary/40" : "bg-destructive/20 text-destructive border-destructive/40"
                      }`}
                    >
                      {ref} {s?.computed ? "✓" : `✗ ${s?.error ?? ""}`}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Performance Breakdown stats */}
          {trades.length > 0 && (
            <div className="flex flex-col gap-0.5 min-w-[280px] border-l border-border/20 pl-4">
              <span className="text-muted-foreground uppercase tracking-widest">Buy/Sell Setup Performance</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-0.5">
                <span className="text-[#10b981] font-bold">WIN BUY: <span className="text-white font-bold">{stats.winBuyCount} (${stats.winBuyPnl.toFixed(2)})</span></span>
                <span className="text-[#10b981] font-bold">WIN SELL: <span className="text-white font-bold">{stats.winSellCount} (${stats.winSellPnl.toFixed(2)})</span></span>
                <span className="text-[#ef4444] font-bold">LOSS BUY: <span className="text-white font-bold">{stats.loseBuyCount} (${stats.loseBuyPnl.toFixed(2)})</span></span>
                <span className="text-[#ef4444] font-bold">LOSS SELL: <span className="text-white font-bold">{stats.loseSellCount} (${stats.loseSellPnl.toFixed(2)})</span></span>
              </div>
            </div>
          )}

          {/* First-candle indicator snapshot */}
          {candles.length > 0 && Object.keys((candles[0] as any).indicators ?? {}).length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground uppercase tracking-widest">Live Values (Candle 1)</span>
              <div className="flex flex-wrap gap-2 mt-0.5">
                {Object.entries((candles[0] as any).indicators).map(([k, v]) => (
                  <span key={k} className="text-cyan-400">{k}: <span className="text-white">{String(v)}</span></span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 relative flex flex-col">
          {candlesLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 z-10">
              <Activity className="h-8 w-8 text-primary animate-spin mb-4" />
              <p className="font-mono text-xs uppercase text-muted-foreground">Loading exact backtest data...</p>
            </div>
          ) : candlesError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <div className="max-w-md p-6 bg-destructive/10 border border-destructive/20 text-center rounded-xl">
                <Target className="h-10 w-10 text-destructive mx-auto mb-3" />
                <h3 className="font-mono font-bold uppercase text-destructive mb-2">Data Unavailable</h3>
                <p className="font-mono text-xs text-destructive/80 mb-4">{candlesError}</p>
                <p className="font-mono text-[10px] text-muted-foreground">This happens if the backtest is old and data wasn't cached, or if there were 0 candles in the dataset.</p>
              </div>
            </div>
          ) : candles.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <p className="font-mono text-sm uppercase text-muted-foreground">No data available for this backtest</p>
            </div>
          ) : null}

          {/* Progress Slider */}
          {candles.length > 0 && (
            <div className="px-4 py-2.5 bg-card border-b border-border flex items-center gap-4 shrink-0 shadow-sm">
              <span className="text-[10px] font-mono text-muted-foreground uppercase min-w-[70px] font-bold tracking-wider">
                Replay Seek
              </span>
              <Slider
                min={0}
                max={candles.length - 1}
                step={1}
                value={[currentIndex]}
                onValueChange={(val) => handleSeek(val[0])}
                className="flex-1 cursor-pointer py-1"
              />
              <span className="text-[10px] font-mono text-muted-foreground min-w-[95px] text-right font-bold">
                {currentIndex + 1} / {candles.length} ({Math.round((currentIndex / Math.max(1, candles.length - 1)) * 100)}%)
              </span>
            </div>
          )}

          <div className="flex-1 w-full" ref={containerRef} />
          
          {/* Dynamic Oscillator Panels */}
          {oscillatorGroups.map(([groupName]) => (
            <div
              key={groupName}
              ref={el => { oscRefs.current[groupName] = el; }}
              className="w-full border-t border-border relative bg-card/10"
              style={{ height: "135px", flexShrink: 0 }}
            >
              <div className="absolute top-2 left-2 z-10 text-[9px] font-mono text-muted-foreground uppercase font-bold tracking-wider bg-background/70 px-1 py-0.5 rounded shadow-sm">
                {groupName} Panel
              </div>
            </div>
          ))}
          
          {/* Footer Stats */}
          {candles.length > 0 && (
            <div className="p-2 border-t border-border bg-card flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase shrink-0">
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Start: {new Date(candles[0].time * 1000).toLocaleString()}</span>
                <span className="flex items-center gap-1 text-primary"><SkipForward className="h-3 w-3" /> Current: {new Date(candles[currentIndex].time * 1000).toLocaleString()}</span>
              </div>
              <div className="flex gap-4">
                <span>Progress: {currentIndex + 1} / {candles.length} Candles</span>
                <span className="text-foreground font-bold">Trades evaluated: {trades.filter(t => new Date(t.entryAt).getTime()/1000 <= candles[currentIndex].time).length}</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
