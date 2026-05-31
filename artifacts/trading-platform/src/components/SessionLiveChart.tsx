import React, { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDerivWs } from "@/hooks/use-deriv-ws";
import { useListStrategies, useListIndicators } from "@workspace/api-client-react";
import { computeIndicator, parseIndicatorConfig } from "@/lib/indicators";
import { Loader2 } from "lucide-react";

type SessionLiveChartProps = {
  sessionId: number;
  symbol: string;
  strategyId: number;
};

export function SessionLiveChart({ sessionId, symbol, strategyId }: SessionLiveChartProps) {
  const { data: strategies } = useListStrategies({});
  const strategy = strategies?.find(s => s.id === strategyId);
  const { data: userIndicators } = useListIndicators({});

  // Poll for trades to show markers
  const { data: trades = [] } = useQuery({
    queryKey: ["/api/autotrade/sessions", sessionId, "trades"],
    queryFn: async () => {
      const res = await fetch(`/api/autotrade/sessions/${sessionId}/trades`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { candles, isConnected, error } = useDerivWs(symbol, 60);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<any>(null);
  const oscRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dummySeriesRefs = useRef<any[]>([]);

  // Parse indicators
  const { newCandles, overlayKeys, oscillatorKeys, oscillatorGroups } = useMemo(() => {
    const empty = { newCandles: [], overlayKeys: [] as string[], oscillatorKeys: [] as string[], oscillatorGroups: [] as [string, string[]][] };
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
                if (idx !== undefined) mappedCandles[idx].indicators[ref] = pt.value;
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

  // Init chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container || newCandles.length === 0) return;

    let cleanup = () => {};
    (async () => {
      let isDisposed = false;
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

      const chart = lib.createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 300,
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

        const dummySeries = oscChart.addLineSeries({ color: "transparent", priceLineVisible: false, lastValueVisible: false });
        dummySeriesRefs.current.push(dummySeries);

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

        chart.applyOptions({ rightPriceScale: { minimumWidth: 80 } });
        setTimeout(() => {
          try {
            const mainWidth = (chart.priceScale("right") as any).width?.() ?? 80;
            oscChart.applyOptions({ rightPriceScale: { minimumWidth: mainWidth } });
            chart.applyOptions({ rightPriceScale: { minimumWidth: mainWidth } });
          } catch {}
        }, 200);
      });

      indicatorSeriesRef.current = indicatorSeriesMap;

      // Seed data
      series.setData(newCandles.map((c: any) => ({ ...c, time: c.time as any })));
      if (dummySeriesRefs.current.length > 0) {
        dummySeriesRefs.current.forEach(ds => ds.setData(newCandles.map((c: any) => ({ time: c.time as any, value: 0 }))));
      }
      indicatorSeriesMap.forEach((lineSeries, key) => {
        const data = newCandles
          .map((c: any) => ({ time: c.time as any, value: c.indicators?.[key] }))
          .filter(d => d.value !== undefined && d.value !== null && Number.isFinite(d.value));
        lineSeries.setData(data as any);
      });
      oscChartsList.forEach(oc => { try { oc.timeScale().fitContent(); } catch {} });
      chart.timeScale().fitContent();

      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            if (entry.target === container) chart.applyOptions({ width, height });
            else oscChartsList.forEach(oc => { try { oc.applyOptions({ width, height }); } catch {} });
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
        try { chart.remove(); } catch {}
        oscChartsList.forEach(oc => { try { oc.remove(); } catch {} });
      };
    })();

    return () => cleanup();
  }, [newCandles.length > 0 ? newCandles[0].time : 0, overlayKeys.join(","), oscillatorKeys.join(",")]);

  // Update existing chart on new ticks/candles
  useEffect(() => {
    if (!seriesRef.current || newCandles.length === 0) return;
    const last = newCandles[newCandles.length - 1];
    try {
      seriesRef.current.update({ ...last, time: last.time as any });
      if (dummySeriesRefs.current.length > 0) {
        dummySeriesRefs.current.forEach(ds => ds.update({ time: last.time as any, value: 0 }));
      }
      if (indicatorSeriesRef.current) {
        indicatorSeriesRef.current.forEach((lineSeries: any, key: string) => {
          const val = (last as any).indicators?.[key];
          if (val !== undefined && val !== null && Number.isFinite(val)) {
            lineSeries.update({ time: last.time as any, value: val });
          }
        });
      }
    } catch {}
  }, [newCandles]);

  // Trade markers
  useEffect(() => {
    if (!seriesRef.current || !trades || trades.length === 0) return;
    const markers: any[] = [];
    for (const t of trades) {
      // only show markers for this symbol
      if (t.symbol !== symbol) continue;
      
      const entryTime = Math.floor(new Date(t.openedAt).getTime() / 1000);
      markers.push({
        time: entryTime as any,
        position: t.direction === "call" ? "belowBar" : "aboveBar",
        color: t.direction === "call" ? "#10b981" : "#ef4444",
        shape: t.direction === "call" ? "arrowUp" : "arrowDown",
        text: t.direction === "call" ? "BUY" : "SELL",
      });
      if (t.closedAt) {
        const exitTime = Math.floor(new Date(t.closedAt).getTime() / 1000);
        markers.push({
          time: exitTime as any,
          position: t.currentProfit >= 0 ? "aboveBar" : "belowBar",
          color: t.currentProfit >= 0 ? "#10b981" : "#ef4444",
          shape: "circle",
          text: `EXIT`,
        });
      }
    }
    markers.sort((a, b) => a.time - b.time);
    
    // Deduplicate markers
    const uniqueMarkers = [];
    let lastTime = 0;
    for (const m of markers) {
      if (m.time !== lastTime) {
        uniqueMarkers.push(m);
        lastTime = m.time;
      }
    }

    try {
      seriesRef.current.setMarkers(uniqueMarkers);
    } catch {}
  }, [trades, symbol, newCandles.length]);

  return (
    <div className="flex flex-col h-full bg-background relative border border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold font-mono text-primary flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="animate-pulse">SCANNING {symbol}</span>
              </>
            ) : (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">CONNECTING {symbol}...</span>
              </>
            )}
          </span>
        </div>
        {error && <span className="text-[10px] text-destructive font-mono">{error}</span>}
      </div>
      <div className="flex-1 min-h-[300px] relative overflow-hidden" ref={containerRef} />
      {oscillatorGroups.map(([groupName]) => (
        <div 
          key={groupName}
          className="h-[120px] shrink-0 border-t border-border/50 relative bg-background/50"
          ref={el => { oscRefs.current[groupName] = el; }}
        />
      ))}
    </div>
  );
}
