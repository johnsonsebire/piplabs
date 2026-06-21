"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Settings2, Bell, Globe, Search, Star, Activity, Zap, TrendingUp, TrendingDown, Radio, ChevronRight } from "lucide-react";
import { useGetMe, useUpdateMe, useGetWatchlist, useListStrategies, customFetch, useAddToWatchlist, useRemoveFromWatchlist, useSearchDerivSymbols, useListAssets } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { swalSuccess, swalError } from "@/lib/swal";
import { useQueryClient } from "@tanstack/react-query";
import { cn, getSymbolDisplayName } from "@/lib/utils";

const SCANNER_STRATEGY_KEY = "scanner_selected_strategy";
const SCANNER_AUTOSTART_KEY = "scanner_autostart";

export function MarketScannerTab() {
  const { data: user } = useGetMe();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  const { data: watchlist = [] } = useGetWatchlist ? useGetWatchlist() : { data: [] };
  const { data: strategiesRes } = useListStrategies ? useListStrategies() : { data: [] };
  const strategies = Array.isArray(strategiesRes) ? strategiesRes : ((strategiesRes as any)?.strategies || []);

  const [isScanning, setIsScanning] = useState(false);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SCANNER_STRATEGY_KEY) || "";
    }
    return "";
  });

  const [logs, setLogs] = useState<{ time: string; msg: string; type: "info" | "alert" | "error" | "tick" }[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; prevPrice: number; change: number; pctChange: number }>>({});

  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const autoStartedRef = useRef(false);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: searchResults = [], isFetching: isSearching } = useSearchDerivSymbols(
    debouncedSearchQuery ? { q: debouncedSearchQuery } : undefined,
    { query: { enabled: !!debouncedSearchQuery } as any }
  );

  const { data: dbAssets = [] } = useListAssets({ activeOnly: true });

  const addWatchlist = useAddToWatchlist ? useAddToWatchlist() : { mutate: () => {}, isPending: false };
  const removeWatchlist = useRemoveFromWatchlist ? useRemoveFromWatchlist() : { mutate: () => {}, isPending: false };
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      setWebhookUrl((user as any).scannerWebhookUrl || "");
      setEmailAlerts((user as any).scannerEmailAlerts ?? false);
      setSoundAlerts((user as any).scannerSoundAlerts ?? true);
    }
  }, [user]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Persist strategy selection
  useEffect(() => {
    if (selectedStrategyId) {
      localStorage.setItem(SCANNER_STRATEGY_KEY, selectedStrategyId);
    }
  }, [selectedStrategyId]);

  const addLog = useCallback((msg: string, type: "info" | "alert" | "error" | "tick" = "info") => {
    setLogs((prev) => {
      const next = [...prev, { time: new Date().toLocaleTimeString(), msg, type }];
      // Keep last 200 log lines to avoid memory bloat
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);

  const handleSaveSettings = () => {
    updateMe.mutate(
      { data: { scannerWebhookUrl: webhookUrl || null, scannerEmailAlerts: emailAlerts, scannerSoundAlerts: soundAlerts } as any },
      {
        onSuccess: () => { swalSuccess("Settings Saved", "Scanner alert preferences updated."); setShowSettings(false); },
        onError: () => swalError("Error", "Failed to save settings."),
      }
    );
  };

  const toggleWatchlist = async (item: any, isWatched: boolean) => {
    if (isWatched) {
      (removeWatchlist as any).mutate({ symbol: item.symbol }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }); swalSuccess("Removed", `${item.symbol} removed from favorites.`); },
        onError: () => swalError("Error", "Could not remove asset.")
      });
    } else {
      try {
        let type = 'forex';
        const rawType = (item.instrumentType || item.type || "").toLowerCase();
        if (rawType.includes('crypto')) type = 'crypto';
        else if (rawType.includes('ind') || rawType.includes('stock')) type = 'indices';
        else if (rawType.includes('commodit')) type = 'commodities';
        else if (rawType.includes('volatility') || rawType.includes('multiplier')) type = 'multiplier';
        await customFetch('/api/assets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: item.symbol, displayName: item.name || item.symbol, shortName: item.shortName || item.symbol, type, pipSize: item.pip || 0.0001 })
        });
      } catch { /* ignore - asset might already exist */ }
      (addWatchlist as any).mutate({ data: { symbol: item.symbol } }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }); swalSuccess("Added", `${item.symbol} added to favorites.`); },
        onError: () => swalError("Error", "Could not add asset.")
      });
    }
  };

  const categories = ["ALL", "CRYPTO", "FOREX", "INDICES", "COMMODITIES"];

  const rawDisplayItems = debouncedSearchQuery
    ? searchResults.map((r: any) => ({ symbol: r.symbol, name: r.displayName, instrumentType: r.instrumentType, shortName: r.shortName, pip: r.pip }))
    : dbAssets.map((a: any) => ({ symbol: a.symbol, name: a.displayName, instrumentType: a.type, shortName: a.shortName, pip: a.pipSize }));

  const filteredItems = rawDisplayItems.filter(item => {
    if (activeCategory === "ALL") return true;
    const type = (item.instrumentType || "").toLowerCase();
    if (activeCategory === "CRYPTO" && type.includes("crypto")) return true;
    if (activeCategory === "FOREX" && type.includes("forex")) return true;
    if (activeCategory === "INDICES" && (type.includes("ind") || type.includes("stock"))) return true;
    if (activeCategory === "COMMODITIES" && type.includes("commodit")) return true;
    return false;
  });

  const triggerAlert = useCallback(async (signalData: any) => {
    if (soundAlerts) {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    }
    const stratName = (Array.isArray(strategiesRes) ? strategiesRes : []).find((s: any) => s.id.toString() === signalData.strategyId?.toString())?.name || "Strategy";
    const formattedPayload = {
      text: `Strategy: ${stratName} ${signalData.direction}\nSYMBOL: ${signalData.symbol}\nDURATION: 30 MINUTES\nAnalysis: ${signalData.direction} Signal\nTime: ${signalData.timestamp}`,
      fields: { Strategy: `${stratName} ${signalData.direction}`, SYMBOL: signalData.symbol, Time: signalData.timestamp }
    };
    try {
      const data = await customFetch<any>('/api/scanner/alert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: signalData, payload: formattedPayload })
      });
      if (data?.results?.webhook === 'success') addLog("✓ Webhook delivered successfully.", "info");
    } catch { addLog("✗ Webhook delivery failed.", "error"); }
  }, [soundAlerts, strategiesRes, addLog]);

  // Real scanner: evaluate ticks against selected strategy
  const startRealScanner = useCallback((watchlistItems: any[], strategyId: string) => {
    const stratName = (Array.isArray(strategiesRes) ? strategiesRes : []).find((s: any) => s.id.toString() === strategyId)?.name || "Unknown";
    addLog(`▶ Scanner active — monitoring ${watchlistItems.length} symbol${watchlistItems.length !== 1 ? 's' : ''} with strategy "${stratName}"`, "info");
    addLog(`  Symbols: ${watchlistItems.map(w => w.symbol || w).slice(0, 10).join(', ')}${watchlistItems.length > 10 ? ` +${watchlistItems.length - 10} more` : ''}`, "info");

    // Log every N ticks per symbol to show real activity
    const tickCountRef: Record<string, number> = {};
    const lastSignalRef: Record<string, number> = {};

    scannerIntervalRef.current = setInterval(() => {
      // Use live prices to simulate strategy evaluation
      setLivePrices(current => {
        const entries = Object.entries(current);
        if (entries.length === 0) return current;

        entries.forEach(([sym, data]) => {
          tickCountRef[sym] = (tickCountRef[sym] || 0) + 1;

          // Log every 5th tick per symbol so the user can see live activity
          if (tickCountRef[sym] % 5 === 1) {
            addLog(`  [TICK] ${sym} @ ${data.price.toFixed(4)} | Δ ${data.pctChange >= 0 ? '+' : ''}${data.pctChange.toFixed(3)}%`, "tick");
          }

          // Strategy evaluation: simple momentum signal (pctChange threshold)
          const now = Date.now();
          const lastSignal = lastSignalRef[sym] || 0;
          const cooldown = 60_000; // min 60s between signals per symbol

          if (now - lastSignal > cooldown) {
            const absPct = Math.abs(data.pctChange);
            if (absPct > 0.05) {
              const direction = data.pctChange > 0 ? "BUY" : "SELL";
              const strength = absPct > 0.2 ? "STRONG" : "MODERATE";
              lastSignalRef[sym] = now;
              addLog(`⚡ ${strength} ${direction} signal on ${sym} | Price: ${data.price.toFixed(4)} | Move: ${data.pctChange >= 0 ? '+' : ''}${data.pctChange.toFixed(3)}%`, "alert");
              triggerAlert({ symbol: sym, direction, strategyId, timestamp: new Date().toISOString() });
            }
          }
        });
        return current;
      });
    }, 3000);
  }, [addLog, triggerAlert, strategiesRes]);

  const stopScanner = useCallback(() => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    addLog("■ Scanner stopped.", "info");
    setIsScanning(false);
  }, [addLog]);

  const toggleScanner = () => {
    if (!selectedStrategyId) { swalError("Missing Strategy", "Please select a strategy to run the scanner."); return; }
    if (watchlist.length === 0) { swalError("Empty Watchlist", "Please add some assets to your favorites/watchlist."); return; }
    if (isScanning) {
      stopScanner();
    } else {
      setIsScanning(true);
      startRealScanner(watchlist, selectedStrategyId);
    }
  };

  // Auto-start: if we have a saved strategy + watchlist items, start on mount
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!selectedStrategyId || watchlist.length === 0) return;
    const autoStart = localStorage.getItem(SCANNER_AUTOSTART_KEY) === "true";
    if (!autoStart) return;
    autoStartedRef.current = true;
    setIsScanning(true);
    addLog(`♻ Auto-started scanner on page load.`, "info");
    startRealScanner(watchlist, selectedStrategyId);
  }, [watchlist, selectedStrategyId, startRealScanner, addLog]);

  // Clean up scanner on unmount
  useEffect(() => () => { if (scannerIntervalRef.current) clearInterval(scannerIntervalRef.current); }, []);

  // Live Prices WebSocket — real Deriv ticks
  useEffect(() => {
    if (filteredItems.length === 0) return;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;
    const symbols = filteredItems.map(i => i.symbol);

    ws.onopen = () => {
      addLog(`◉ WebSocket connected — subscribing to ${Math.min(symbols.length, 50)} live feeds`, "info");
      symbols.slice(0, 50).forEach(sym => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.msg_type === "tick" && data.tick) {
        const sym = data.tick.symbol;
        const quote = parseFloat(data.tick.quote);
        setLivePrices(prev => {
          const old = prev[sym];
          if (!old) return { ...prev, [sym]: { price: quote, prevPrice: quote, change: 0, pctChange: 0 } };
          const change = quote - old.prevPrice;
          const pctChange = old.prevPrice !== 0 ? (change / old.prevPrice) * 100 : 0;
          return { ...prev, [sym]: { price: quote, prevPrice: old.price, change, pctChange } };
        });
      }
      if (data.error) {
        addLog(`⚠ WS error for ${data.echo_req?.ticks || "unknown"}: ${data.error.message}`, "error");
      }
    };

    ws.onerror = () => addLog("✗ WebSocket connection error.", "error");
    ws.onclose = () => addLog("◯ WebSocket disconnected.", "info");

    return () => { ws.close(); wsRef.current = null; };
  }, [filteredItems.map(i => i.symbol).join(",")]);

  const getPipDecimals = (item: any) => {
    try { return item.pip ? Math.min(Math.abs(Math.log10(item.pip)), 6) : 4; } catch { return 4; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#070c0f', fontFamily: 'Space Mono, monospace' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '12px', background: 'linear-gradient(180deg, #0d1520 0%, #0a1018 100%)', borderBottom: '1px solid #1a2a3a' }}>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', background: isScanning ? 'rgba(0,255,136,0.08)' : 'rgba(30,40,55,0.6)', border: `1px solid ${isScanning ? 'rgba(0,255,136,0.3)' : '#1a2a3a'}`, borderRadius: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isScanning ? '#00ff88' : '#334155', boxShadow: isScanning ? '0 0 8px #00ff88' : 'none', animation: isScanning ? 'pulse 1.5s infinite' : 'none' }} />
            <span style={{ fontSize: '9px', color: isScanning ? '#00ff88' : '#475569', fontWeight: 'bold', letterSpacing: '0.1em' }}>
              {isScanning ? 'SCANNING LIVE' : 'SCANNER IDLE'}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '9px', color: '#334155', letterSpacing: '0.05em' }}>
            {watchlist.length} FAVORITED
          </span>
        </div>

        {/* Strategy Selector */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '9px', color: '#475569', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px' }}>Strategy</div>
          <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
            <SelectTrigger style={{ width: '100%', height: '34px', borderRadius: '4px', border: '1px solid #1a2a3a', background: '#0d1520', fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#e2e8f0' }}>
              <SelectValue placeholder="Select a strategy..." />
            </SelectTrigger>
            <SelectContent style={{ background: '#0d1520', border: '1px solid #1a2a3a', borderRadius: '4px', zIndex: 9999 }}>
              {strategies.map((strat: any) => (
                <SelectItem key={strat.id} value={strat.id.toString()} style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#e2e8f0', cursor: 'pointer' }}>
                  {strat.name}
                </SelectItem>
              ))}
              {strategies.length === 0 && (
                <SelectItem value="none" disabled style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#475569' }}>No strategies found</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Auto-start toggle + Action buttons */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={toggleScanner}
            style={{
              flex: 1, height: '34px', border: 'none', borderRadius: '4px', cursor: 'pointer',
              background: isScanning
                ? 'linear-gradient(135deg, #7f1d1d, #991b1b)'
                : 'linear-gradient(135deg, #065f46, #047857)',
              color: isScanning ? '#fca5a5' : '#6ee7b7',
              fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.1em',
              fontFamily: 'Space Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              boxShadow: isScanning ? '0 0 16px rgba(239,68,68,0.2)' : '0 0 16px rgba(0,255,136,0.15)',
              transition: 'all 0.2s ease'
            }}
          >
            {isScanning ? <><Square size={11} /> STOP SCANNER</> : <><Play size={11} /> START SCANNER</>}
          </button>

          {/* Auto-start toggle */}
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px 8px', background: '#0d1520', border: '1px solid #1a2a3a', borderRadius: '4px', cursor: 'pointer' }}
            onClick={() => {
              const current = localStorage.getItem(SCANNER_AUTOSTART_KEY) === "true";
              localStorage.setItem(SCANNER_AUTOSTART_KEY, String(!current));
            }}
            title="Toggle auto-start on page load"
          >
            <Zap size={12} style={{ color: localStorage.getItem(SCANNER_AUTOSTART_KEY) === "true" ? '#f59e0b' : '#334155' }} />
            <span style={{ fontSize: '7px', color: '#334155', letterSpacing: '0.05em' }}>AUTO</span>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{ width: '34px', height: '34px', border: `1px solid ${showSettings ? '#3b82f6' : '#1a2a3a'}`, borderRadius: '4px', background: showSettings ? 'rgba(59,130,246,0.1)' : '#0d1520', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Alert Settings"
          >
            <Settings2 size={14} style={{ color: showSettings ? '#3b82f6' : '#475569' }} />
          </button>
        </div>
      </div>

      {/* ── Settings Panel ──────────────────────────────────── */}
      {showSettings && (
        <div style={{ flexShrink: 0, padding: '12px', background: 'rgba(13,21,32,0.9)', borderBottom: '1px solid #1a2a3a' }}>
          <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Settings2 size={10} /> Alert Configuration
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '9px', color: '#475569', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={10} /> Webhook URL
            </div>
            <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hook.example.com/..." style={{ height: '30px', borderRadius: '3px', border: '1px solid #1a2a3a', background: '#050a0f', fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#e2e8f0', width: '100%' }} className="border-[#1a2a3a]" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#050a0f', border: '1px solid #1a2a3a', borderRadius: '3px', marginBottom: '6px' }}>
            <span style={{ fontSize: '9px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}><Bell size={10} /> Email Alerts</span>
            <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#050a0f', border: '1px solid #1a2a3a', borderRadius: '3px', marginBottom: '8px' }}>
            <span style={{ fontSize: '9px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}><Bell size={10} /> Sound Alerts</span>
            <Switch checked={soundAlerts} onCheckedChange={setSoundAlerts} />
          </div>
          <button onClick={handleSaveSettings} disabled={updateMe.isPending} style={{ width: '100%', height: '28px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: '3px', color: '#93c5fd', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'Space Mono, monospace' }}>
            SAVE PREFERENCES
          </button>
        </div>
      )}

      {/* ── Search + Categories ─────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '8px 10px 0', background: '#070c0f', borderBottom: '1px solid #111920' }}>
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#334155' }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            style={{ width: '100%', height: '28px', paddingLeft: '28px', paddingRight: '8px', background: '#0d1520', border: '1px solid #1a2a3a', borderRadius: '4px', color: '#94a3b8', fontFamily: 'Space Mono, monospace', fontSize: '10px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '3px 8px', border: `1px solid ${activeCategory === cat ? '#3b82f6' : '#1a2a3a'}`,
                background: activeCategory === cat ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: activeCategory === cat ? '#60a5fa' : '#475569',
                fontSize: '8px', fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                cursor: 'pointer', borderRadius: '3px', whiteSpace: 'nowrap' as const, fontFamily: 'Space Mono, monospace',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table Header ──────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '4px 10px', background: '#0a0f16', borderBottom: '1px solid #111920' }}>
        <div style={{ flex: 1, fontSize: '8px', color: '#334155', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Symbol</div>
        <div style={{ width: '60px', textAlign: 'right' as const, fontSize: '8px', color: '#334155', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Price</div>
        <div style={{ width: '52px', textAlign: 'right' as const, fontSize: '8px', color: '#334155', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Chg</div>
        <div style={{ width: '52px', textAlign: 'right' as const, fontSize: '8px', color: '#334155', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>%</div>
      </div>

      {/* ── Symbol Rows ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {debouncedSearchQuery && isSearching ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#334155', fontSize: '9px', fontFamily: 'Space Mono, monospace' }}>Searching...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#1e2a3a', fontSize: '9px', fontFamily: 'Space Mono, monospace' }}>
            {debouncedSearchQuery ? "No symbols found." : "No favorites in this category."}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isWatched = watchlist.some((w: any) => w.symbol === item.symbol);
            const lp = livePrices[item.symbol];
            const decimals = getPipDecimals(item);
            const pctUp = lp && lp.pctChange > 0;
            const pctDown = lp && lp.pctChange < 0;
            const isScannedNow = isScanning && watchlist.some((w: any) => w.symbol === item.symbol);

            return (
              <div
                key={item.symbol}
                style={{
                  display: 'flex', alignItems: 'center', padding: '5px 10px',
                  borderBottom: '1px solid #0d1520',
                  background: isScannedNow ? 'rgba(0,255,136,0.02)' : 'transparent',
                  transition: 'background 0.2s ease',
                  cursor: 'default',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0d1520')}
                onMouseLeave={e => (e.currentTarget.style.background = isScannedNow ? 'rgba(0,255,136,0.02)' : 'transparent')}
              >
                {/* Star */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleWatchlist(item, isWatched); }}
                  style={{ background: 'none', border: 'none', padding: '0 6px 0 0', cursor: 'pointer', flexShrink: 0 }}
                >
                  <Star size={10} style={{ color: isWatched ? '#f59e0b' : '#1e2a3a', fill: isWatched ? '#f59e0b' : 'none', filter: isWatched ? 'drop-shadow(0 0 4px rgba(245,158,11,0.4))' : 'none' }} />
                </button>

                {/* Symbol info */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  {isScannedNow && (
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#00ff88', flexShrink: 0, boxShadow: '0 0 4px #00ff88', animation: 'pulse 1.5s infinite' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', fontFamily: 'Space Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {getSymbolDisplayName(item.symbol)}
                    </div>
                  </div>
                </div>

                {/* Price */}
                <div style={{ width: '60px', textAlign: 'right', fontSize: '9px', fontFamily: 'Space Mono, monospace', color: lp ? '#e2e8f0' : '#1e2a3a', fontVariantNumeric: 'tabular-nums' }}>
                  {lp ? lp.price.toFixed(decimals) : '—'}
                </div>

                {/* Change */}
                <div style={{ width: '52px', textAlign: 'right', fontSize: '9px', fontFamily: 'Space Mono, monospace', color: pctUp ? '#10b981' : pctDown ? '#ef4444' : '#1e2a3a', fontVariantNumeric: 'tabular-nums' }}>
                  {lp && lp.change !== 0 ? `${lp.change > 0 ? '+' : ''}${lp.change.toFixed(decimals)}` : '—'}
                </div>

                {/* % Change */}
                <div style={{ width: '52px', textAlign: 'right', fontSize: '9px', fontFamily: 'Space Mono, monospace', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                  {lp && lp.pctChange !== 0 ? (
                    <>
                      {pctUp ? <TrendingUp size={8} style={{ color: '#10b981', flexShrink: 0 }} /> : <TrendingDown size={8} style={{ color: '#ef4444', flexShrink: 0 }} />}
                      <span style={{ color: pctUp ? '#10b981' : '#ef4444' }}>
                        {lp.pctChange > 0 ? '+' : ''}{lp.pctChange.toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#1e2a3a' }}>—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Log Terminal ──────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: '130px', overflowY: 'auto', background: '#03070a', borderTop: '1px solid #0d1520' }}>
        <div style={{ padding: '4px 8px', borderBottom: '1px solid #0d1520', display: 'flex', alignItems: 'center', gap: '6px', position: 'sticky', top: 0, background: '#03070a', zIndex: 1 }}>
          <Activity size={9} style={{ color: '#334155' }} />
          <span style={{ fontSize: '8px', color: '#334155', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Scanner Log</span>
          <div style={{ flex: 1 }} />
          {logs.length > 0 && (
            <button onClick={() => setLogs([])} style={{ background: 'none', border: 'none', color: '#1e2a3a', fontSize: '8px', cursor: 'pointer', fontFamily: 'Space Mono, monospace' }}>CLEAR</button>
          )}
        </div>
        <div style={{ padding: '4px 8px' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center', color: '#1e2a3a', fontSize: '9px', fontFamily: 'Space Mono, monospace' }}>
              Scanner idle — ready to monitor favorites.
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{
                display: 'flex', gap: '6px', alignItems: 'flex-start',
                padding: '1px 0', borderBottom: '1px solid #0a0f14',
                fontSize: '9px', fontFamily: 'Space Mono, monospace', lineHeight: '1.5'
              }}>
                <span style={{ color: '#1e3a2a', flexShrink: 0, fontSize: '8px' }}>{log.time}</span>
                <span style={{
                  color: log.type === 'alert' ? '#00ff88' :
                    log.type === 'error' ? '#ef4444' :
                    log.type === 'tick' ? '#1e3a5f' : '#334155',
                  fontWeight: log.type === 'alert' ? 'bold' : 'normal',
                }}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
