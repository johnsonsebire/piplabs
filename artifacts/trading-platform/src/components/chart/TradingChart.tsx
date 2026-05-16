import { useEffect, useRef } from "react";
import { createChart, IChartApi, ISeriesApi } from "lightweight-charts";
import { Candle, useDerivWs } from "@/hooks/use-deriv-ws";

interface TradingChartProps {
  symbol: string;
  height?: number;
}

export function TradingChart({ symbol, height = 400 }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const { candles, latestTick, isConnected } = useDerivWs(symbol);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#0a0f0d" },
        textColor: "#00ff88",
      },
      grid: {
        vertLines: { color: "#1a2a1a" },
        horzLines: { color: "#1a2a1a" },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#00ff88",
      downColor: "#ff0055",
      borderVisible: false,
      wickUpColor: "#00ff88",
      wickDownColor: "#ff0055",
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [height]);

  useEffect(() => {
    if (seriesRef.current && candles.length > 0) {
      // Sort and deduplicate candles by time
      const uniqueCandles = Array.from(new Map(candles.map(c => [c.time, c])).values())
        .sort((a, b) => a.time - b.time);
      seriesRef.current.setData(uniqueCandles as any);
    }
  }, [candles]);

  useEffect(() => {
    if (seriesRef.current && latestTick && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      // Update the current candle with the latest tick price
      seriesRef.current.update({
        time: lastCandle.time as any,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, latestTick.quote),
        low: Math.min(lastCandle.low, latestTick.quote),
        close: latestTick.quote,
      });
    }
  }, [latestTick, candles]);

  return (
    <div className="relative w-full" style={{ height }}>
      {!isConnected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-primary font-mono text-xl animate-pulse uppercase tracking-widest">
            Connecting...
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
