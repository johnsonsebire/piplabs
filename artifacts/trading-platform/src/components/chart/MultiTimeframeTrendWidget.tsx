import React, { useState, useEffect } from "react";
import { Settings, ChevronDown, ChevronUp, Brain } from "lucide-react";
import { useDerivWs } from "@/hooks/use-deriv-ws";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchHistoricalCandles } from "@/lib/deriv-api";
import { useAnalyzeMultiTimeframeTrend } from "@workspace/api-client-react";

interface MultiTimeframeTrendWidgetProps {
  symbol: string;
  granularitySec: number;
  onTrendUpdate?: (data: any) => void;
}

type LocalTrend = "bullish" | "bearish" | "neutral";
type TimeframeData = {
  timeframe: string;
  trend: LocalTrend;
  strength?: number;
};

const getSession = () => {
  const hour = new Date().getUTCHours();
  if (hour >= 12 && hour < 16) return { name: "NY/LONDON", color: "#a855f7", endHour: 16 }; // High Volatility Overlap
  if (hour >= 16 && hour < 21) return { name: "NEW YORK", color: "#3b82f6", endHour: 21 };
  if (hour >= 7 && hour < 12) return { name: "LONDON", color: "#eab308", endHour: 16 };
  if (hour >= 23 || hour < 6) return { name: "ASIAN", color: "#ec4899", endHour: 8 };
  return { name: "SYDNEY", color: "#06b6d4", endHour: 6 };
};

