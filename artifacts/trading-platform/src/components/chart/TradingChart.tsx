import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, LineStyle } from "lightweight-charts";
import { useDerivWs } from "@/hooks/use-deriv-ws";
import { computeIndicator, parseIndicatorConfig, type IndicatorSeries } from "@/lib/indicators";
import { ChartToolbar, DrawingTool } from "./ChartToolbar";
import { ChartDrawings, Drawing } from "./ChartDrawings";
import { TradingGuideManager } from "./TradingGuideManager";
import { TradingGuideOverlay } from "./TradingGuideOverlay";
import { useAiContext } from "@/hooks/useAiContext";
import { fetchHistoricalCandles, type DerivHistoricalCandle } from "@/lib/deriv-api";
import { MultiTimeframeTrendWidget } from "./MultiTimeframeTrendWidget";
import { IndicatorsDialog } from "./IndicatorsDialog";
import { IndicatorSettingsDialog } from "./IndicatorSettingsDialog";
import { Settings2, X } from "lucide-react";

export interface ChartIndicatorInput {
  id: string | number;
  name: string;
  code?: string | null;
  parameters?: string | null;
}

interface TradingChartProps {
  symbol: string;
  indicators?: ChartIndicatorInput[];
  granularitySec?: number;
  isActiveChart?: boolean;
}

export interface ActiveIndicator {
  instanceId: string;
  baseId: string | number;
  name: string;
  config: any;
}

