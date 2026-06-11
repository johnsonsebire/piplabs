"use client";

import React, { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TradingChart } from "@/components/chart/TradingChart";
import { BottomPanel } from "@/components/chart/BottomPanel";
import { useDerivWs, TIMEFRAME_OPTIONS } from "@/hooks/use-deriv-ws";
import { useCreateTrade, TradeInputDirection, TradeInputType, useSearchDerivSymbols, getSearchDerivSymbolsQueryKey, useListIndicators, useListMt5Accounts } from "@workspace/api-client-react";
import { ContractTypeSelector } from "@/components/chart/ContractTypeSelector";
import { type ContractSubtype, getContractType, encodeContractSubtype, GROWTH_RATES, MULTIPLIER_VALUES } from "@/lib/deriv-contract-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";

const DURATION_UNITS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "m", label: "Minutes" },
  { value: "t", label: "Ticks" },
  { value: "s", label: "Seconds" },
  { value: "h", label: "Hours" },
  { value: "d", label: "Days" },
];

export default function ChartPage() {
  const [symbol, setSymbol] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('deriv_selected_symbol') || "R_100";
    }
    return "R_100";
  });
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_selected_symbol', symbol);
    }
  }, [symbol]);
  const [granularitySec, setGranularitySec] = useState<number>(60);
  const { latestTick, isConnected } = useDerivWs(symbol, granularitySec);
  const { toast } = useToast();

  const [tradeClass, setTradeClass] = useState<"options" | "multiplier" | "forex">("options");
  const [volume, setVolume] = useState("1.00");
  const [stopLoss, setStopLoss] = useState("");
  const [pendingOrder, setPendingOrder] = useState<"market" | "limit" | "stop">("market");
  const [mt5AccountId, setMt5AccountId] = useState<string>("");

  const [contractType, setContractType] = useState<ContractSubtype>("RISE_FALL");
  const [direction, setDirection] = useState<TradeInputDirection>(TradeInputDirection.call);
  const [stake, setStake] = useState("1");
  const [duration, setDuration] = useState("5");
  const [durationUnit, setDurationUnit] = useState("m");
  const [barrier, setBarrier] = useState("+0.00");
  const [multiplier, setMultiplier] = useState("100");
  const [growthRate, setGrowthRate] = useState("3");
  const [takeProfit, setTakeProfit] = useState("");
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [tradeMode, setTradeMode] = useState<"demo" | "live">("demo");
  
  const config = getContractType(contractType);

  // When changing contract type, safely update direction and defaults
  const handleContractTypeChange = (newType: ContractSubtype) => {
    setContractType(newType);
    const newConfig = getContractType(newType);
    if (!newConfig.directions.some(d => d.value === direction)) {
      setDirection(newConfig.directions[0].value as TradeInputDirection);
    }
    if (newConfig.defaultDuration) setDuration(newConfig.defaultDuration);
    if (newConfig.defaultDurationUnit) setDurationUnit(newConfig.defaultDurationUnit);
  };

  const [openSearch, setOpenSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  const [isTradePanelOpen, setIsTradePanelOpen] = useState(true);
  const tradePanelRef = useRef<ImperativePanelHandle>(null);
  const isMobile = useIsMobile();

  const { data: searchResults, isLoading: isSearching } = useSearchDerivSymbols(
    { q: debouncedSearchQuery },
    { query: { queryKey: getSearchDerivSymbolsQueryKey({ q: debouncedSearchQuery }) } }
  );

  const createTrade = useCreateTrade();
  const { data: chartIndicators } = useListIndicators({});
  const { data: mt5Accounts } = useListMt5Accounts();

  // Initialize mt5AccountId when accounts load
  useEffect(() => {
    if (mt5Accounts && mt5Accounts.length > 0 && !mt5AccountId) {
      const matchingAccount = mt5Accounts.find(a => a.type === tradeMode);
      if (matchingAccount) setMt5AccountId(matchingAccount.id);
    }
  }, [mt5Accounts, mt5AccountId, tradeMode]);

  const handleExecute = (dirOverride?: TradeInputDirection) => {
    const isOptions = tradeClass === "options";
    const isForex = tradeClass === "forex";
    const isMultiplier = tradeClass === "multiplier";

    const finalDirection = dirOverride || direction;

    // Generate the notes payload with encoded contractSubtype
    const notes = isOptions ? encodeContractSubtype(contractType) : undefined;

    // Build base payload
    const payload: any = {
      symbol,
      type: isOptions ? config.apiType : (isForex ? "forex" : "multiplier"),
      direction: finalDirection,
      stake: isForex ? parseFloat(volume) : parseFloat(stake), // Sending volume as stake for now
      targetProfit: takeProfit ? parseFloat(takeProfit) : null,
      aiConfirmed,
      mode: tradeMode,
      notes,
      contractSubtype: isOptions ? contractType : undefined, 
      mt5AccountId: isForex ? mt5AccountId : undefined,
    };

    if (isForex && stopLoss) {
      payload.stopLoss = parseFloat(stopLoss); // Backend to be updated
      payload.pendingOrder = pendingOrder;
    }

    if (isOptions) {
      if (config.hasDuration) {
        payload.duration = parseInt(duration);
        payload.durationUnit = durationUnit;
      }
      if (config.needsBarrier) {
        payload.barrier = barrier;
      }
      if (config.needsGrowthRate) {
        payload.growthRate = parseFloat(growthRate);
      }
    }
    
    if (isMultiplier) {
      payload.multiplier = parseInt(multiplier, 10);
    }

    createTrade.mutate({ data: payload }, {
      onSuccess: () => {
        toast({
          title: "TRADE EXECUTED",
          description: `Successfully opened ${direction} on ${symbol}`,
        });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "EXECUTION FAILED",
          description: err?.message || "Failed to execute trade",
        });
      }
    });
  };

  return (
    <AppLayout>
      <div className="w-100 overflow-hidden d-flex flex-column" style={{ height: 'calc(100vh - 3rem)' }}>
        <PanelGroup direction={isMobile ? "vertical" : "horizontal"} className="flex-1 w-100 h-100">
          <Panel defaultSize={75} minSize={30} className="d-flex flex-column bg-background position-relative" style={{ minWidth: 0 }}>
            <div className="d-flex align-items-center px-3 justify-content-between bg-card flex-shrink-0 border-bottom border-secondary" style={{ height: '3rem' }}>
              <div className="d-flex align-items-center gap-2 flex-nowrap">
                {/* Combined Selectors Container - Forced Flex Row */}
                <div className="d-flex flex-row align-items-center border border-secondary bg-background flex-shrink-0 flex-nowrap overflow-hidden" style={{ height: '2rem', borderRadius: '0px' }}>
                  <Popover open={openSearch} onOpenChange={setOpenSearch}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={openSearch}
                        className="d-flex align-items-center justify-content-between h-100 rounded-none border-0 font-mono font-bold px-2 hover:bg-muted/50 flex-shrink-0"
                        style={{ width: isMobile ? '140px' : '180px' }}
                      >
                        <div className="d-flex align-items-center gap-1.5 truncate">
                          <Search size={12} className="text-muted-foreground flex-shrink-0" />
                          <span className="truncate text-xs">{symbol}</span>
                        </div>
                        <ChevronsUpDown className="ml-1 h-3 w-3 flex-shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 rounded-none border-border bg-[#0f1318] shadow-2xl z-[1000]" align="start" style={{ width: '320px', backgroundColor: '#0f1318', borderRadius: 0, border: '1px solid #1a2332' }}>
                      <Command shouldFilter={false} className="bg-transparent">
                        <CommandInput
                          placeholder="Search symbols..."
                          className="font-mono text-xs border-0 focus:ring-0"
                          style={{ height: '40px', fontSize: '0.75rem' }}
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList style={{ maxHeight: '400px', overflowY: 'auto', borderTop: '1px solid #1a2332', backgroundColor: '#0f1318' }}>
                          {isSearching && <div className="py-4 text-center text-xs font-mono text-muted-foreground animate-pulse">Searching...</div>}
                          {!isSearching && (!searchResults || searchResults.length === 0) && (
                            <CommandEmpty className="py-4 text-center text-xs font-mono text-muted-foreground">No symbols found.</CommandEmpty>
                          )}
                          <CommandGroup className="bg-[#0f1318]">
                            {Array.isArray(searchResults) && searchResults.map((item) => (
                              <CommandItem
                                key={item.symbol}
                                value={item.symbol}
                                onSelect={() => {
                                  setSymbol(item.symbol);
                                  setOpenSearch(false);
                                  setSearchQuery("");
                                }}
                                className="symbol-search-item"
                              >
                                <div className="d-flex align-items-center justify-content-between w-100">
                                  <div className="d-flex flex-column">
                                    <span className="font-bold symbol-search-name">{item.symbol}</span>
                                    <span className="text-muted-foreground mt-0.5" style={{ fontSize: '9px' }}>{item.displayName}</span>
                                  </div>
                                  {symbol === item.symbol && <Check className="h-3 w-3 text-primary" />}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <div className="w-px h-4 bg-border flex-shrink-0"></div>

                  <Select value={String(granularitySec)} onValueChange={(v) => setGranularitySec(parseInt(v, 10))}>
                    <SelectTrigger className="w-[72px] h-full py-0 px-2 rounded-none border-0 bg-transparent font-mono text-xs focus:ring-0 focus:ring-offset-0 hover:bg-muted/50 flex-shrink-0 [&>span]:flex [&>span]:items-center [&>span]:h-full" data-testid="select-timeframe">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border max-h-72 bg-[#0f1318] shadow-2xl z-[1000]" style={{ backgroundColor: '#0f1318' }}>
                      <SelectGroup>
                        <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-mono font-bold py-1 bg-[#151c24]/30">Minutes</SelectLabel>
                        {TIMEFRAME_OPTIONS.filter(tf => tf.group === "MINUTES").map((tf) => (
                          <SelectItem key={tf.seconds} value={String(tf.seconds)} className="font-mono text-xs cursor-pointer">
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator className="bg-[#1a2332] my-0.5" />
                      <SelectGroup>
                        <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-mono font-bold py-1 bg-[#151c24]/30">Hours</SelectLabel>
                        {TIMEFRAME_OPTIONS.filter(tf => tf.group === "HOURS").map((tf) => (
                          <SelectItem key={tf.seconds} value={String(tf.seconds)} className="font-mono text-xs cursor-pointer">
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator className="bg-[#1a2332] my-0.5" />
                      <SelectGroup>
                        <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-mono font-bold py-1 bg-[#151c24]/30">Days</SelectLabel>
                        {TIMEFRAME_OPTIONS.filter(tf => tf.group === "DAYS").map((tf) => (
                          <SelectItem key={tf.seconds} value={String(tf.seconds)} className="font-mono text-xs cursor-pointer">
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <div className="d-flex align-items-center gap-4">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider leading-none">Spot Price</span>
                  <span className={`font-mono font-bold text-sm leading-none ${latestTick ? 'text-primary' : 'text-muted-foreground'}`}>
                    {latestTick ? latestTick.quote.toFixed(4) : '---'}
                  </span>
                </div>
                
                <div className="w-px h-8 bg-border d-none d-md-block"></div>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-foreground d-none d-md-flex" 
                  onClick={() => {
                    const panel = tradePanelRef.current;
                    if (panel) {
                      if (isTradePanelOpen) panel.collapse();
                      else panel.expand();
                    }
                  }}
                  title={isTradePanelOpen ? "Hide Trade Panel" : "Show Trade Panel"}
                >
                  {isTradePanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </Button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <TradingChart
                key={`${symbol}-${granularitySec}`}
                symbol={symbol}
                granularitySec={granularitySec}
                indicators={Array.isArray(chartIndicators) ? chartIndicators.map(i => ({ id: i.id, name: i.name, code: i.code, parameters: i.parameters })) : []}
              />
            </div>
            <BottomPanel symbol={symbol} />
          </Panel>

          <PanelResizeHandle className={cn(
            "bg-border transition-colors hover:bg-primary z-10",
            isMobile ? "h-1 w-100 cursor-row-resize" : "w-1 h-100 cursor-col-resize"
          )} />

          <Panel
            ref={tradePanelRef}
            collapsible
            collapsedSize={0}
            defaultSize={25}
            minSize={20}
            maxSize={40}
            onCollapse={() => setIsTradePanelOpen(false)}
            onExpand={() => setIsTradePanelOpen(true)}
            className={cn(
              "bg-card d-flex flex-column flex-shrink-0 overflow-y-auto transition-all duration-300 ease-in-out",
              !isTradePanelOpen && !isMobile && "d-none"
            )}
          >
            <div className="p-4 border-b border-border d-flex align-items-center justify-content-between flex-shrink-0">
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">Order Entry</h2>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Mode:</Label>
                <div className="grid grid-cols-2 gap-1 w-[120px]">
                  <Button
                    size="sm"
                    variant={tradeMode === "demo" ? "default" : "outline"}
                    className={`h-6 rounded-none uppercase font-bold text-[9px] tracking-wider ${tradeMode === "demo" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border'}`}
                    onClick={() => setTradeMode("demo")}
                  >
                    DEMO
                  </Button>
                  <Button
                    size="sm"
                    variant={tradeMode === "live" ? "default" : "outline"}
                    className={`h-6 rounded-none uppercase font-bold text-[9px] tracking-wider ${tradeMode === "live" ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : 'hover:bg-destructive/20 hover:text-destructive border-border'}`}
                    onClick={() => setTradeMode("live")}
                  >
                    LIVE
                  </Button>
                </div>
                {tradeMode === "live" && <span className="d-flex h-2 w-2 rounded-full bg-destructive animate-pulse ml-1" title="Live Trading Active" />}
              </div>
            </div>

            <div className="p-4 space-y-6">
              <div className="space-y-3 mb-6 border-b border-border pb-6">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Trade Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={tradeClass === "options" ? "default" : "outline"}
                    className={`h-8 rounded-none uppercase font-bold text-[10px] tracking-wider px-1 ${tradeClass === "options" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border'}`}
                    onClick={() => setTradeClass("options")}
                  >
                    Options
                  </Button>
                  <Button
                    type="button"
                    variant={tradeClass === "multiplier" ? "default" : "outline"}
                    className={`h-8 rounded-none uppercase font-bold text-[10px] tracking-wider px-1 ${tradeClass === "multiplier" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border'}`}
                    onClick={() => setTradeClass("multiplier")}
                  >
                    Multiplier
                  </Button>
                  <Button
                    type="button"
                    variant={tradeClass === "forex" ? "default" : "outline"}
                    className={`h-8 rounded-none uppercase font-bold text-[10px] tracking-wider px-1 ${tradeClass === "forex" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border'}`}
                    onClick={() => setTradeClass("forex")}
                  >
                    Forex
                  </Button>
                </div>
              </div>

              {tradeClass === "options" && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Contract Type</Label>
                  <ContractTypeSelector value={contractType} onChange={handleContractTypeChange} compact />
                </div>
              )}

              {tradeClass === "options" && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Direction</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {config.directions.map((dir) => {
                      const isSelected = direction === dir.value;
                      const isGreen = dir.color === "green";
                      return (
                        <Button
                          key={dir.value}
                          type="button"
                          variant={isSelected ? (isGreen ? "default" : "destructive") : "outline"}
                          className={`rounded-none uppercase font-bold tracking-wider ${
                            isSelected 
                              ? (isGreen ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')
                              : (isGreen ? 'hover:bg-primary/20 hover:text-primary' : 'hover:bg-destructive/20 hover:text-destructive')
                          }`}
                          onClick={() => setDirection(dir.value as TradeInputDirection)}
                          style={{ gridColumn: config.directions.length === 1 ? "span 2" : undefined }}
                        >
                          {dir.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tradeClass === "multiplier" && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Direction</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={direction === TradeInputDirection.buy || direction === TradeInputDirection.call ? "default" : "outline"}
                      className={`rounded-none uppercase font-bold tracking-wider ${direction === TradeInputDirection.buy || direction === TradeInputDirection.call ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary'}`}
                      onClick={() => setDirection(TradeInputDirection.buy)}
                    >
                      Buy
                    </Button>
                    <Button
                      type="button"
                      variant={direction === TradeInputDirection.sell || direction === TradeInputDirection.put ? "destructive" : "outline"}
                      className={`rounded-none uppercase font-bold tracking-wider ${direction === TradeInputDirection.sell || direction === TradeInputDirection.put ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : 'hover:bg-destructive/20 hover:text-destructive'}`}
                      onClick={() => setDirection(TradeInputDirection.sell)}
                    >
                      Sell
                    </Button>
                  </div>
                </div>
              )}

              {tradeClass === "forex" && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Order Type</Label>
                    <Select value={pendingOrder} onValueChange={(v: any) => setPendingOrder(v)}>
                      <SelectTrigger className="w-100 h-10 rounded-none border-border bg-background font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl">
                        <SelectItem value="market" className="font-mono text-xs">Market Execution</SelectItem>
                        <SelectItem value="limit" className="font-mono text-xs">Pending Limit</SelectItem>
                        <SelectItem value="stop" className="font-mono text-xs">Pending Stop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Forex Account</Label>
                    <Select value={mt5AccountId} onValueChange={setMt5AccountId}>
                      <SelectTrigger className="w-100 h-10 rounded-none border-border bg-background font-mono text-xs">
                        <SelectValue placeholder="Select MT5 Account" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl max-h-[300px]">
                        {mt5Accounts?.filter(a => a.type === tradeMode).map((acc) => (
                          <SelectItem key={acc.id} value={acc.id} className="mt5-account-item font-mono text-xs cursor-pointer rounded-none border-b border-[#1a2332] last:border-0">
                            {acc.name} - {acc.broker} ({acc.login})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Volume (Lots)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      className="rounded-none font-mono text-lg h-10 border-border bg-background text-center"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-mono text-muted-foreground text-destructive">Stop Loss</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        placeholder="0.0000"
                        className="rounded-none font-mono h-10 border-border bg-background text-destructive"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-mono text-muted-foreground text-primary">Take Profit</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        placeholder="0.0000"
                        className="rounded-none font-mono h-10 border-border bg-background text-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {tradeClass !== "forex" && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Stake (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    className="rounded-none font-mono text-lg h-10 border-border bg-background"
                    data-testid="input-stake"
                  />
                </div>
              )}

              {tradeClass === "options" && config.needsBarrier && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">{config.barrierLabel}</Label>
                  <div className="space-y-1">
                    <Input
                      type="text"
                      value={barrier}
                      onChange={(e) => setBarrier(e.target.value)}
                      placeholder={config.barrierPlaceholder}
                      className="rounded-none font-mono h-10 border-border bg-background"
                    />
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {config.barrierHint}
                    </p>
                  </div>
                </div>
              )}

              {tradeClass === "options" && config.hasDuration && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Duration</Label>
                  <div className="d-flex gap-2">
                    <Input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="rounded-none font-mono flex-1 h-10 border-border bg-background"
                    />
                    <Select value={durationUnit} onValueChange={setDurationUnit}>
                      <SelectTrigger className="w-[120px] h-10 rounded-none border-border bg-background font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl">
                        {DURATION_UNITS.map((u) => {
                          if (config.ticksOnly && u.value !== "t") return null;
                          return <SelectItem key={u.value} value={u.value} className="font-mono text-xs">{u.label}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {tradeClass === "multiplier" && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Multiplier</Label>
                  <Select value={multiplier} onValueChange={setMultiplier}>
                    <SelectTrigger className="w-100 h-10 rounded-none border-border bg-background font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl">
                      {MULTIPLIER_VALUES.map((u) => (
                        <SelectItem key={u} value={u} className="font-mono text-xs">x{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {tradeClass === "options" && config.needsGrowthRate && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Growth Rate</Label>
                  <Select value={growthRate} onValueChange={setGrowthRate}>
                    <SelectTrigger className="w-100 h-10 rounded-none border-border bg-background font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl">
                      {GROWTH_RATES.map((u) => (
                        <SelectItem key={u.value} value={u.value} className="font-mono text-xs">{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {tradeClass !== "forex" && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Take Profit (Optional)</Label>
                  <Input
                    type="number"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="0.00"
                    className="rounded-none font-mono h-10 border-border bg-background"
                    data-testid="input-takeprofit"
                  />
                </div>
              )}


              <div className="d-flex align-items-center justify-content-between p-3 border border-border bg-background">
                <Label className="text-xs uppercase font-mono text-muted-foreground cursor-pointer" htmlFor="ai-confirm">
                  Request AI Confirmation
                </Label>
                <Switch
                  id="ai-confirm"
                  checked={aiConfirmed}
                  onCheckedChange={setAiConfirmed}
                  data-testid="switch-ai-confirm"
                />
              </div>
            </div>

            <div className="p-4 mt-auto border-t border-border">
              {tradeClass === "forex" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="w-100 rounded-none h-14 text-sm uppercase font-bold tracking-widest d-flex flex-column align-items-center justify-content-center gap-1 border-0"
                    style={{ backgroundColor: '#ef4444', color: 'white' }}
                    onClick={() => handleExecute(TradeInputDirection.sell)}
                    disabled={createTrade.isPending || !isConnected}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                  >
                    <span>Sell by Market</span>
                  </Button>
                  <Button
                    className="w-100 rounded-none h-14 text-sm uppercase font-bold tracking-widest d-flex flex-column align-items-center justify-content-center gap-1 border-0"
                    style={{ backgroundColor: '#3b82f6', color: 'white' }}
                    onClick={() => handleExecute(TradeInputDirection.buy)}
                    disabled={createTrade.isPending || !isConnected}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                  >
                    <span>Buy by Market</span>
                  </Button>
                </div>
              ) : (
                <Button
                  className={`w-100 rounded-none h-12 text-sm uppercase font-bold tracking-widest ${
                    direction === "put" || direction === "sell" 
                      ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                  onClick={() => handleExecute()}
                  disabled={createTrade.isPending || !isConnected}
                  data-testid="button-execute"
                >
                  {createTrade.isPending ? 'Executing...' : 'Execute Trade'}
                </Button>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </AppLayout>
  );
}