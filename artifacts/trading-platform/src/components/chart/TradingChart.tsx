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

export function TradingChart({ symbol, indicators = [], granularitySec = 60 }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const oscContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayLinesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const oscLinesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [mainReady, setMainReady] = useState(0);
  const [oscReady, setOscReady] = useState(0);

  const { candles, latestTick, isConnected } = useDerivWs(symbol, granularitySec);

  const computed = useMemo<IndicatorSeries[]>(() => {
    if (candles.length === 0) return [];
    const out: IndicatorSeries[] = [];
    for (const ind of indicators) {
      const cfg = parseIndicatorConfig(ind.parameters, ind.code || undefined);
      if (!cfg) continue;
      const series = computeIndicator(String(ind.id), ind.name, cfg, candles);
      if (series) out.push(series);
    }
    return out;
  }, [indicators, candles]);

  const hasOscillator = computed.some(c => c.pane === "oscillator");

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: "#0a0f0d" }, textColor: "#00ff88" },
      grid: { vertLines: { color: "#1a2a1a" }, horzLines: { color: "#1a2a1a" } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
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
      if (chartContainerRef.current) {
        chart.applyOptions({ 
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

  useEffect(() => {
    if (!hasOscillator) {
      if (oscChartRef.current) {
        oscChartRef.current.remove();
        oscChartRef.current = null;
        oscLinesRef.current.clear();
      }
      return;
    }
    if (!oscContainerRef.current) return;
    if (oscChartRef.current) return;

    const chart = createChart(oscContainerRef.current, {
      layout: { background: { color: "#0a0f0d" }, textColor: "#888" },
      grid: { vertLines: { color: "#1a2a1a" }, horzLines: { color: "#1a2a1a" } },
      width: oscContainerRef.current.clientWidth,
      height: oscContainerRef.current.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#1a2a1a" },
    });
    oscChartRef.current = chart;
    setOscReady(v => v + 1);

    const handleResize = () => {
      if (oscContainerRef.current) {
        chart.applyOptions({ 
          width: oscContainerRef.current.clientWidth,
          height: oscContainerRef.current.clientHeight
        });
      }
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(oscContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      oscChartRef.current = null;
      oscLinesRef.current.clear();
    };
  }, [hasOscillator]);

  // Sync time-scales between main and oscillator panes
  useEffect(() => {
    const main = chartRef.current;
    const osc = oscChartRef.current;
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
  }, [mainReady, oscReady]);

  // Render candles (also re-applies after chart recreation via mainReady)
  useEffect(() => {
    if (seriesRef.current && candles.length > 0) {
      const unique = Array.from(new Map(candles.map(c => [c.time, c])).values()).sort((a, b) => a.time - b.time);
      seriesRef.current.setData(unique as any);
    }
  }, [candles, mainReady]);

  // Live tick update
  useEffect(() => {
    if (seriesRef.current && latestTick && candles.length > 0) {
      const last = candles[candles.length - 1];
      seriesRef.current.update({
        time: last.time as any,
        open: last.open,
        high: Math.max(last.high, latestTick.quote),
        low: Math.min(last.low, latestTick.quote),
        close: latestTick.quote,
      });
    }
  }, [latestTick, candles]);

  // Render overlay indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

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
  }, [computed, mainReady]);

  // Render oscillator indicators
  useEffect(() => {
    const chart = oscChartRef.current;
    if (!chart) return;

    const wanted = new Set<string>();
    for (const c of computed) {
      if (c.pane !== "oscillator") continue;
      wanted.add(c.id);
      let line = oscLinesRef.current.get(c.id);
      if (!line) {
        line = chart.addLineSeries({ color: c.color, lineWidth: c.thickness as any, priceLineVisible: false, lastValueVisible: true });
        oscLinesRef.current.set(c.id, line);
      } else {
        line.applyOptions({ color: c.color, lineWidth: c.thickness as any });
      }
      line.setData(c.data as any);

      if (c.guides) {
        // Use full candle time range for guides so they span the entire visible pane
        const fullTimes = candles.length > 0
          ? Array.from(new Map(candles.map(cd => [cd.time, cd])).values())
              .sort((a, b) => a.time - b.time)
              .map(cd => cd.time)
          : c.data.map(p => p.time);
        for (let i = 0; i < c.guides.length; i++) {
          const key = `${c.id}::guide${i}`;
          wanted.add(key);
          const g = c.guides[i];
          let gl = oscLinesRef.current.get(key);
          if (!gl) {
            gl = chart.addLineSeries({ color: g.color, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false });
            oscLinesRef.current.set(key, gl);
          }
          if (fullTimes.length > 0) {
            gl.setData(fullTimes.map(t => ({ time: t, value: g.value })) as any);
          }
        }
      }

      if (c.additionalSeries) {
        for (let i = 0; i < c.additionalSeries.length; i++) {
          const key = `${c.id}::aux${i}`;
          wanted.add(key);
          const aux = c.additionalSeries[i];
          let ls = oscLinesRef.current.get(key);
          if (!ls) {
            ls = chart.addLineSeries({ color: aux.color, lineWidth: (aux.thickness ?? 1) as any, priceLineVisible: false, lastValueVisible: false });
            oscLinesRef.current.set(key, ls);
          }
          ls.setData(aux.data as any);
        }
      }
    }
    for (const [id, line] of oscLinesRef.current.entries()) {
      if (!wanted.has(id)) { chart.removeSeries(line); oscLinesRef.current.delete(id); }
    }
  }, [computed, oscReady, candles]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {!isConnected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-primary font-mono text-xl animate-pulse uppercase tracking-widest">
            Connecting to Deriv...
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-2 max-w-[calc(100%-80px)]">
        <div className="flex items-center gap-2 px-2 py-1 bg-background/80 border border-border">
          <div className={`h-2 w-2 ${isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {isConnected ? "LIVE • DERIV WS" : "DISCONNECTED"}
          </span>
        </div>
        {computed.filter(c => c.pane === "overlay").map(c => (
          <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 bg-background/80 border border-border">
            <div className="h-0.5 w-3" style={{ background: c.color }} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate max-w-[140px]">{c.name}</span>
          </div>
        ))}
      </div>
      <div ref={chartContainerRef} className="w-full flex-1 min-h-0" />
      {hasOscillator && (
        <div className="border-t border-border relative h-[140px] shrink-0">
          <div className="absolute top-1 left-2 z-10 flex flex-wrap items-center gap-2 px-1 py-0.5 bg-background/80">
            {computed.filter(c => c.pane === "oscillator").map(c => (
              <div key={c.id} className="flex items-center gap-1">
                <div className="h-0.5 w-3" style={{ background: c.color }} />
                <span className="text-[9px] font-mono uppercase text-muted-foreground">{c.name}</span>
              </div>
            ))}
          </div>
          <div ref={oscContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