function CandleCountdown({ granularitySec, candleCount }: { granularitySec: number, candleCount: number }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remainder = now % granularitySec;
      const secondsLeft = granularitySec - remainder;
      
      if (secondsLeft <= 0) {
        setTimeLeft("00:00");
        return;
      }
      
      const h = Math.floor(secondsLeft / 3600);
      const m = Math.floor((secondsLeft % 3600) / 60);
      const s = secondsLeft % 60;
      
      if (h > 0) {
        setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      } else {
        setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [granularitySec]);

  return (
    <>
      <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />
      <div className="d-flex align-items-center" style={{ gap: "6px" }}>
        <span style={{ fontSize: "9px", color: "#94a3b8" }}>DEPTH</span>
        <span style={{ fontSize: "9px", color: "#10b981", fontWeight: "bold" }}>{candleCount}</span>
      </div>
      <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />
      <div className="d-flex align-items-center" style={{ gap: "6px" }}>
        <span style={{ fontSize: "9px", color: "#94a3b8" }}>CLOSE IN</span>
        <span style={{ fontSize: "9px", color: "#3b82f6", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{timeLeft}</span>
      </div>
    </>
  );
}

// Separate oscillator panel component
interface OscillatorPanelProps {
  oscillator: IndicatorSeries;
  validCandles: any[];
  mainChart: IChartApi | null;
  isFirst: boolean;
}

function OscillatorPanel({ oscillator, validCandles, mainChart, isFirst }: OscillatorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const linesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  // Create chart instance
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#0a0f0d" }, textColor: "#888" },
      grid: { vertLines: { color: "#1a2a1a" }, horzLines: { color: "#1a2a1a" } },
      width: containerRef.current.clientWidth || 600,
      height: 120,
      timeScale: { timeVisible: !isFirst, secondsVisible: false },
      rightPriceScale: { borderColor: "#1a2a1a" },
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      linesRef.current.clear();
    };
  }, [isFirst]);

  // Sync with main chart
  useEffect(() => {
    const main = mainChart;
    const osc = chartRef.current;
    if (!main || !osc) return;

    let syncing = false;
    const onMain = (r: any) => {
      if (syncing || !r) return;
      syncing = true;
      try { osc.timeScale().setVisibleLogicalRange(r); } finally { syncing = false; }
    };
    const onOsc = (r: any) => {
      if (syncing || !r) return;
      syncing = true;
      try { main.timeScale().setVisibleLogicalRange(r); } finally { syncing = false; }
    };

    main.timeScale().subscribeVisibleLogicalRangeChange(onMain);
    osc.timeScale().subscribeVisibleLogicalRangeChange(onOsc);

    return () => {
      main.timeScale().unsubscribeVisibleLogicalRangeChange(onMain);
      osc.timeScale().unsubscribeVisibleLogicalRangeChange(onOsc);
    };
  }, [mainChart]);

  const paramsRef = useRef<string>("");
  // Render oscillator data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const paramsStr = JSON.stringify({ color: oscillator.color, thickness: oscillator.thickness, additional: oscillator.additionalSeries?.map(a => a.color) });
    const paramsChanged = paramsRef.current !== paramsStr;
    paramsRef.current = paramsStr;

    try {
      // Main line
      let line = linesRef.current.get(oscillator.id);
      if (!line) {
        line = chart.addLineSeries({ 
          color: oscillator.color, 
          lineWidth: oscillator.thickness as any, 
          priceLineVisible: false, 
          lastValueVisible: true 
        });
        linesRef.current.set(oscillator.id, line);
        line.setData(oscillator.data as any);
      } else {
        line.applyOptions({ color: oscillator.color, lineWidth: oscillator.thickness as any });
        if (paramsChanged) {
          line.setData(oscillator.data as any);
        } else if (oscillator.data.length > 0) {
          line.update(oscillator.data[oscillator.data.length - 1] as any);
        }
      }

      // Guides (horizontal lines)
      if (oscillator.guides) {
        const fullTimes = validCandles.length > 0 ? validCandles.map(cd => cd.time) : oscillator.data.map(p => p.time);
        for (let i = 0; i < oscillator.guides.length; i++) {
          const key = `${oscillator.id}::guide${i}`;
          const g = oscillator.guides[i];
          let gl = linesRef.current.get(key);
          if (!gl) {
            gl = chart.addLineSeries({ 
              color: g.color, 
              lineWidth: 1, 
              lineStyle: LineStyle.Dotted, 
              priceLineVisible: false, 
              lastValueVisible: false 
            });
            linesRef.current.set(key, gl);
          }
          if (fullTimes.length > 0) {
            gl.setData(fullTimes.map(t => ({ time: t, value: g.value })) as any);
          }
        }
      }

      // Additional series
      if (oscillator.additionalSeries) {
        for (let i = 0; i < oscillator.additionalSeries.length; i++) {
          const key = `${oscillator.id}::aux${i}`;
          const aux = oscillator.additionalSeries[i];
          let ls = linesRef.current.get(key);
          if (!ls) {
            if (aux.type === "histogram") {
              ls = chart.addHistogramSeries({
                color: aux.color || '#26a69a',
                priceFormat: { type: 'volume' },
                priceLineVisible: false,
                lastValueVisible: false,
              }) as any;
            } else {
              ls = chart.addLineSeries({ 
                color: aux.color, 
                lineWidth: (aux.thickness ?? 1) as any, 
                priceLineVisible: false, 
                lastValueVisible: false 
              }) as any;
            }
            linesRef.current.set(key, ls as any);
            ls?.setData(aux.data as any);
          } else {
            if (paramsChanged) {
              ls?.setData(aux.data as any);
            } else if (aux.data.length > 0) {
              ls?.update(aux.data[aux.data.length - 1] as any);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to render oscillator:', err);
    }
  }, [oscillator, validCandles]);

  return (
    <div style={{ borderTop: '1px solid #1a2332', position: 'relative', flexShrink: 0, height: '120px' }}>
      <div style={{ position: 'absolute', top: '4px', left: '8px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 4px', backgroundColor: 'rgba(10, 13, 17, 0.8)' }}>
        <div style={{ height: '2px', width: '12px', background: oscillator.color }} />
        <span style={{ fontSize: '9px', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', color: '#94a3b8' }}>{oscillator.name}</span>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export function TradingChart({ symbol, indicators = [], granularitySec = 60, isActiveChart = false }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayLinesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [mainReady, setMainReady] = useState(0);
  const [showGuideManager, setShowGuideManager] = useState(false);

  // Drawing state
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [drawingsMap, setDrawingsMap] = useState<Record<string, Drawing[]>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('chart_drawings_all');
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const drawings = drawingsMap[symbol] || [];

  const updateDrawings = (newDrawingsOrUpdater: React.SetStateAction<Drawing[]>) => {
    setDrawingsMap(prev => {
      const current = prev[symbol] || [];
      const updated = typeof newDrawingsOrUpdater === 'function' ? newDrawingsOrUpdater(current) : newDrawingsOrUpdater;
      const newState = { ...prev, [symbol]: updated };
      if (typeof window !== 'undefined') {
        localStorage.setItem('chart_drawings_all', JSON.stringify(newState));
      }
      return newState;
    });
  };

  // Indicators state (v2)
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('deriv_active_indicators_v2');
        if (stored) return JSON.parse(stored);
        
        // Migrate old data
        const oldStored = localStorage.getItem('deriv_active_indicators');
        if (oldStored) {
          const oldArray = JSON.parse(oldStored);
          if (Array.isArray(oldArray) && oldArray.length > 0 && typeof oldArray[0] !== 'object') {
             return oldArray.map(id => {
               // Try to find the name if it's a built-in
               let name = "Indicator";
               const builtin = ["MA","EMA","RSI","MACD","BB","STOCH","CCI","ATR","ADX"].find(b => b === id);
               if (builtin) name = builtin;
               return {
                  instanceId: id + '_' + Date.now() + Math.random(),
                  baseId: id,
                  name,
                  config: {}
               };
             });
          }
        }
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_active_indicators_v2', JSON.stringify(activeIndicators));
    }
  }, [activeIndicators]);

  const [showIndicatorsDialog, setShowIndicatorsDialog] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<ActiveIndicator | null>(null);

  const handleAddIndicator = (ind: ActiveIndicator) => {
    setActiveIndicators(prev => [...prev, ind]);
  };

  const handleRemoveIndicator = (instanceId: string) => {
    setActiveIndicators(prev => prev.filter(i => i.instanceId !== instanceId));
  };

  const handleUpdateIndicatorConfig = (instanceId: string, newConfig: any) => {
    setActiveIndicators(prev => prev.map(i => i.instanceId === instanceId ? { ...i, config: newConfig } : i));
  };

  const { candles, latestTick, isConnected, error } = useDerivWs(symbol, granularitySec);

  const setGlobalContext = useAiContext((state) => state.setGlobalContext);

  const [htfContext, setHtfContext] = useState<string>('');
  const [trendWidgetData, setTrendWidgetData] = useState<any>(null);

  useEffect(() => {
    if (!isActiveChart || !symbol) return;
    let isMounted = true;

    async function fetchHtfData() {
      try {
        const [daily, m15, m5] = await Promise.all([
          fetchHistoricalCandles(symbol, 86400, 100),
          fetchHistoricalCandles(symbol, 900, 100),
          fetchHistoricalCandles(symbol, 300, 100),
        ]);

        if (!isMounted) return;

        const formatCandles = (data: any[], title: string) => {
          if (!data || data.length === 0) return `${title}: No data`;
          const lines = data.map(c => `[T: ${new Date(c.time * 1000).toISOString().split('T')[0]} | O: ${c.open} | H: ${c.high} | L: ${c.low} | C: ${c.close}]`).join('\n');
          return `${title}:\n${lines}`;
        };

        const dailyStr = formatCandles(daily, "Daily (1D) Last 100 Candles");
        const m15Str = formatCandles(m15, "15-Minute (15M) Last 100 Candles");
        const m5Str = formatCandles(m5, "5-Minute (5M) Last 100 Candles");

        setHtfContext(`\n\n--- HIGHER TIMEFRAME CONTEXT ---\n\n${dailyStr}\n\n${m15Str}\n\n${m5Str}`);
      } catch (err) {
        console.error("Failed to fetch HTF data for context", err);
      }
    }

    fetchHtfData();

    return () => { isMounted = false; };
  }, [isActiveChart, symbol]);

  // Strict data cleaning and mathematical validation to prevent lightweight-charts from crashing
  const validCandles = useMemo(() => {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    
    const cleaned = candles
      .filter(c => {
        // First pass: ensure object and all required properties exist and are not null/undefined
        if (!c || c.time == null || c.open == null || c.high == null || c.low == null || c.close == null) {
          return false;
        }
        return true;
      })
      .map(c => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter(c => {
        // Second pass: validate numeric values
        if (!Number.isFinite(c.time) || 
            !Number.isFinite(c.open) || 
            !Number.isFinite(c.high) || 
            !Number.isFinite(c.low) || 
            !Number.isFinite(c.close)) {
          return false;
        }
        
        // Time must be positive
        if (c.time <= 0) return false;
        
        // Validate OHLC relationships (high must be highest, low must be lowest)
        if (c.high < c.low) return false;
        if (c.high < c.open || c.high < c.close) return false;
        if (c.low > c.open || c.low > c.close) return false;
        
        return true;
      })
      .sort((a, b) => a.time - b.time); // Third pass: ensure strictly chronological

    // Fourth pass: Remove duplicate timestamps keeping the latest one
    const uniqueMap = new Map();
    for (const c of cleaned) {
      uniqueMap.set(c.time, c);
    }
    
    return Array.from(uniqueMap.values());
  }, [candles]);

  const computed = useMemo<IndicatorSeries[]>(() => {
    if (validCandles.length === 0) return [];
    const out: IndicatorSeries[] = [];
    
    for (const activeInd of activeIndicators) {
      // Find the base configuration if it's a custom indicator
      const customInd = indicators.find(i => i.id === activeInd.baseId);
      
      let baseCode = customInd?.code || undefined;
      let baseParams = customInd?.parameters || undefined;
      
      // If it's a built-in, we just use its baseId as the type
      if (!customInd) {
        baseParams = JSON.stringify({ type: activeInd.baseId });
      }

      const cfg = parseIndicatorConfig(baseParams, baseCode);
      if (!cfg) continue;

      // Merge the active indicator's custom config (color, period, etc.)
      const mergedCfg = { ...cfg, ...activeInd.config };

      // Pass instanceId so LightweightCharts tracks each instance separately
      const series = computeIndicator(activeInd.instanceId, activeInd.name, mergedCfg, validCandles);
      if (series) out.push(series);
    }
    return out;
  }, [indicators, activeIndicators, validCandles]);

  useEffect(() => {
    if (!isActiveChart) return;

    const indNames = activeIndicators.map(i => i.name).join(', ') || 'None';
    
    // Get all valid candles (up to 300) to give the AI the full context of the chart
    const maxCandles = 300;
    const lastCandles = validCandles.slice(-maxCandles).map(c => `[Time: ${new Date(c.time * 1000).toISOString()} | O: ${c.open} | H: ${c.high} | L: ${c.low} | C: ${c.close}]`).join('\n');
    
    const widgetContextStr = trendWidgetData ? `
Multi-Timeframe Trend Widget Data:
- Market State: ${trendWidgetData.marketState} (${trendWidgetData.marketStrength}% Strength)
- Trading Session: ${trendWidgetData.session}
- Trend Breakdown:
${trendWidgetData.timeframes.map((tf: any) => `  * ${tf.timeframe}: ${tf.trend}`).join('\n')}
` : '';

    const contextStr = `User is on the Trading Chart page.
Active Chart Symbol: ${symbol}
Timeframe: ${granularitySec} seconds
Connection Status: ${isConnected ? 'LIVE' : 'DISCONNECTED'}
Active Indicators: ${indNames}
${widgetContextStr}
Recent Price Action (All Loaded Chart Candles, max ${maxCandles}):
${lastCandles || 'No data available'}

Current Price Quote: ${latestTick ? latestTick.quote : 'N/A'}${htfContext}`;

    setGlobalContext(contextStr);

    return () => {
      // Don't clear it immediately on unmount because another chart might become active
    };
  }, [isActiveChart, symbol, granularitySec, isConnected, activeIndicators, indicators, validCandles, latestTick, htfContext, trendWidgetData, setGlobalContext]);

  const hasOscillator = computed.some(c => c.pane === "oscillator");
  const oscillatorCount = computed.filter(c => c.pane === "oscillator").length;
  const oscillatorHeight = Math.max(140, oscillatorCount * 120); // 120px per oscillator, minimum 140px

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: "#0a0f0d" }, textColor: "#00ff88" },
      grid: { vertLines: { color: "#1a2a1a" }, horzLines: { color: "#1a2a1a" } },
      width: chartContainerRef.current.clientWidth || 600,
      height: chartContainerRef.current.clientHeight || 400,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#00ff88", downColor: "#ff0055",
      borderVisible: false,
      wickUpColor: "#00ff88", wickDownColor: "#ff0055",
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    setMainReady(v => v + 1);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const width = chartContainerRef.current.clientWidth;
        const height = chartContainerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    };
    
    const ro = new ResizeObserver(handleResize);
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlayLinesRef.current.clear();
    };
  }, []);


  const dataLoadedRef = useRef<string | null>(null);

  // Render candles - Only call setData when historical data arrives, to prevent crashes from rapid setData calls
  useEffect(() => {
    if (seriesRef.current && chartRef.current) {
      const currentConfigId = `${symbol}-${granularitySec}`;
      
      // If symbol or granularity changed, clear chart and reset ref
      if (dataLoadedRef.current !== currentConfigId) {
        seriesRef.current.setData([]);
        dataLoadedRef.current = null;
      }

      // If we have data and haven't loaded this config yet
      if (validCandles.length > 0 && dataLoadedRef.current !== currentConfigId) {
        try {
          const safeCandles = validCandles.filter(c => 
            c && 
            c.time != null && 
            c.open != null && 
            c.high != null && 
            c.low != null && 
            c.close != null &&
            Number.isFinite(c.time) &&
            Number.isFinite(c.open) &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low) &&
            Number.isFinite(c.close)
          );
          
          if (safeCandles.length > 0) {
            // Determine precision dynamically based on the recent data
            let maxDecimals = 2;
            for (let i = Math.max(0, safeCandles.length - 50); i < safeCandles.length; i++) {
              const str = safeCandles[i].close.toString();
              if (str.includes("e-")) {
                const dec = parseInt(str.split("e-")[1], 10);
                if (dec > maxDecimals) maxDecimals = dec;
              } else {
                const parts = str.split(".");
                if (parts.length > 1 && parts[1].length > maxDecimals) {
                  maxDecimals = parts[1].length;
                }
              }
            }
            // Cap at 6 decimals to avoid extremely long labels
            if (maxDecimals > 6) maxDecimals = 6;
            
            seriesRef.current.applyOptions({
              priceFormat: {
                type: 'price',
                precision: maxDecimals,
                minMove: 1 / Math.pow(10, maxDecimals),
              }
            });

            seriesRef.current.setData(safeCandles as any);
            dataLoadedRef.current = currentConfigId;
          }
        } catch (err) {
          console.warn('Failed to set candle data:', err);
        }
      }
    }
  }, [validCandles, mainReady, symbol, granularitySec]);

  // Live tick update with strict mathematical validation
  useEffect(() => {
    if (seriesRef.current && chartRef.current && latestTick && validCandles.length > 0) {
      try {
        const last = validCandles[validCandles.length - 1];
        if (!last || last.open == null || last.high == null || last.low == null || last.close == null || last.time == null) {
          return;
        }
        
        const quote = Number(latestTick.quote);
        if (!Number.isFinite(quote) || quote <= 0) {
          return;
        }
        
        const open = Number(last.open);
        const high = Math.max(Number(last.high), quote);
        const low = Math.min(Number(last.low), quote);
        const close = quote;
        
        // Ensure all values are valid numbers
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          return;
        }
        
        if (high >= low && high >= open && high >= close && low <= open && low <= close) {
          seriesRef.current.update({
            time: last.time as any,
            open,
            high,
            low,
            close,
          });
        }
      } catch (err) {
        console.warn('Failed to update tick:', err);
      }
    }
  }, [latestTick, validCandles]);

  const prevIndsRef = useRef<string>("");

  // Render overlay indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const indsStr = JSON.stringify(indicators);
    const paramsChanged = prevIndsRef.current !== indsStr;
    prevIndsRef.current = indsStr;

    try {
      const wanted = new Set<string>();
      const allMarkers: any[] = [];

      for (const c of computed) {
        if (c.markers && c.markers.length > 0) {
          allMarkers.push(...c.markers);
        }

        if (c.pane !== "overlay") continue;
        wanted.add(c.id);
        let line = overlayLinesRef.current.get(c.id);
        if (!line) {
          const isPSAR = c.id.startsWith("PSAR");
          line = chart.addLineSeries({ 
            color: c.color, 
            lineWidth: c.thickness as any, 
            lineStyle: isPSAR ? 3 : 0, // 3 is Dotted, 0 is Solid
            priceLineVisible: false, 
            lastValueVisible: false 
          });
          overlayLinesRef.current.set(c.id, line);
          line.setData(c.data as any);
        } else {
          const isPSAR = c.id.startsWith("PSAR");
          line.applyOptions({ color: c.color, lineWidth: c.thickness as any, lineStyle: isPSAR ? 3 : 0 });
          if (paramsChanged) {
            line.setData(c.data as any);
          } else if (c.data.length > 0) {
            line.update(c.data[c.data.length - 1] as any);
          }
        }

        if (c.additionalSeries) {
          for (let i = 0; i < c.additionalSeries.length; i++) {
            const key = `${c.id}::aux${i}`;
            wanted.add(key);
            const aux = c.additionalSeries[i];
            let ls = overlayLinesRef.current.get(key);
            if (!ls) {
              if (aux.type === "histogram") {
                ls = chart.addHistogramSeries({
                  color: aux.color,
                  priceFormat: { type: 'volume' },
                  priceLineVisible: false,
                  lastValueVisible: false,
                }) as any;
              } else {
                ls = chart.addLineSeries({ 
                  color: aux.color, 
                  lineWidth: (aux.thickness ?? 1) as any, 
                  lineStyle: 2, // 2 is Dashed
                  priceLineVisible: false, 
                  lastValueVisible: false 
                }) as any;
              }
              overlayLinesRef.current.set(key, ls as any);
              ls?.setData(aux.data as any);
            } else if (ls) {
              if (paramsChanged) {
                ls.setData(aux.data as any);
              } else if (aux.data.length > 0) {
                ls.update(aux.data[aux.data.length - 1] as any);
              }
            }
          }
        }
      }
      for (const [id, line] of overlayLinesRef.current.entries()) {
        if (!wanted.has(id)) { chart.removeSeries(line); overlayLinesRef.current.delete(id); }
      }

      if (seriesRef.current) {
        // Lightweight Charts requires markers to be sorted by time
        allMarkers.sort((a, b) => a.time - b.time);
        seriesRef.current.setMarkers(allMarkers);
      }
    } catch (err) {
      console.warn('Failed to render overlay indicators:', err);
    }
  }, [computed, mainReady]);


  return (
    <div className="position-relative w-100 h-100 d-flex flex-row overflow-hidden" style={{ position: 'relative' }}>
      {/* Sidebar Toolbar */}
      <ChartToolbar 
        activeTool={activeTool} 
        onToolSelect={setActiveTool} 
        onClearAll={() => updateDrawings([])} 
        onOpenIndicators={() => setShowIndicatorsDialog(true)}
        onOpenGuides={() => setShowGuideManager(true)}
      />

      <IndicatorsDialog 
        open={showIndicatorsDialog} 
        onOpenChange={setShowIndicatorsDialog}
        customIndicators={indicators}
        onAddIndicator={handleAddIndicator}
      />

      <IndicatorSettingsDialog 
        open={!!editingIndicator}
        onOpenChange={(open) => !open && setEditingIndicator(null)}
        indicator={editingIndicator}
        onSave={handleUpdateIndicatorConfig}
      />

      <TradingGuideManager open={showGuideManager} onOpenChange={setShowGuideManager} />

      {/* Main Chart Area */}
      <div className="position-relative flex-1 d-flex flex-column overflow-hidden w-100 h-100" style={{ position: 'relative' }}>
        {!isConnected && (
        <div 
          style={{ 
            position: "absolute", 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 10, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            backgroundColor: "rgba(10, 13, 17, 0.8)", 
            backdropFilter: "blur(4px)" 
          }}
        >
          <div className="text-primary font-mono text-xl animate-pulse uppercase tracking-widest">
            Connecting to Deriv...
          </div>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: "8px",
          left: "8px",
          zIndex: 10,
          display: "flex",
          gap: "8px",
          alignItems: "flex-start",
        }}
      >
        <div 
          style={{ 
            backgroundColor: "rgba(10, 13, 17, 0.85)", 
            border: "1px solid #1a2332", 
            padding: "4px 8px", 
            display: "flex", 
            flexDirection: "row", 
            alignItems: "center", 
            flexWrap: "wrap", 
            gap: "8px",
            borderRadius: "4px",
            height: "fit-content"
          }}
          className="font-mono text-[9px] uppercase tracking-wider"
        >
          <div className="d-flex align-items-center" style={{ gap: "6px" }}>
            <div 
              style={{ 
                height: "6px", 
                width: "6px", 
                borderRadius: "50%", 
                backgroundColor: isConnected ? "#10b981" : "#ef4444" 
              }} 
              className={isConnected ? "animate-pulse" : ""}
            />
            <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: "bold" }}>
              {isConnected ? "LIVE • DERIV WS" : "DISCONNECTED"}
            </span>
          </div>

          <CandleCountdown granularitySec={granularitySec || 60} candleCount={validCandles.length} />

          {computed.filter(c => c.pane === "overlay").length > 0 && (
            <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />
          )}

          {computed.filter(c => c.pane === "overlay").map((c, idx, arr) => (
            <div key={c.id} className="d-flex align-items-center" style={{ gap: "6px" }}>
              <div style={{ height: "2px", width: "10px", background: c.color }} />
              <span style={{ fontSize: "9px", color: "#94a3b8" }}>
                {c.name}
              </span>
              <div className="d-flex align-items-center gap-1 ms-1">
                <button 
                  style={{ background: 'transparent', border: 'none', padding: 0, color: '#94a3b8', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#10b981'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                  onClick={() => {
                    const ind = activeIndicators.find(i => i.instanceId === c.id);
                    if (ind) setEditingIndicator(ind);
                  }}
                  title="Settings"
                >
                  <Settings2 style={{ width: '10px', height: '10px' }} />
                </button>
                <button 
                  style={{ background: 'transparent', border: 'none', padding: 0, color: '#94a3b8', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                  onClick={() => handleRemoveIndicator(c.id)}
                  title="Remove"
                >
                  <X style={{ width: '10px', height: '10px' }} />
                </button>
              </div>
              {idx < arr.length - 1 && (
                <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332", marginLeft: "4px" }} />
              )}
            </div>
          ))}
        </div>
        <MultiTimeframeTrendWidget 
          symbol={symbol} 
          granularitySec={granularitySec || 60} 
          onTrendUpdate={setTrendWidgetData} 
        />
      </div>
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
          alignItems: "center"
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
        ref={chartContainerRef} 
        className="w-full flex-1 min-h-0" 
        style={{ 
          zIndex: 1, 
          position: 'relative',
          cursor: activeTool !== 'cursor' ? 'crosshair' : 'default'
        }} 
      >
        <ChartDrawings 
          chart={chartRef.current} 
          series={seriesRef.current} 
          activeTool={activeTool}
          drawings={drawings}
          setDrawings={updateDrawings}
          containerRef={chartContainerRef}
          validCandles={validCandles}
        />
        {error && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(10, 13, 17, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100
          }}>
            <div style={{
              padding: '16px 24px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              color: '#ef4444',
              fontFamily: 'Space Mono, monospace',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
            }}>
              <i className="bi bi-exclamation-triangle"></i>
              {error === "MarketIsClosed" ? "Market is closed" : error}
            </div>
          </div>
        )}
      </div>
      <TradingGuideOverlay />
      {computed.filter(c => c.pane === "oscillator").map((osc, index) => (
        <div key={osc.id} style={{ position: 'relative' }}>
          <OscillatorPanel
            oscillator={osc}
            validCandles={validCandles}
            mainChart={chartRef.current}
            isFirst={index === 0}
          />
          <div style={{ position: 'absolute', top: '4px', right: '8px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 4px', backgroundColor: 'rgba(10, 13, 17, 0.8)' }}>
            <button 
              style={{ background: 'transparent', border: 'none', padding: 0, color: '#94a3b8', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = '#10b981'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              onClick={() => {
                const ind = activeIndicators.find(i => i.instanceId === osc.id);
                if (ind) setEditingIndicator(ind);
              }}
              title="Settings"
            >
              <Settings2 style={{ width: '12px', height: '12px' }} />
            </button>
            <button 
              style={{ background: 'transparent', border: 'none', padding: 0, color: '#94a3b8', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              onClick={() => handleRemoveIndicator(osc.id)}
              title="Remove"
            >
              <X style={{ width: '12px', height: '12px' }} />
            </button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}