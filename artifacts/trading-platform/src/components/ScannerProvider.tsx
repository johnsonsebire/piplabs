/**
 * ScannerProvider
 *
 * A background-only component that mounts once inside AuthConfigurator and
 * keeps the Realtime Scanner running regardless of which page the user is on.
 *
 * Responsibilities:
 *  - Opens a persistent Deriv WebSocket for live tick prices
 *  - Re-subscribes whenever the user's watchlist changes
 *  - Runs the signal evaluation loop every 3 seconds
 *  - Auto-starts if the user had the SCANNER_AUTOSTART flag set
 *  - Exposes all state via useScannerStore (Zustand) — the UI reads from there
 */
import { useEffect, useRef, useCallback } from "react";
import {
  useGetWatchlist,
  useListStrategies,
  customFetch,
} from "@workspace/api-client-react";
import { useScannerStore, SCANNER_AUTOSTART_KEY } from "@/hooks/useScannerStore";
import { useNotifications } from "@/hooks/useNotifications";
import { getSymbolDisplayName } from "@/lib/utils";
import { fetchHistoricalCandles } from "@/lib/deriv-api";

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SIGNAL_EVAL_INTERVAL_MS = 3000;
const MAX_WS_SYMBOLS = 50;

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  // ── Global store ──────────────────────────────────────────────────────────
  const {
    isScanning,
    setIsScanning,
    setIsConnected,
    livePrices,
    setLivePrice,
    addLog,
    selectedStrategyId,
    setWatchedSymbols,
  } = useScannerStore();

  const pushNotification = useNotifications((state) => state.push);

  // ── Remote data ───────────────────────────────────────────────────────────
  const { data: watchlist = [] } = useGetWatchlist
    ? useGetWatchlist()
    : { data: [] };
  const { data: strategiesRes } = useListStrategies
    ? useListStrategies()
    : { data: [] };
  const strategies = Array.isArray(strategiesRes)
    ? strategiesRes
    : ((strategiesRes as any)?.strategies ?? []);

  // ── Refs (stable across renders without triggering effects) ───────────────
  const wsRef = useRef<WebSocket | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePricesRef = useRef(livePrices);
  const isScanningRef = useRef(isScanning);
  const strategiesRef = useRef(strategies);
  const selectedStrategyIdRef = useRef(selectedStrategyId);
  const lastSignalTimeRef = useRef<Record<string, number>>({});
  const lastSignalDirectionRef = useRef<Record<string, string>>({});
  const scannerCooldownRef = useRef(5); // minutes — will be overridden from user prefs
  const aiConfirmationRef = useRef(false);
  const autoStartedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { livePricesRef.current = livePrices; }, [livePrices]);
  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);
  useEffect(() => { strategiesRef.current = strategies; }, [strategies]);
  useEffect(() => { selectedStrategyIdRef.current = selectedStrategyId; }, [selectedStrategyId]);

  // ── WebSocket management ──────────────────────────────────────────────────
  const watchlistSymbols = (watchlist as any[]).map((w: any) => w.symbol);
  const watchlistSymbolsKey = watchlistSymbols.join(",");

  const openWebSocket = useCallback((symbols: string[]) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (symbols.length === 0) return;

    const ws = new WebSocket(DERIV_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      addLog(`◉ Live feed connected — subscribing to ${Math.min(symbols.length, MAX_WS_SYMBOLS)} symbols`, "info");
      symbols.slice(0, MAX_WS_SYMBOLS).forEach((sym) =>
        ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }))
      );
      setWatchedSymbols(symbols.slice(0, MAX_WS_SYMBOLS));
    };

    ws.onmessage = (event) => {
      let data: any;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.msg_type === "tick" && data.tick) {
        const sym = data.tick.symbol;
        const quote = parseFloat(data.tick.quote);
        const old = livePricesRef.current[sym];
        const change = old ? quote - old.prevPrice : 0;
        const pctChange = old && old.prevPrice !== 0 ? (change / old.prevPrice) * 100 : 0;
        setLivePrice(sym, {
          price: quote,
          prevPrice: old ? old.price : quote,
          change,
          pctChange,
        });
      }

      if (data.error) {
        addLog(`⚠ Feed error (${data.echo_req?.ticks ?? "?"}): ${data.error.message}`, "error");
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
      addLog("✗ WebSocket connection error. Will retry on watchlist change.", "error");
    };

    ws.onclose = () => {
      setIsConnected(false);
    };
  }, [addLog, setIsConnected, setLivePrice, setWatchedSymbols]);

  // Re-open WS whenever watchlist changes
  useEffect(() => {
    if (watchlistSymbols.length === 0) return;
    openWebSocket(watchlistSymbols);
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistSymbolsKey]);

  // ── Signal evaluation loop ────────────────────────────────────────────────
  const triggerAlert = useCallback(async (signalData: any) => {
    const stratName =
      strategiesRef.current.find(
        (s: any) => s.id.toString() === signalData.strategyId?.toString()
      )?.name ?? "Strategy";
    const assetName = signalData.assetName as string;
    const sym = signalData.symbol as string;
    const direction = signalData.direction as string;

    // Sound alert
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch { /* audio blocked */ }

    // Push notification (visible on all pages)
    pushNotification({
      category: "signal",
      title: `⚡ ${direction} — ${assetName}`,
      message: `Price: ${livePricesRef.current[sym]?.price?.toFixed(4) ?? "N/A"}`,
      meta: { symbol: sym, direction: direction as "BUY" | "SELL" },
    });

    // Webhook
    try {
      const humanSymbol = `${assetName} (${sym})`;
      const formattedPayload = {
        text: `Strategy: ${stratName} ${direction}\nASSET: ${assetName}\nSYMBOL: ${humanSymbol}\nTime: ${signalData.timestamp}`,
        fields: { Strategy: `${stratName} ${direction}`, Asset: assetName, Symbol: humanSymbol, Direction: direction, Time: signalData.timestamp },
      };
      await customFetch<any>("/api/scanner/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal: { ...signalData, symbol: humanSymbol }, payload: formattedPayload }),
      });
    } catch { /* webhook failure is non-fatal */ }
  }, [pushNotification]);

  const startSignalLoop = useCallback(() => {
    if (scannerIntervalRef.current) clearInterval(scannerIntervalRef.current);

    scannerIntervalRef.current = setInterval(() => {
      if (!isScanningRef.current) return;

      const prices = livePricesRef.current;
      const stratId = selectedStrategyIdRef.current;

      Object.entries(prices).forEach(([sym, data]) => {
        const now = Date.now();
        const lastSignal = lastSignalTimeRef.current[sym] ?? 0;
        const cooldownMs = scannerCooldownRef.current * 60_000;
        if (now - lastSignal <= cooldownMs) return;

        const absPct = Math.abs(data.pctChange);
        if (absPct <= 0.05) return;

        const direction = data.pctChange > 0 ? "BUY" : "SELL";
        const strength = absPct > 0.2 ? "STRONG" : "MODERATE";
        const lastDirection = lastSignalDirectionRef.current[sym];
        if (lastDirection === direction) return; // skip consecutive same direction

        lastSignalTimeRef.current[sym] = now;
        lastSignalDirectionRef.current[sym] = direction;
        const assetName = getSymbolDisplayName(sym);

        if (aiConfirmationRef.current) {
          addLog(`🤖 Submitting ${strength} ${direction} signal on ${assetName} for AI Analysis...`, "info");
          (async () => {
            try {
              const timeframes = [
                { label: "5M", gran: 300, count: 300 },
                { label: "15M", gran: 900, count: 300 },
                { label: "4H", gran: 14400, count: 300 },
              ];
              const allData = await Promise.all(
                timeframes.map((tf) =>
                  fetchHistoricalCandles(sym, tf.gran, tf.count).then((c) => ({
                    label: tf.label,
                    candles: c,
                  }))
                )
              );
              const prompt = `A scanner generated a ${direction} signal for ${assetName} (${sym}). Recent price action:\n${allData.map((d) => `[${d.label}] Last Close: ${d.candles[d.candles.length - 1]?.close ?? "N/A"}`).join("\n")}\nConfirm if this is a valid ${direction} setup. Reply with exactly "VALID" or "INVALID" on the first line, then brief reasoning.`;
              const chatRes = await customFetch<any>("/api/scanner/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, symbol: sym, direction }),
              });
              if (chatRes?.result === "VALID") {
                addLog(`✅ AI Confirmed ${direction} signal on ${assetName}: ${chatRes.reasoning}`, "alert");
                triggerAlert({ symbol: sym, assetName, direction, strategyId: stratId, timestamp: new Date().toISOString() });
              } else {
                addLog(`❌ AI Rejected ${direction} on ${assetName}: ${chatRes?.reasoning ?? "No reason"}`, "info");
              }
            } catch {
              addLog(`✗ AI analysis failed for ${sym}. Skipping.`, "error");
            }
          })();
        } else {
          addLog(`⚡ ${strength} ${direction} signal on ${assetName} (${sym}) | ${data.pctChange >= 0 ? "+" : ""}${data.pctChange.toFixed(3)}%`, "alert");
          triggerAlert({ symbol: sym, assetName, direction, strategyId: stratId, timestamp: new Date().toISOString() });
        }
      });
    }, SIGNAL_EVAL_INTERVAL_MS);
  }, [addLog, triggerAlert]);

  // Start/stop the signal loop based on isScanning
  useEffect(() => {
    if (isScanning) {
      startSignalLoop();
    } else {
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
        scannerIntervalRef.current = null;
      }
    }
    return () => {
      if (scannerIntervalRef.current) clearInterval(scannerIntervalRef.current);
    };
  }, [isScanning, startSignalLoop]);

  // ── Auto-start on first watchlist + strategy load ─────────────────────────
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!selectedStrategyId || watchlistSymbols.length === 0) return;
    const shouldAutoStart = localStorage.getItem(SCANNER_AUTOSTART_KEY) === "true";
    if (!shouldAutoStart) return;
    autoStartedRef.current = true;
    setIsScanning(true);
    addLog("♻ Auto-started scanner on login.", "info");
    pushNotification({
      category: "system",
      title: "Scanner Auto-Started",
      message: `Monitoring ${watchlistSymbols.length} symbols in the background.`,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistSymbolsKey, selectedStrategyId]);

  // ── Cleanup on unmount (user logs out) ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (scannerIntervalRef.current) clearInterval(scannerIntervalRef.current);
      setIsScanning(false);
      setIsConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This component renders no UI — it only manages the background engine
  return <>{children}</>;
}
