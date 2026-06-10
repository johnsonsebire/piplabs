import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, LineStyle } from "lightweight-charts";
import { useDerivWs } from "@/hooks/use-deriv-ws";
import { computeIndicator, parseIndicatorConfig, type IndicatorSeries } from "@/lib/indicators";

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
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
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

  // Render oscillator data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

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
      }
      line.setData(oscillator.data as any);

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
          }
          ls?.setData(aux.data as any);
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

export function TradingChart({ symbol, indicators = [], granularitySec = 60 }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayLinesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [mainReady, setMainReady] = useState(0);

  const { candles, latestTick, isConnected } = useDerivWs(symbol, granularitySec);

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
      .sort((a, b) => a.time - b.time);

    if (cleaned.length === 0) return [];

    // Remove duplicates by time (required by lightweight-charts)
    const unique: typeof cleaned = [];
    for (const c of cleaned) {
      if (unique.length === 0 || c.time > unique[unique.length - 1].time) {
        unique.push(c);
      }
    }
    return unique;
  }, [candles]);

  const computed = useMemo<IndicatorSeries[]>(() => {
    if (validCandles.length === 0) return [];
    const out: IndicatorSeries[] = [];
    for (const ind of indicators) {
      const cfg = parseIndicatorConfig(ind.parameters, ind.code || undefined);
      if (!cfg) continue;
      const series = computeIndicator(String(ind.id), ind.name, cfg, validCandles);
      if (series) out.push(series);
    }
    return out;
  }, [indicators, validCandles]);

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
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
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


  // Render candles - Always call setData (even with empty array) to clear the chart and prevent crashes
  useEffect(() => {
    if (seriesRef.current && chartRef.current) {
      try {
        // Final validation: ensure no null values in the array before passing to chart
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
        seriesRef.current.setData(safeCandles as any);
      } catch (err) {
        console.warn('Failed to set candle data:', err);
      }
    }
  }, [validCandles, mainReady]);

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

  // Render overlay indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    try {
      const wanted = new Set<string>();
      for (const c of computed) {
        if (c.pane !== "overlay") continue;
        wanted.add(c.id);
        let line = overlayLinesRef.current.get(c.id);
        if (!line) {
          line = chart.addLineSeries({ color: c.color, lineWidth: c.thickness as any, priceLineVisible: false, lastValueVisible: false });
          overlayLinesRef.current.set(c.id, line);
        } else {
          line.applyOptions({ color: c.color, lineWidth: c.thickness as any });
        }
        line.setData(c.data as any);

        if (c.additionalSeries) {
          for (let i = 0; i < c.additionalSeries.length; i++) {
            const key = `${c.id}::aux${i}`;
            wanted.add(key);
            const aux = c.additionalSeries[i];
            let ls = overlayLinesRef.current.get(key);
            if (!ls) {
              ls = chart.addLineSeries({ color: aux.color, lineWidth: (aux.thickness ?? 1) as any, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
              overlayLinesRef.current.set(key, ls);
            }
            ls.setData(aux.data as any);
          }
        }
      }
      for (const [id, line] of overlayLinesRef.current.entries()) {
        if (!wanted.has(id)) { chart.removeSeries(line); overlayLinesRef.current.delete(id); }
      }
    } catch (err) {
      console.warn('Failed to render overlay indicators:', err);
    }
  }, [computed, mainReady]);


  return (
    <div className="position-relative w-100 h-100 d-flex flex-column overflow-hidden" style={{ position: 'relative' }}>
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
          backgroundColor: "rgba(10, 13, 17, 0.85)", 
          border: "1px solid #1a2332", 
          padding: "4px 8px", 
          display: "flex", 
          flexDirection: "row", 
          alignItems: "center", 
          flexWrap: "wrap", 
          gap: "8px" 
        }}
        className="font-mono text-[9px] uppercase tracking-wider"
      >
        <div className="d-flex align-items-center gap-1.5">
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

        {computed.filter(c => c.pane === "overlay").length > 0 && (
          <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />
        )}

        {computed.filter(c => c.pane === "overlay").map((c, idx, arr) => (
          <div key={c.id} className="d-flex align-items-center gap-1.5">
            <div style={{ height: "2px", width: "10px", background: c.color }} />
            <span style={{ fontSize: "9px", color: "#94a3b8" }}>
              {c.name}
            </span>
            {idx < arr.length - 1 && (
              <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332", marginLeft: "8px" }} />
            )}
          </div>
        ))}
      </div>
      <div ref={chartContainerRef} className="w-full flex-1 min-h-0" />
      {computed.filter(c => c.pane === "oscillator").map((osc, index) => (
        <OscillatorPanel
          key={osc.id}
          oscillator={osc}
          validCandles={validCandles}
          mainChart={chartRef.current}
          isFirst={index === 0}
        />
      ))}
    </div>
  );
}