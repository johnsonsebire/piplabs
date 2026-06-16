"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Settings2, Bell, Globe, Search, Star } from "lucide-react";
import { useGetMe, useUpdateMe, useGetWatchlist, useListStrategies, customFetch, useAddToWatchlist, useRemoveFromWatchlist, useSearchDerivSymbols, useListAssets } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { swalSuccess, swalError } from "@/lib/swal";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function MarketScannerTab() {
  const { data: user } = useGetMe();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();
  // Safe fetch if hooks are not fully regenerated or available
  const { data: watchlist = [] } = useGetWatchlist ? useGetWatchlist() : { data: [] };
  const { data: strategiesRes } = useListStrategies ? useListStrategies() : { data: [] };
  const strategies = Array.isArray(strategiesRes) ? strategiesRes : ((strategiesRes as any)?.strategies || []);

  const [isScanning, setIsScanning] = useState(false);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("");
  const [logs, setLogs] = useState<{ time: string; msg: string; type: "info" | "alert" | "error" }[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; change: number }>>({});

  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
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

  const addLog = (msg: string, type: "info" | "alert" | "error" = "info") => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  const handleSaveSettings = () => {
    updateMe.mutate(
      {
        data: {
          scannerWebhookUrl: webhookUrl || null,
          scannerEmailAlerts: emailAlerts,
          scannerSoundAlerts: soundAlerts,
        } as any,
      },
      {
        onSuccess: () => {
          swalSuccess("Settings Saved", "Scanner alert preferences updated.");
          setShowSettings(false);
        },
        onError: () => swalError("Error", "Failed to save settings."),
      }
    );
  };

  const toggleWatchlist = async (item: any, isWatched: boolean) => {
    if (isWatched) {
      (removeWatchlist as any).mutate({ symbol: item.symbol }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
          swalSuccess("Removed", `${item.symbol} removed from favorites.`);
        },
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: item.symbol,
            displayName: item.name || item.symbol,
            shortName: item.shortName || item.symbol,
            type,
            pipSize: item.pip || 0.0001
          })
        });
      } catch (e) {
        // ignore asset creation errors, it might already exist
      }

      (addWatchlist as any).mutate({ data: { symbol: item.symbol } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
          swalSuccess("Added", `${item.symbol} added to favorites.`);
        },
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

  const toggleScanner = () => {
    if (!selectedStrategyId) {
      swalError("Missing Strategy", "Please select a strategy to run the scanner.");
      return;
    }
    if (watchlist.length === 0) {
      swalError("Empty Watchlist", "Please add some assets to your favorites/watchlist.");
      return;
    }

    if (isScanning) {
      setIsScanning(false);
      addLog("Scanner stopped.", "info");
    } else {
      setIsScanning(true);
      addLog(`Scanner started. Scanning ${watchlist.length} assets with selected strategy.`, "info");
      
      // Simulate scanning process
      simulateScan();
    }
  };

  const simulateScan = () => {
    if (!isScanning) return;
    
    // This is a placeholder for real WebSocket + Strategy evaluation logic.
    // In a real implementation, we would subscribe to WS streams for all watchlist items,
    // evaluate the strategy on every tick, and trigger the alert when matched.
    const interval = setInterval(() => {
      // Randomly trigger an alert for demonstration
      if (Math.random() > 0.8) {
        const randomAsset = watchlist[Math.floor(Math.random() * watchlist.length)];
        const direction = Math.random() > 0.5 ? "BUY" : "SELL";
        const signalMsg = `${direction} signal detected on ${randomAsset?.symbol || "Unknown"}!`;
        
        addLog(signalMsg, "alert");
        triggerAlert({
          symbol: randomAsset?.symbol,
          direction,
          strategyId: selectedStrategyId,
          timestamp: new Date().toISOString()
        });
      }
    }, 10000);

    // Store interval to clear it when stopped
    (window as any).scannerInterval = interval;
  };

  useEffect(() => {
    if (!isScanning && (window as any).scannerInterval) {
      clearInterval((window as any).scannerInterval);
    }
    return () => {
      if ((window as any).scannerInterval) clearInterval((window as any).scannerInterval);
    };
  }, [isScanning]);

  // Live Prices WebSocket
  useEffect(() => {
    if (filteredItems.length === 0) return;

    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    const symbols = filteredItems.map(i => i.symbol);

    ws.onopen = () => {
      // Subscribe to up to 50 items to avoid rate limits
      symbols.slice(0, 50).forEach(sym => {
        ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
      });
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      
      if (data.msg_type === "tick" && data.tick) {
        const sym = data.tick.symbol;
        const quote = parseFloat(data.tick.quote);
        
        setLivePrices(prev => {
          const old = prev[sym];
          if (!old) return { ...prev, [sym]: { price: quote, change: 0 } };
          const diff = quote - old.price;
          const newChange = diff !== 0 ? diff : old.change;
          return { ...prev, [sym]: { price: quote, change: newChange } };
        });
      }
    };

    return () => {
      ws.close();
    };
  }, [filteredItems.map(i => i.symbol).join(",")]);

  const triggerAlert = async (signalData: any) => {
    if (soundAlerts) {
      // Play a sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(e => console.log('Audio play failed:', e));
    }

    const stratName = strategiesRes?.find((s: any) => s.id.toString() === signalData.strategyId?.toString())?.name || "BO";
    const stratFullName = `${stratName} ${signalData.direction}`;
    const symbolText = signalData.symbol || "UNKNOWN";
    const durationText = "30 MINUTES";
    const analysisText = `${signalData.direction} Signal`;
    const timeText = signalData.timestamp || new Date().toISOString();

    const formattedPayload = {
      text: `Strategy: ${stratFullName},\nSYMBOL: ${symbolText},\nDURATION: ${durationText},\nAnalysis: ${analysisText},\nTime: ${timeText}`,
      fields: {
        Strategy: `${stratFullName},`,
        SYMBOL: `${symbolText},`,
        DURATION: `${durationText},`,
        Analysis: `${analysisText},`,
        Time: timeText
      }
    };

    try {
      const data = await customFetch<any>('/api/scanner/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: signalData,
          payload: formattedPayload
        })
      });
      
      if (data?.results?.webhook === 'success') {
        addLog("Webhook sent successfully.", "info");
      }
    } catch (err) {
      addLog("Failed to dispatch backend alert.", "error");
    }
  };

  return (
    <div className="d-flex flex-column h-100 bg-[#0a0a0a]">
      {/* Header Controls */}
      <div className="p-4 border-b border-border d-flex flex-column gap-4 bg-card flex-shrink-0">
        
        {/* Strategy Selector */}
        <div className="space-y-2">
          <Label className="text-xs uppercase font-mono text-muted-foreground">Select Strategy</Label>
          <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
            <SelectTrigger className="w-100 h-10 rounded-none border-border bg-background font-mono text-xs">
              <SelectValue placeholder="Choose a strategy to run..." />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl">
              {strategies.map((strat: any) => (
                <SelectItem key={strat.id} value={strat.id.toString()} className="font-mono text-xs cursor-pointer">
                  {strat.name}
                </SelectItem>
              ))}
              {strategies.length === 0 && (
                <SelectItem value="none" disabled className="font-mono text-xs">No strategies found</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Action Bar */}
        <div className="d-flex align-items-center justify-content-between">
          <Button
            className={`flex-1 rounded-none h-10 text-xs uppercase font-bold tracking-widest gap-2 mr-2 ${
              isScanning 
                ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
            onClick={toggleScanner}
          >
            {isScanning ? (
              <><Square size={14} /> Stop Scanner</>
            ) : (
              <><Play size={14} /> Start Scanner</>
            )}
          </Button>

          <Button
            variant="outline"
            className="rounded-none h-10 px-3 border-border bg-background hover:bg-muted"
            onClick={() => setShowSettings(!showSettings)}
            title="Alert Settings"
          >
            <Settings2 size={16} className={showSettings ? "text-primary" : "text-muted-foreground"} />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-muted/20 border-b border-border space-y-4 animate-in slide-in-from-top-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-primary mb-2">Alert Configuration</h3>
          
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-mono text-muted-foreground d-flex align-items-center gap-2">
              <Globe size={12} /> Webhook URL (POST)
            </Label>
            <Input 
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hook.example.com/..."
              className="h-8 rounded-none border-border font-mono text-xs"
            />
          </div>

          <div className="d-flex align-items-center justify-content-between p-2 border border-border bg-background">
            <Label className="text-[10px] uppercase font-mono text-muted-foreground cursor-pointer d-flex align-items-center gap-2" htmlFor="email-alerts">
              <Bell size={12} /> Email Alerts
            </Label>
            <Switch id="email-alerts" checked={emailAlerts} onCheckedChange={setEmailAlerts} />
          </div>

          <div className="d-flex align-items-center justify-content-between p-2 border border-border bg-background">
            <Label className="text-[10px] uppercase font-mono text-muted-foreground cursor-pointer d-flex align-items-center gap-2" htmlFor="sound-alerts">
              <Bell size={12} /> Sound Notifications
            </Label>
            <Switch id="sound-alerts" checked={soundAlerts} onCheckedChange={setSoundAlerts} />
          </div>

          <Button 
            size="sm" 
            className="w-100 rounded-none h-8 text-[10px] uppercase font-bold"
            onClick={handleSaveSettings}
            disabled={updateMe.isPending}
          >
            Save Preferences
          </Button>
        </div>
      )}

      {/* Watchlist Info & Search */}
      <div className="border-b border-border bg-[#0a0d11] d-flex flex-column flex-1 min-h-0">
        
        <div className="flex-shrink-0 p-3" style={{ position: 'relative' }}>
          <Search size={14} className="text-muted-foreground" style={{ position: 'absolute', left: '24px', top: '50%', transform: 'translateY(-50%)' }} />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets to monitor..."
            className="h-9 rounded-sm border border-[#1a2332] focus-visible:ring-1 focus-visible:ring-primary font-mono text-[10px] bg-[#050505]"
            style={{ paddingLeft: '36px' }}
          />
        </div>

        {/* Categories */}
        <div className="flex-shrink-0 d-flex gap-2 px-3 pb-2 overflow-x-auto no-scrollbar border-b border-border/50">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 border font-mono text-[10px] font-bold uppercase transition-colors whitespace-nowrap cursor-pointer ${
                activeCategory === cat ? "bg-primary border-primary text-black" : "bg-transparent border-[#1a2332] text-muted-foreground hover:text-foreground hover:bg-[#1a2332]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Table Header */}
        <div className="flex-shrink-0 d-flex align-items-center justify-content-between px-4 py-2 border-b border-border/50">
          <div className="d-flex align-items-center gap-6 flex-1">
            <span className="text-[10px] uppercase font-mono text-foreground font-bold">Symbol</span>
          </div>
          <div className="d-flex align-items-center gap-4 w-[120px] justify-content-end">
            <span className="text-[10px] uppercase font-mono text-foreground font-bold w-[45px] text-right">Price</span>
            <span className="text-[10px] uppercase font-mono text-foreground font-bold w-[45px] text-right">Change</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 p-2">
          {debouncedSearchQuery && isSearching ? (
            <div className="text-[10px] font-mono text-muted-foreground text-center py-4 animate-pulse">Searching...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-[10px] font-mono text-muted-foreground text-center py-4 opacity-50">
              {debouncedSearchQuery ? "No symbols found." : "No favorites in this category."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isWatched = watchlist.some((w: any) => w.symbol === item.symbol);
              return (
                <div key={item.symbol} className="d-flex align-items-center justify-content-between px-2 py-1.5 hover:bg-muted/30 border border-transparent hover:border-border transition-colors group cursor-pointer rounded-sm">
                  <div className="d-flex align-items-center gap-2 flex-1">
                    <button 
                      className="bg-transparent border-0 p-0 cursor-pointer opacity-50 hover:opacity-100 transition-opacity outline-none focus:outline-none d-flex align-items-center justify-content-center"
                      style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
                      onClick={(e) => { e.stopPropagation(); toggleWatchlist(item, isWatched); }}
                      disabled={(addWatchlist as any).isPending || (removeWatchlist as any).isPending}
                    >
                      <Star 
                        size={12} 
                        className={isWatched ? "text-warning" : "text-muted-foreground group-hover:text-primary"} 
                        fill={isWatched ? "currentColor" : "none"}
                        style={isWatched ? { filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.5))' } : {}}
                      />
                    </button>
                    <div className="d-flex align-items-center gap-2">
                      <div className="w-[18px] h-[18px] rounded-full bg-[#1a2332] border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground uppercase">
                        {item.symbol.replace(/^(frx|cry|OTC_)/, '').charAt(0)}
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                      <span className="text-[11px] font-mono font-bold text-foreground leading-none">{item.symbol.replace(/^(frx|cry|OTC_)/, '')}</span>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-4 w-[120px] justify-content-end">
                    <span className="text-[10px] font-mono text-foreground w-[45px] text-right">
                      {livePrices[item.symbol] ? livePrices[item.symbol].price.toFixed(item.pip ? Math.abs(Math.log10(item.pip)) : 4) : "-"}
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono w-[45px] text-right",
                      livePrices[item.symbol]?.change > 0 ? "text-success" :
                      livePrices[item.symbol]?.change < 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {livePrices[item.symbol]?.change > 0 ? "+" : ""}
                      {livePrices[item.symbol] && livePrices[item.symbol].change !== 0
                        ? livePrices[item.symbol].change.toFixed(item.pip ? Math.abs(Math.log10(item.pip)) : 4)
                        : "-"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log Terminal */}
      <div className="h-[120px] flex-shrink-0 overflow-y-auto p-4 space-y-2 font-mono text-xs bg-[#050505]">
        {logs.length === 0 ? (
          <div className="h-100 d-flex align-items-center justify-content-center text-muted-foreground opacity-50">
            Scanner idle. Ready to monitor favorites.
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`pb-1 border-b border-border/30 last:border-0 ${
              log.type === 'alert' ? 'text-primary font-bold' : 
              log.type === 'error' ? 'text-destructive' : 'text-muted-foreground'
            }`}>
              <span className="opacity-50 mr-2">[{log.time}]</span>
              {log.msg}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