export function MultiTimeframeTrendWidget({ symbol, granularitySec, onTrendUpdate }: MultiTimeframeTrendWidgetProps) {
  const [candleDepth, setCandleDepth] = useState(() => Number(localStorage.getItem("mtf_candleDepth") || "50"));
  const [timeframes, setTimeframes] = useState<TimeframeData[]>([
    { timeframe: "5m", trend: "neutral" },
    { timeframe: "15m", trend: "neutral" },
    { timeframe: "30m", trend: "neutral" },
    { timeframe: "1H", trend: "neutral" },
    { timeframe: "4H", trend: "neutral" },
    { timeframe: "1D", trend: "neutral" },
  ]);
  const [marketState, setMarketState] = useState<"RANGING" | "TRENDING" | "CALCULATING">("CALCULATING");
  const [marketStrength, setMarketStrength] = useState(0);
  const [currentSession, setCurrentSession] = useState(getSession());
  const [sessionTimeLeft, setSessionTimeLeft] = useState("");
  const [isAiMode, setIsAiMode] = useState(() => localStorage.getItem("mtf_isAiMode") === "true");
  const [aiRefreshInterval, setAiRefreshInterval] = useState(() => localStorage.getItem("mtf_aiRefreshInterval") || "");

  useEffect(() => {
    localStorage.setItem("mtf_candleDepth", candleDepth.toString());
    localStorage.setItem("mtf_isAiMode", isAiMode.toString());
    localStorage.setItem("mtf_aiRefreshInterval", aiRefreshInterval);
  }, [candleDepth, isAiMode, aiRefreshInterval]);

  const analyzeTrend = useAnalyzeMultiTimeframeTrend();

  const handleRefresh = async () => {
    setMarketState("CALCULATING");
    try {
      // 1. Fetch historical candles locally
      const intervals = [
        { label: "5m", res: 300 },
        { label: "15m", res: 900 },
        { label: "30m", res: 1800 },
        { label: "1H", res: 3600 },
        { label: "4H", res: 14400 },
        { label: "1D", res: 86400 },
      ];

      const rawData: Record<string, any[]> = {};
      const newTfs: TimeframeData[] = [];
      let upCount = 0;
      let downCount = 0;

      for (const inv of intervals) {
        const candles = await fetchHistoricalCandles(symbol, inv.res, candleDepth);
        rawData[inv.label] = candles;
        
        // Simple local logic: Price vs 50 EMA approximation, or just Price vs Price N candles ago
        if (candles && candles.length > 0) {
          const first = candles[0].close;
          const last = candles[candles.length - 1].close;
          const trend: LocalTrend = last > first ? "bullish" : "bearish";
          newTfs.push({ timeframe: inv.label, trend });
          if (trend === "bullish") upCount++; else downCount++;
        } else {
          newTfs.push({ timeframe: inv.label, trend: "neutral" });
        }
      }

      setTimeframes(newTfs);
      const isTrending = Math.abs(upCount - downCount) >= 4; // E.g. 5 vs 1, or 6 vs 0
      setMarketState(isTrending ? "TRENDING" : "RANGING");
      setMarketStrength(Math.round((Math.max(upCount, downCount) / 6) * 100));

      if (isAiMode) {
        // Send to AI endpoint
        const aiResult = await analyzeTrend.mutateAsync({
          data: {
            symbol,
            candleDepth,
            timeframesData: rawData
          }
        });

        // Override with AI result
        if (aiResult.timeframes) {
          const updatedTfs = aiResult.timeframes.map((tf: any) => ({
            timeframe: tf.timeframe,
            trend: tf.trend as LocalTrend,
            strength: tf.strength
          }));
          setTimeframes(updatedTfs);
          setMarketState(aiResult.marketState as any);
          setMarketStrength(Math.round(updatedTfs.reduce((acc: number, tf: any) => acc + (tf.strength || 50), 0) / 6));
        }
      }
    } catch (err) {
      console.error("Failed to update multi-timeframe trend", err);
      setMarketState("RANGING");
    }
  };

  useEffect(() => {
    if (onTrendUpdate) {
      onTrendUpdate({
        timeframes,
        marketState,
        marketStrength,
        session: currentSession.name
      });
    }
  }, [timeframes, marketState, marketStrength, currentSession, onTrendUpdate]);

  useEffect(() => {
    handleRefresh();
    setCurrentSession(getSession());
    const defaultMinutes = Math.max(1, Math.round(granularitySec / 60));
    const refreshMinutes = aiRefreshInterval ? Number(aiRefreshInterval) : defaultMinutes;
    const intervalTime = Math.max(1, refreshMinutes) * 60 * 1000;
    const interval = setInterval(handleRefresh, intervalTime);
    return () => clearInterval(interval);
  }, [symbol, candleDepth, isAiMode, aiRefreshInterval, granularitySec]);

  useEffect(() => {
    const updateSessionTime = () => {
      const now = new Date();
      const current = getSession();
      if (current.name !== currentSession.name) {
        setCurrentSession(current);
      }
      
      let target = new Date(now);
      target.setUTCHours(current.endHour, 0, 0, 0);
      
      if (target <= now) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      
      const diffSecs = Math.floor((target.getTime() - now.getTime()) / 1000);
      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      
      setSessionTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    
    updateSessionTime();
    const interval = setInterval(updateSessionTime, 1000);
    return () => clearInterval(interval);
  }, [currentSession.name]);

  return (
    <div 
      style={{ 
        backgroundColor: "rgba(10, 13, 17, 0.85)", 
        border: "1px solid #1a2332", 
        padding: "4px 8px", 
        display: "flex", 
        flexDirection: "row", 
        alignItems: "center", 
        gap: "8px",
        borderRadius: "4px",
        height: "fit-content",
        fontSize: "9px"
      }}
      className="font-mono uppercase tracking-wider"
    >
      <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: "bold", display: "flex", alignItems: "center", gap: "2px" }}>
        TREND
        {isAiMode && <Brain size={10} className="text-[#a855f7]" />}
      </span>
      <div className="d-flex align-items-center gap-1.5">
        {timeframes.map((tf) => {
          const isBullish = tf.trend === "bullish";
          const isBearish = tf.trend === "bearish";
          const color = isBullish ? "#10b981" : isBearish ? "#ef4444" : "#94a3b8";
          
          return (
            <div key={tf.timeframe} className="d-flex align-items-center" style={{ color }}>
              <span style={{ fontSize: "9px", fontWeight: "bold" }}>{tf.timeframe}</span>
              {isBullish && <ChevronUp size={10} strokeWidth={3} />}
              {isBearish && <ChevronDown size={10} strokeWidth={3} />}
              {!isBullish && !isBearish && <span style={{ fontSize: "9px" }}>-</span>}
            </div>
          );
        })}
      </div>

      <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />

      <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: "bold" }}>STATE</span>
      <span style={{ fontSize: "9px", color: marketState === "TRENDING" ? "#10b981" : marketState === "CALCULATING" ? "#94a3b8" : "#f59e0b", fontWeight: "bold" }}>
        {marketState} {marketStrength}%
      </span>

      <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />

      <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: "bold" }}>SESSION</span>
      <span style={{ fontSize: "9px", color: currentSession.color, fontWeight: "bold" }}>
        {currentSession.name}
      </span>

      <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />

      <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: "bold" }}>CLOSES IN</span>
      <span style={{ fontSize: "9px", color: "#3b82f6", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>
        {sessionTimeLeft}
      </span>

      <div style={{ width: "1px", height: "12px", backgroundColor: "#1a2332" }} />

      <Popover>
        <PopoverTrigger asChild>
          <button style={{ color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }} className="hover:text-white transition-colors">
            <Settings size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-4 border-[#1a2332] bg-[#0a0d11] shadow-2xl z-[1000]" align="end">
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-white uppercase tracking-wider font-mono">Trend Settings</h4>
            
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Analysis Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant={!isAiMode ? "default" : "outline"}
                  onClick={() => setIsAiMode(false)}
                  className={!isAiMode ? "bg-primary text-primary-foreground" : "border-[#1a2332] text-muted-foreground"}
                >
                  Local
                </Button>
                <Button 
                  size="sm" 
                  variant={isAiMode ? "default" : "outline"}
                  onClick={() => setIsAiMode(true)}
                  className={isAiMode ? "bg-primary text-primary-foreground" : "border-[#1a2332] text-muted-foreground"}
                >
                  AI Confirmed
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Candle Depth (Lookback)</Label>
              <Input 
                type="number" 
                value={candleDepth} 
                onChange={(e) => setCandleDepth(Number(e.target.value))}
                className="font-mono bg-[#1e293b] border-[#334155] text-white h-8"
              />
              <p className="text-[10px] text-muted-foreground">Number of recent candles to analyze for trend direction.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Refresh Interval (Minutes)</Label>
              <Input 
                type="number" 
                value={aiRefreshInterval} 
                onChange={(e) => setAiRefreshInterval(e.target.value)}
                placeholder={`Default: ${Math.max(1, Math.round(granularitySec / 60))}m`}
                className="font-mono bg-[#1e293b] border-[#334155] text-white h-8"
              />
              <p className="text-[10px] text-muted-foreground">Leave empty to use chart timeframe.</p>
            </div>

            <Button 
              className="w-100 mt-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white h-8 text-xs font-bold"
              onClick={handleRefresh}
              disabled={analyzeTrend.isPending || marketState === "CALCULATING"}
            >
              {analyzeTrend.isPending || marketState === "CALCULATING" ? "Calculating..." : "Force Refresh"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
