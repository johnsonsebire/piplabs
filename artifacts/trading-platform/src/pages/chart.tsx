"use client";

import React, { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChartContainer, ChartConfig } from "@/components/chart/ChartContainer";
import { useCreateTrade, TradeInputDirection, useListIndicators, useListMt5Accounts } from "@workspace/api-client-react";
import { ContractTypeSelector } from "@/components/chart/ContractTypeSelector";
import { type ContractSubtype, getContractType, encodeContractSubtype, GROWTH_RATES, MULTIPLIER_VALUES } from "@/lib/deriv-contract-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { swalSuccess, swalError } from "@/lib/swal";
import { PanelRightClose, PanelRightOpen, Plus, LayoutGrid, Square, Columns, Rows, Grid2x2, Grid3x3, LineChart, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAiContext } from "@/hooks/useAiContext";
import { MarketScannerTab } from "@/components/chart/MarketScannerTab";

export type LayoutType = '1' | '2-h' | '2-v' | '3' | '4';

const DURATION_UNITS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "m", label: "Minutes" },
  { value: "t", label: "Ticks" },
  { value: "s", label: "Seconds" },
  { value: "h", label: "Hours" },
  { value: "d", label: "Days" },
];

export default function ChartPage() {
  const [charts, setCharts] = useState<ChartConfig[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('deriv_multi_charts');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch(e) {}
      }
      const savedSymbol = localStorage.getItem('deriv_selected_symbol');
      if (savedSymbol) {
        return [{ id: '1', symbol: savedSymbol, granularitySec: 60 }];
      }
    }
    return [{ id: '1', symbol: "R_100", granularitySec: 60 }];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_multi_charts', JSON.stringify(charts));
      if (charts.length > 0) {
        localStorage.setItem('deriv_selected_symbol', charts[0].symbol);
      }
    }
  }, [charts]);

  const [activeChartId, setActiveChartId] = useState<string>(charts[0]?.id || "1");
  const [maximizedChartId, setMaximizedChartId] = useState<string | null>(null);

  const [layout, setLayout] = useState<LayoutType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('deriv_multi_charts_layout');
      if (saved) return saved as LayoutType;
    }
    return '1';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_multi_charts_layout', layout);
    }
  }, [layout]);

  const setGlobalContext = useAiContext((state) => state.setGlobalContext);

  useEffect(() => {
    const activeChart = charts.find(c => c.id === activeChartId) || charts[0];
    if (activeChart) {
      setGlobalContext(`User is on the Trading Chart page. 
Active Chart Symbol: ${activeChart.symbol}
Timeframe/Granularity: ${activeChart.granularitySec} seconds
Layout: ${layout} grid.
Number of charts on screen: ${charts.length}`);
    }
    return () => setGlobalContext(null);
  }, [activeChartId, charts, layout, setGlobalContext]);

  const activeChart = charts.find(c => c.id === activeChartId) || charts[0];
  const activeSymbol = activeChart?.symbol || "R_100";

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

  const handleContractTypeChange = (newType: ContractSubtype) => {
    setContractType(newType);
    const newConfig = getContractType(newType);
    if (!newConfig.directions.some(d => d.value === direction)) {
      setDirection(newConfig.directions[0].value as TradeInputDirection);
    }
    if (newConfig.defaultDuration) setDuration(newConfig.defaultDuration);
    if (newConfig.defaultDurationUnit) setDurationUnit(newConfig.defaultDurationUnit);
  };

  const [isTradePanelOpen, setIsTradePanelOpen] = useState(true);
  const tradePanelRef = useRef<ImperativePanelHandle>(null);
  const isMobile = useIsMobile();

  const createTrade = useCreateTrade();
  const { data: chartIndicators } = useListIndicators({});
  const { data: mt5Accounts } = useListMt5Accounts();

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

    if (isForex && !mt5AccountId) {
      swalError("EXECUTION FAILED", "Please select an MT5 account to place a Forex trade.");
      return;
    }

    const notes = isOptions ? encodeContractSubtype(contractType) : undefined;

    const payload: any = {
      symbol: activeSymbol,
      type: isOptions ? config.apiType : (isForex ? "forex" : "multiplier"),
      direction: finalDirection,
      stake: isForex ? parseFloat(volume) : parseFloat(stake), 
      targetProfit: takeProfit ? parseFloat(takeProfit) : null,
      aiConfirmed,
      mode: tradeMode,
      notes,
      contractSubtype: isOptions ? contractType : undefined, 
      mt5AccountId: isForex ? mt5AccountId : undefined,
    };

    if (isForex && stopLoss) {
      payload.stopLoss = parseFloat(stopLoss);
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
        swalSuccess("TRADE EXECUTED", `Successfully opened ${finalDirection} on ${activeSymbol}`);
      },
      onError: (err: any) => {
        const errorMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to execute trade";
        swalError("EXECUTION FAILED", errorMsg);
      }
    });
  };

  const handleLayoutChange = (newLayout: LayoutType) => {
    let targetCount = 1;
    if (newLayout === '1') targetCount = 1;
    if (newLayout === '2-h' || newLayout === '2-v') targetCount = 2;
    if (newLayout === '3') targetCount = 3;
    if (newLayout === '4') targetCount = 4;

    const newCharts = [...charts];
    while (newCharts.length < targetCount) {
      newCharts.push({ id: Date.now().toString() + Math.random(), symbol: "R_100", granularitySec: 60 });
    }
    while (newCharts.length > targetCount) {
      newCharts.pop();
    }
    
    setCharts(newCharts);
    setLayout(newLayout);
    if (maximizedChartId) setMaximizedChartId(null);
    
    // Ensure activeChartId is still valid
    if (!newCharts.find(c => c.id === activeChartId)) {
      setActiveChartId(newCharts[0].id);
    }
  };

  const handleCloseChart = (id: string) => {
    // Cannot close if layout demands this many charts, so we just reset it to default
    // Or we dynamically downgrade the layout. Let's downgrade the layout.
    const updated = charts.filter(c => c.id !== id);
    if (updated.length === 0) {
      setCharts([{ id: Date.now().toString(), symbol: "R_100", granularitySec: 60 }]);
      setLayout('1');
    } else {
      setCharts(updated);
      if (activeChartId === id) setActiveChartId(updated[updated.length - 1].id);
      
      // Update layout to match new length
      if (updated.length === 1) setLayout('1');
      if (updated.length === 2 && (layout !== '2-h' && layout !== '2-v')) setLayout('2-h');
      if (updated.length === 3) setLayout('3');
    }
    if (maximizedChartId === id) setMaximizedChartId(null);
  };

  const handleConfigChange = (id: string, updates: Partial<ChartConfig>) => {
    setCharts(charts.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = charts.findIndex(c => c.id === draggedId);
    const targetIndex = charts.findIndex(c => c.id === targetId);

    const newCharts = [...charts];
    const temp = newCharts[draggedIndex];
    newCharts[draggedIndex] = newCharts[targetIndex];
    newCharts[targetIndex] = temp;

    setCharts(newCharts);
    setDraggedId(null);
  };

  const getGridStyle = () => {
    if (maximizedChartId || isMobile) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
    switch (layout) {
      case '1': return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
      case '2-h': return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' };
      case '2-v': return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' };
      case '3': return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }; 
      case '4': return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
      default: return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
    }
  };

  return (
    <AppLayout>
      <div className="w-100 overflow-hidden d-flex flex-column" style={{ height: 'calc(100vh - 3rem)' }}>
        <PanelGroup direction={isMobile ? "vertical" : "horizontal"} className="flex-1 w-100 h-100">
          <Panel defaultSize={75} minSize={30} className="d-flex flex-column bg-background position-relative" style={{ minWidth: 0 }}>
            <div className="d-flex align-items-center px-3 justify-content-between bg-card flex-shrink-0 border-bottom border-secondary" style={{ height: '3rem' }}>
              <div className="d-flex align-items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2 d-flex align-items-center gap-2 hover:bg-muted/50 border border-transparent hover:border-border">
                      <LayoutGrid size={16} className="text-muted-foreground" />
                      <span className="font-bold font-mono uppercase tracking-wider text-xs d-none d-sm-inline">Layout</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2 rounded-none border-border bg-[#0f1318] shadow-2xl z-[1000]" align="start">
                    <div className="grid grid-cols-3 gap-2">
                      <Button variant={layout === '1' ? 'default' : 'outline'} size="icon" onClick={() => handleLayoutChange('1')} className="rounded-none w-100 h-10 border-border">
                        <Square size={16} />
                      </Button>
                      <Button variant={layout === '2-v' ? 'default' : 'outline'} size="icon" onClick={() => handleLayoutChange('2-v')} className="rounded-none w-100 h-10 border-border">
                        <Columns size={16} />
                      </Button>
                      <Button variant={layout === '2-h' ? 'default' : 'outline'} size="icon" onClick={() => handleLayoutChange('2-h')} className="rounded-none w-100 h-10 border-border">
                        <Rows size={16} />
                      </Button>
                      <Button variant={layout === '3' ? 'default' : 'outline'} size="icon" onClick={() => handleLayoutChange('3')} className="rounded-none w-100 h-10 border-border">
                        <Grid3x3 size={16} />
                      </Button>
                      <Button variant={layout === '4' ? 'default' : 'outline'} size="icon" onClick={() => handleLayoutChange('4')} className="rounded-none w-100 h-10 border-border">
                        <Grid2x2 size={16} />
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="d-flex align-items-center gap-4">
                <div className="d-flex align-items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider leading-none">Active Target:</span>
                  <span className="font-mono font-bold text-sm leading-none text-primary bg-primary/10 px-2 py-1 rounded">
                    {activeSymbol}
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

            <div className="flex-1 w-100 h-100 overflow-hidden bg-[#0a0a0a] p-1">
              {maximizedChartId ? (
                <ChartContainer
                  config={charts.find(c => c.id === maximizedChartId)!}
                  isActive={activeChartId === maximizedChartId}
                  isMaximized={true}
                  indicators={chartIndicators || []}
                  onConfigChange={handleConfigChange}
                  onSelect={setActiveChartId}
                  onMaximize={setMaximizedChartId}
                  onRestore={() => setMaximizedChartId(null)}
                  onClose={handleCloseChart}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ) : (
                <div 
                  className="w-100 h-100" 
                  style={{ 
                    display: 'grid', 
                    ...getGridStyle(),
                    gap: '4px' 
                  }}
                >
                  {charts.map((chart, idx) => (
                    <div 
                      key={chart.id} 
                      className="w-100 h-100 overflow-hidden" 
                      style={{ 
                        minHeight: 0,
                        ...(layout === '3' && idx === 2 && !isMobile ? { gridColumn: '1 / span 2' } : {})
                      }}
                    >
                      <ChartContainer
                        config={chart}
                        isActive={activeChartId === chart.id}
                        isMaximized={false}
                        indicators={chartIndicators || []}
                        onConfigChange={handleConfigChange}
                        onSelect={setActiveChartId}
                        onMaximize={setMaximizedChartId}
                        onRestore={() => setMaximizedChartId(null)}
                        onClose={handleCloseChart}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              "bg-card d-flex flex-column flex-shrink-0 transition-all duration-300 ease-in-out border-l border-border",
              !isTradePanelOpen && !isMobile && "d-none"
            )}
          >
            <Tabs defaultValue="trade" className="h-100 d-flex flex-column">
              <div className="border-b border-border p-2 bg-[#0a0d11]">
                <TabsList className="strategy-tabs-list">
                  <TabsTrigger 
                    value="trade" 
                    className="strategy-tab-trigger flex gap-2 items-center"
                    data-tab="trade"
                  >
                    <LineChart size={14} />
                    <span>Trade</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="scanner" 
                    className="strategy-tab-trigger flex gap-2 items-center"
                    data-tab="scanner"
                  >
                    <Radar size={14} />
                    <span>Scanner</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="trade" className="flex-1 overflow-y-auto m-0 data-[state=active]:d-flex flex-column focus-visible:outline-none">
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
                        <Label className="text-xs uppercase font-mono text-muted-foreground">MT5 Account</Label>
                        <Select value={mt5AccountId} onValueChange={setMt5AccountId}>
                          <SelectTrigger className="w-100 h-10 rounded-none border-border bg-background font-mono">
                            <SelectValue placeholder="Select Account" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none border-border bg-[#0f1318] shadow-2xl">
                            {mt5Accounts?.map((acc: any) => (
                              <SelectItem key={acc.id} value={acc.id} className="font-mono text-xs">{acc.name} ({acc.login})</SelectItem>
                            ))}
                            {(!mt5Accounts || mt5Accounts.length === 0) && (
                              <SelectItem value="none" disabled className="font-mono text-xs">No accounts available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <Label className="text-xs uppercase font-mono text-muted-foreground">Take Profit</Label>
                          <Input
                            type="number"
                            value={takeProfit}
                            onChange={(e) => setTakeProfit(e.target.value)}
                            placeholder="0.00"
                            className="rounded-none font-mono h-10 border-border bg-background text-green-500"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-xs uppercase font-mono text-muted-foreground">Stop Loss</Label>
                          <Input
                            type="number"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(e.target.value)}
                            placeholder="0.00"
                            className="rounded-none font-mono h-10 border-border bg-background text-red-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Stake / Volume</Label>
                    <Input
                      type="number"
                      value={tradeClass === "forex" ? volume : stake}
                      onChange={(e) => tradeClass === "forex" ? setVolume(e.target.value) : setStake(e.target.value)}
                      min="1"
                      className="text-2xl font-mono h-14 rounded-none border-border bg-background font-bold"
                      data-testid="input-stake"
                    />
                  </div>

                  {tradeClass === "options" && config.needsBarrier && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase font-mono text-muted-foreground">Barrier Target</Label>
                      <Input
                        value={barrier}
                        onChange={(e) => setBarrier(e.target.value)}
                        placeholder="+0.001"
                        className="rounded-none font-mono h-10 border-border bg-background"
                        data-testid="input-barrier"
                      />
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
                          min="1"
                          className="flex-1 rounded-none font-mono h-10 border-border bg-background"
                          data-testid="input-duration"
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
                        disabled={createTrade.isPending}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
                      >
                        <span>Sell by Market</span>
                      </Button>
                      <Button
                        className="w-100 rounded-none h-14 text-sm uppercase font-bold tracking-widest d-flex flex-column align-items-center justify-content-center gap-1 border-0"
                        style={{ backgroundColor: '#3b82f6', color: 'white' }}
                        onClick={() => handleExecute(TradeInputDirection.buy)}
                        disabled={createTrade.isPending}
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
                      disabled={createTrade.isPending}
                      data-testid="button-execute"
                    >
                      {createTrade.isPending ? 'Executing...' : 'Execute Trade'}
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="scanner" className="flex-1 overflow-y-auto m-0 data-[state=active]:d-flex flex-column focus-visible:outline-none">
                <MarketScannerTab />
              </TabsContent>
            </Tabs>
          </Panel>
        </PanelGroup>
      </div>
    </AppLayout>
  );
}