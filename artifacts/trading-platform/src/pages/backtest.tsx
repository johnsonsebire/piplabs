import React, { useState, useMemo, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListStrategies,
  useRunBacktest,
  useListBacktests,
  getListBacktestsQueryKey,
  BacktestInputTradeType,
  useSearchDerivSymbols,
  getSearchDerivSymbolsQueryKey,
  useDeleteBacktest,
  useListMt5Accounts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { swalSuccess, swalError, swalConfirm, swalWarning, swalInfo } from "@/lib/swal";
import {
  Download, FileText, ChevronRight,
  TrendingUp, TrendingDown, Activity, DollarSign, Target,
  BarChart3, LineChart, Settings, Calendar, Wallet, Clock, Layers, Globe,
  Search, Check, ChevronsUpDown, Trash2
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebounce } from "@/hooks/use-debounce";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ContractTypeSelector } from "@/components/chart/ContractTypeSelector";
import { type ContractSubtype, getContractType, subtypeToBacktestType } from "@/lib/deriv-contract-types";

type SimTrade = {
  id: number; entryAt: string; exitAt: string; direction: string;
  type: string; duration: string; entry: number; exit: number;
  stake: number; pnl: number; outcome: "win" | "loss";
};

type SessionKey = "asian" | "london" | "newyork" | "overlap_london_ny";

type BacktestResults = {
  wins?: number;
  losses?: number;
  tradeType?: string;
  duration?: number;
  durationUnit?: string;
  granularitySec?: number;
  sessions?: SessionKey[];
  sessionMetrics?: Record<string, { totalTrades: number, wins: number, losses: number }>;
  trades?: SimTrade[];
};

const SESSIONS: Array<{ value: SessionKey; label: string; short: string; hours: string }> = [
  { value: "asian",             label: "Asian Session",            short: "ASIA",    hours: "00:00–09:00 UTC" },
  { value: "london",            label: "London Session",           short: "LDN",     hours: "08:00–17:00 UTC" },
  { value: "newyork",           label: "New York Session",         short: "NY",      hours: "13:00–22:00 UTC" },
  { value: "overlap_london_ny", label: "London / NY Overlap",      short: "LDN×NY",  hours: "13:00–17:00 UTC" },
];

function sessionShort(value: SessionKey): string {
  return SESSIONS.find(s => s.value === value)?.short ?? value;
}

const TIMEFRAMES: Array<{ value: number; label: string; short: string }> = [
  { value: 60,    label: "1 Minute",   short: "1M" },
  { value: 120,   label: "2 Minutes",  short: "2M" },
  { value: 180,   label: "3 Minutes",  short: "3M" },
  { value: 300,   label: "5 Minutes",  short: "5M" },
  { value: 600,   label: "10 Minutes", short: "10M" },
  { value: 900,   label: "15 Minutes", short: "15M" },
  { value: 1800,  label: "30 Minutes", short: "30M" },
  { value: 3600,  label: "1 Hour",     short: "1H" },
  { value: 7200,  label: "2 Hours",    short: "2H" },
  { value: 14400, label: "4 Hours",    short: "4H" },
  { value: 28800, label: "8 Hours",    short: "8H" },
  { value: 86400, label: "1 Day",      short: "1D" },
];

function timeframeShort(seconds?: number | null): string {
  if (!seconds) return "AUTO";
  const tf = TIMEFRAMES.find(t => t.value === seconds);
  return tf?.short ?? `${seconds}s`;
}

function parseResults(raw: string | null | undefined): BacktestResults {
  if (!raw) return {};
  try { return JSON.parse(raw) as BacktestResults; } catch { return {}; }
}

const BacktestProgress = ({ bt }: { bt: any }) => {
  const [elapsed, setElapsed] = useState("0s");
  useEffect(() => {
    const interval = setInterval(() => {
      const ms = Date.now() - new Date(bt.createdAt).getTime();
      setElapsed(`${Math.max(0, Math.floor(ms / 1000))}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [bt.createdAt]);

  const logs = useMemo(() => {
    try {
      return bt.progressLogs ? JSON.parse(bt.progressLogs) : [];
    } catch (e) {
      return [];
    }
  }, [bt.progressLogs]);

  // Naive estimate based on elapsed time vs stage. Just a placeholder for estimate.
  // We can just show elapsed time.
  return (
    <div className="mt-2 p-2.5 rounded border border-primary/20 bg-primary/5 flex flex-col gap-1.5 font-mono text-[10px]">
      <div className="flex justify-between items-center text-primary font-bold">
        <span className="animate-pulse">RUNNING SIMULATION...</span>
        <span>Time Spent: {elapsed}</span>
      </div>
      <div className="flex flex-col gap-1 mt-1 pl-1 border-l-2 border-primary/30">
        {logs.map((log: any, i: number) => (
          <div key={i} className={`flex items-start gap-2 ${i === logs.length - 1 ? "text-primary/90" : "text-muted-foreground opacity-60"}`}>
            <span className="shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span>{log.stage}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-muted-foreground opacity-60 italic">Waiting for engine to start...</div>
        )}
      </div>
    </div>
  );
};

function downloadCsv(filename: string, rows: SimTrade[]) {
  const header = ["id","entryAt","exitAt","direction","type","duration","entry","exit","stake","pnl","outcome"];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map(r => header.map(h => escape((r as any)[h])).join(",")).join("\n");
  const csv = `${header.join(",")}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPdfReport(bt: any, results: BacktestResults) {
  const doc = new jsPDF();
  const rows = results.trades || [];
  
  doc.setFontSize(18);
  doc.text(`Backtest Report: #${bt.id}`, 14, 22);
  
  doc.setFontSize(11);
  doc.text(`Symbol: ${bt.symbol}`, 14, 30);
  doc.text(`Win Rate: ${bt.winRate?.toFixed(1) ?? "-"}%`, 14, 36);
  doc.text(`Net P&L: ${bt.totalPnl >= 0 ? "+" : ""}$${bt.totalPnl?.toFixed(2) ?? "0.00"}`, 14, 42);

  let finalY = 52;

  // Session Metrics Table
  if (results.sessionMetrics) {
    doc.text("Per-Session Metrics", 14, finalY);
    
    // Sort so it's consistent
    const sessionData = Object.entries(results.sessionMetrics).map(([session, metrics]) => [
      sessionShort(session as SessionKey),
      metrics.totalTrades.toString(),
      metrics.wins.toString(),
      metrics.losses.toString()
    ]);
    
    autoTable(doc, {
      startY: finalY + 4,
      head: [["Session", "Trades", "Wins", "Losses"]],
      body: sessionData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });
    finalY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Trades Table
  doc.text("Trades Log", 14, finalY);
  
  autoTable(doc, {
    startY: finalY + 4,
    head: [["#", "Entry", "Exit", "Dir", "Type", "Dur", "Entry Px", "Exit Px", "Stake", "P&L", "Outcome"]],
    body: rows.map(r => [
      r.id.toString(),
      new Date(r.entryAt).toLocaleString(),
      new Date(r.exitAt).toLocaleString(),
      r.direction,
      r.type,
      r.duration,
      r.entry.toFixed(4),
      r.exit.toFixed(4),
      `$${r.stake.toFixed(2)}`,
      `${r.pnl >= 0 ? "+" : ""}$${r.pnl.toFixed(2)}`,
      r.outcome.toUpperCase()
    ]),
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });

  doc.save(`backtest_${bt.id}.pdf`);
}

export default function BacktestPage() {
  const { data: strategies } = useListStrategies({});
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [selectedBacktestId, setSelectedBacktestId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const backtestParams = { strategyId: selectedStrategy ? parseInt(selectedStrategy) : undefined };
  const { data: backtests, isLoading: isResultsLoading } = useListBacktests({}, {
    query: {
      refetchInterval: (query) => {
        const data = query.state?.data as any[];
        const isRunning = Array.isArray(data) && data.some((b: any) => b.status === "running");
        return isRunning ? 2000 : false;
      },
      queryKey: getListBacktestsQueryKey(backtestParams)
    }
  });

  const runBacktest = useRunBacktest();
  const deleteBacktest = useDeleteBacktest();

  const handleDeleteBacktest = async (id: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    const confirmed = await swalConfirm(
      "Delete backtest run?",
      `This will permanently remove backtest run #${id} and its cached replay data from the server.`,
      "Yes, delete it"
    );
    if (!confirmed) return;

    try {
      await deleteBacktest.mutateAsync({ id });
      swalSuccess("Deleted!", `Backtest run #${id} has been removed successfully.`);
      queryClient.invalidateQueries({ queryKey: ["/api/backtests"] });
      if (selectedBacktestId === id) {
        setSelectedBacktestId(null);
      }
    } catch (err: any) {
      swalError("Failed to delete", err.message || "An unexpected error occurred.");
    }
  };
  
  const [openSearch, setOpenSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: isSearching } = useSearchDerivSymbols(
    { q: debouncedSearchQuery },
    { query: { queryKey: getSearchDerivSymbolsQueryKey({ q: debouncedSearchQuery }) } }
  );
  
  const { data: mt5Accounts } = useListMt5Accounts();
  const queryClient = useQueryClient();

  const { data: datasets } = useQuery({
    queryKey: ["datasets", "backtests"],
    queryFn: async () => {
      const res = await fetch("/api/datasets/backtests");
      if (!res.ok) return [];
      return res.json() as Promise<string[]>;
    }
  });

  const [dataSource, setDataSource] = useState<"deriv" | "local">("deriv");
  const [selectedDataset, setSelectedDataset] = useState<string>("");

  const [multiTimeframeMode, setMultiTimeframeMode] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<number>(300);
  const [selectedTimeframes, setSelectedTimeframes] = useState<Set<number>>(new Set([60, 300, 900, 3600]));
  const [selectedSessions, setSelectedSessions] = useState<Set<SessionKey>>(new Set());

  const [formData, setFormData] = useState({
    symbol: "R_100",
    fromDate: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    initialBalance: "10000",
    stakePerTrade: "1",
    tradeClass: "options" as "options" | "multiplier" | "forex",
    tradeType: "RISE_FALL" as ContractSubtype,
    duration: "5",
    durationUnit: "m",
    alternateDirection: false,
    mt5AccountId: "",
  });

  const handleViewChart = (trade: SimTrade, backtestId: number) => {
    setLocation(`/backtest/chart?backtestId=${backtestId}&tradeId=${trade.id}`);
  };

  const toggleTimeframe = (tfValue: number) => {
    setSelectedTimeframes(prev => {
      const next = new Set(prev);
      if (next.has(tfValue)) next.delete(tfValue);
      else next.add(tfValue);
      return next;
    });
  };

  const toggleSession = (s: SessionKey) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/datasets/backtests/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      const data = await res.json();
      swalSuccess("Dataset Uploaded", "Your CSV dataset has been uploaded successfully.");
      await queryClient.invalidateQueries({ queryKey: ["datasets", "backtests"] });
      setSelectedDataset(data.filename);
      e.target.value = "";
    } catch (err: any) {
      swalError("Upload Failed", err.message || "An unexpected error occurred during upload.");
    }
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStrategy) {
      swalWarning("Select Strategy", "Please select a strategy first before running a backtest.");
      return;
    }

    const timeframesToRun = multiTimeframeMode ? Array.from(selectedTimeframes).sort((a, b) => a - b) : [selectedTimeframe];
    if (timeframesToRun.length === 0) {
      swalWarning("Select Timeframe", "Please select at least one timeframe.");
      return;
    }

    const sessionsArr = Array.from(selectedSessions);
    const baseData = {
      strategyId: parseInt(selectedStrategy),
      symbol: dataSource === "local" ? (selectedDataset || "CSV") : formData.symbol,
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      initialBalance: parseFloat(formData.initialBalance),
      stakePerTrade: parseFloat(formData.stakePerTrade),
      tradeType: formData.tradeClass === "options" ? subtypeToBacktestType(formData.tradeType) : formData.tradeClass as any,
      contractSubtype: formData.tradeClass === "options" ? formData.tradeType : undefined,
      duration: parseInt(formData.duration),
      durationUnit: formData.durationUnit as any,
      sessions: sessionsArr.length > 0 ? sessionsArr : null,
      datasetFile: dataSource === "local" ? selectedDataset : null,
      alternateDirection: formData.alternateDirection,
      mt5AccountId: formData.tradeClass === "forex" ? formData.mt5AccountId : undefined,
    };

    if (timeframesToRun.length > 1) {
      swalInfo("Simulating Backtests", `Running ${timeframesToRun.length} backtests in parallel for timeframes: ${timeframesToRun.map(timeframeShort).join(", ")}`);
    }

    const promises = timeframesToRun.map(granularitySec =>
      runBacktest.mutateAsync({ data: { ...baseData, granularitySec } as any })
      .catch((err: any) => {
        swalError("Simulation Failed", `Backtest failed for ${timeframeShort(granularitySec)}: ${err?.message || "Internal engine error"}`);
        return null;
      })
    );

    await Promise.all(promises);
    queryClient.invalidateQueries({ queryKey: ["/api/backtests"] });
    swalSuccess("Backtest Initiated", timeframesToRun.length > 1 ? "All parallel backtest processes have been successfully initiated!" : "The backtest process has been successfully initiated!");
  };

  const selectedBt = backtests?.find(b => b.id === selectedBacktestId);
  const selectedBtResults = selectedBt ? parseResults(selectedBt.results) : null;
  const selectedBtTrades = selectedBtResults?.trades ?? [];

  const selectedBtStats = useMemo(() => {
    let winBuyCount = 0; let winBuyPnl = 0;
    let loseBuyCount = 0; let loseBuyPnl = 0;
    let winSellCount = 0; let winSellPnl = 0;
    let loseSellCount = 0; let loseSellPnl = 0;

    for (const t of selectedBtTrades) {
      const isWin = t.outcome === "win";
      const isCall = t.direction === "CALL";
      
      if (isCall) {
        if (isWin) { winBuyCount++; winBuyPnl += t.pnl; }
        else { loseBuyCount++; loseBuyPnl += t.pnl; }
      } else {
        if (isWin) { winSellCount++; winSellPnl += t.pnl; }
        else { loseSellCount++; loseSellPnl += t.pnl; }
      }
    }

    return {
      winBuyCount, winBuyPnl: Math.round(winBuyPnl * 100) / 100,
      loseBuyCount, loseBuyPnl: Math.round(loseBuyPnl * 100) / 100,
      winSellCount, winSellPnl: Math.round(winSellPnl * 100) / 100,
      loseSellCount, loseSellPnl: Math.round(loseSellPnl * 100) / 100,
    };
  }, [selectedBtTrades]);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 mx-auto mt-4 bg-[#0A0D14] text-foreground" style={{ minWidth: '60vw', width: '85vw', maxWidth: '100%' }}>
        <div className="flex-1 overflow-hidden grid grid-cols-12 gap-0 divide-x divide-border/30 rounded-xl border border-border/50 shadow-2xl">
          
          {/* COLUMN 1: CONFIGURATION (Span 4) */}
          <div className="col-span-4 min-w-0 flex flex-col h-full bg-[#0E121B]/90 overflow-hidden backdrop-blur-sm">
            <div className="p-3 border-b border-border/30 bg-[#121824]/40 shrink-0 gap-2" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <Settings className="h-3.5 w-3.5 text-primary shrink-0" style={{ display: 'block' }} />
              <div className="text-xs font-bold font-mono uppercase tracking-wider text-foreground m-0 leading-none">Configuration</div>
            </div>
            
            <form onSubmit={handleRun} className="flex-1 overflow-y-auto p-3 space-y-4 hide-scrollbar text-xs">
              <div className="flex flex-col w-full" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <Label className="text-[9px] uppercase font-mono text-muted-foreground tracking-wider flex flex-row items-center gap-1.5" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                  <Target className="h-3 w-3 shrink-0" style={{ display: 'block' }} /> <span className="mt-0.5" style={{ display: 'block' }}>Strategy</span>
                </Label>
                <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                  <SelectTrigger className="w-full h-12 rounded-none border-border/40 bg-background/50 font-mono text-[11px] focus:ring-1 focus:ring-primary/40" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }}>
                    <SelectValue placeholder="Select Strategy" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border bg-[#0E121B]">
                    {Array.isArray(strategies) ? strategies.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()} className="font-mono text-xs uppercase hover:bg-primary/10">{s.name}</SelectItem>
                    )) : null}
                  </SelectContent>
                </Select>
              </div>

              {/* Timeframe section */}
              <div className="p-2.5 bg-[#121824]/30 border border-border/20 relative">
                <div className="flex flex-row items-center justify-between mb-2" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="flex flex-row items-center gap-1.5" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <Clock className="h-3 w-3 text-primary shrink-0" style={{ display: 'block' }} />
                    <div className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider m-0 mt-0.5 leading-none">Timeframe</div>
                  </div>
                  <Button type="button" size="sm" variant={multiTimeframeMode ? "default" : "secondary"} onClick={() => setMultiTimeframeMode(m => !m)} className="h-6 text-[9px] px-2 font-mono uppercase tracking-wider rounded-sm">
                    {multiTimeframeMode ? "Multi" : "Single"}
                  </Button>
                </div>
                {!multiTimeframeMode ? (
                  <Select value={String(selectedTimeframe)} onValueChange={(v) => setSelectedTimeframe(parseInt(v))}>
                    <SelectTrigger className="w-full h-12 rounded-none border-border/40 bg-background/40 font-mono text-[11px]" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border bg-[#0E121B] max-h-60">
                      {TIMEFRAMES.map(tf => <SelectItem key={tf.value} value={String(tf.value)} className="font-mono text-xs uppercase">{tf.short} — {tf.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="grid grid-cols-4 gap-1">
                    {TIMEFRAMES.map(tf => (
                      <button key={tf.value} type="button" onClick={() => toggleTimeframe(tf.value)} className={`h-5 text-[8px] font-mono uppercase font-bold border ${selectedTimeframes.has(tf.value) ? "bg-primary text-primary-foreground border-primary" : "bg-background/20 text-muted-foreground border-border/30 hover:border-primary/30"}`}>
                        {tf.short}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Trade Settings */}
              <div className="p-2.5 bg-[#121824]/30 border border-border/20">
                <div className="flex flex-row items-center gap-1.5 mb-2" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                  <Activity className="h-3 w-3 text-primary shrink-0" style={{ display: 'block' }} />
                  <div className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider m-0 mt-0.5 leading-none">Trade Settings</div>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    <Button
                      type="button"
                      variant={formData.tradeClass === "options" ? "default" : "outline"}
                      className={`h-7 rounded-none uppercase font-bold text-[9px] tracking-wider px-1 ${formData.tradeClass === "options" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border/50'}`}
                      onClick={() => setFormData({...formData, tradeClass: "options"})}
                    >
                      Options
                    </Button>
                    <Button
                      type="button"
                      variant={formData.tradeClass === "multiplier" ? "default" : "outline"}
                      className={`h-7 rounded-none uppercase font-bold text-[9px] tracking-wider px-1 ${formData.tradeClass === "multiplier" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border/50'}`}
                      onClick={() => setFormData({...formData, tradeClass: "multiplier"})}
                    >
                      Multiplier
                    </Button>
                    <Button
                      type="button"
                      variant={formData.tradeClass === "forex" ? "default" : "outline"}
                      className={`h-7 rounded-none uppercase font-bold text-[9px] tracking-wider px-1 ${formData.tradeClass === "forex" ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary border-border/50'}`}
                      onClick={() => setFormData({...formData, tradeClass: "forex"})}
                    >
                      Forex
                    </Button>
                  </div>

                  {formData.tradeClass === "options" && (
                    <ContractTypeSelector 
                      value={formData.tradeType} 
                      onChange={(v) => setFormData({ ...formData, tradeType: v })} 
                      compact 
                    />
                  )}

                  {formData.tradeClass === "forex" && (
                    <Select value={formData.mt5AccountId} onValueChange={(v: string) => setFormData({...formData, mt5AccountId: v})}>
                      <SelectTrigger className="w-full rounded-none border-border/40 bg-background/40 font-mono text-[10px]" style={{ height: '36px' }}>
                        <SelectValue placeholder="Select MT5 Account" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border bg-[#0E121B]">
                        {mt5Accounts?.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id} className="mt5-account-item font-mono text-[10px] uppercase cursor-pointer rounded-none border-b border-[#1a2332] last:border-0">
                            {acc.name} - {acc.broker} ({acc.login})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {formData.tradeClass !== "forex" && (
                    <div className="flex flex-row items-center gap-1 flex-nowrap w-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.25rem', flexWrap: 'nowrap' }}>
                      <Input type="number" required value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} className="rounded-none font-mono border-border/40 bg-background/40 text-[11px] px-2 text-left" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', width: '60%', boxSizing: 'border-box' }} />
                      <Select value={formData.durationUnit} onValueChange={(v) => setFormData({ ...formData, durationUnit: v })}>
                        <SelectTrigger className="rounded-none border-border/40 bg-background/40 font-mono text-[10px]" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', width: '40%', boxSizing: 'border-box' }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border-border bg-[#0E121B]">
                          <SelectItem value="t" className="font-mono text-[10px] uppercase">Ticks</SelectItem>
                          <SelectItem value="s" className="font-mono text-[10px] uppercase">Sec</SelectItem>
                          <SelectItem value="m" className="font-mono text-[10px] uppercase">Min</SelectItem>
                          <SelectItem value="h" className="font-mono text-[10px] uppercase">Hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex flex-row items-center justify-between w-full p-2 bg-background/20 border border-border/30 mt-2">
                    <div className="flex flex-col gap-0.5">
                      <Label htmlFor="alternateDirection" className="text-[10px] uppercase font-mono text-foreground cursor-pointer font-bold tracking-wider">Alternate Direction</Label>
                      <span className="text-[8px] text-muted-foreground font-mono">Forces strict CALL/PUT alternation</span>
                    </div>
                    <Switch
                      id="alternateDirection"
                      checked={formData.alternateDirection}
                      onCheckedChange={(checked) => setFormData({ ...formData, alternateDirection: checked })}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Data Source & Market */}
              <div className="p-2.5 bg-[#121824]/30 border border-border/20 space-y-2">
                <div className="flex flex-row items-center gap-1.5 mb-1" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                  <Globe className="h-3 w-3 text-primary shrink-0" style={{ display: 'block' }} />
                  <div className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider m-0 mt-0.5 leading-none">Data & Market</div>
                </div>
                <div className="grid grid-cols-2 gap-1 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.25rem' }}>
                  <Select value={dataSource} onValueChange={(v: "deriv" | "local") => setDataSource(v)}>
                    <SelectTrigger className="w-full h-12 rounded-none border-border/40 bg-background/40 font-mono text-[10px]" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border bg-[#0E121B]">
                      <SelectItem value="deriv" className="font-mono text-[10px] uppercase">Deriv API</SelectItem>
                      <SelectItem value="local" className="font-mono text-[10px] uppercase">Local CSV</SelectItem>
                    </SelectContent>
                  </Select>
                  {dataSource === "local" ? (
                    <div className="space-y-1.5 w-full">
                      <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                        <SelectTrigger className="w-full h-7 rounded-none border-border/40 bg-background/40 font-mono text-[10px]" style={{ height: '28px' }}>
                          <SelectValue placeholder="Select CSV File" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border-border bg-[#0E121B]">
                          {Array.isArray(datasets) && datasets.map(d => <SelectItem key={d} value={d} className="font-mono text-[10px]">{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="border border-dashed border-border/30 p-2 text-center relative bg-background/10 hover:bg-background/20 transition-all cursor-pointer">
                        <Label className="cursor-pointer font-mono text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                          <Download className="h-3 w-3" /> Upload CSV
                        </Label>
                        <input type="file" accept=".csv" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </div>
                    </div>
                  ) : (
                    <Popover open={openSearch} onOpenChange={setOpenSearch}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openSearch}
                          className="w-full justify-between h-12 rounded-none border-border/40 bg-background/40 font-mono px-2 hover:bg-muted/50 text-[10px]"
                          style={{ height: '48px', minHeight: '48px', maxHeight: '48px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', boxSizing: 'border-box' }}
                        >
                          <div className="flex items-center gap-1 truncate">
                            <span className="truncate">{formData.symbol || "Select Market..."}</span>
                          </div>
                          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" style={{ display: 'block' }} />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 rounded-none border-border bg-[#0f1318] shadow-2xl z-[1000]" align="start" style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '80%', backgroundColor: '#0f1318', borderRadius: 0, border: '1px solid #1a2332' }}>
                      <Command shouldFilter={false} className="bg-transparent">
                        <CommandInput
                          placeholder="Search pairs..."
                          className="font-mono text-[11px] h-9 focus:ring-0 focus:outline-none bg-transparent"
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList style={{ maxHeight: '180px', overflowY: 'auto', borderTop: '1px solid #1a2332', backgroundColor: '#0f1318' }}>
                          {isSearching && <div className="py-2 text-center text-[10px] font-mono text-muted-foreground animate-pulse">Searching...</div>}
                          {!isSearching && (!searchResults || searchResults.length === 0) && (
                            <CommandEmpty className="py-2 text-center text-[10px] font-mono text-muted-foreground">No symbols found.</CommandEmpty>
                          )}
                          <CommandGroup className="bg-[#0f1318]">
                            {Array.isArray(searchResults) && searchResults.map((item) => (
                              <CommandItem
                                key={item.symbol}
                                value={item.symbol}
                                onSelect={() => {
                                  setFormData({ ...formData, symbol: item.symbol });
                                  setOpenSearch(false);
                                  setSearchQuery("");
                                }}
                                className="font-mono text-[11px] cursor-pointer py-1 px-2 aria-selected:bg-primary/10 aria-selected:text-primary"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex flex-col">
                                    <span className="font-bold">{item.symbol}</span>
                                    <span className="text-[8px] text-muted-foreground">{item.displayName}</span>
                                  </div>
                                  {formData.symbol === item.symbol && <Check className="h-3 w-3 text-primary" />}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

              {/* Capital & Period */}
              <div className="p-2.5 bg-[#121824]/30 border border-border/20 space-y-2">
                <div className="flex flex-row items-center justify-between mb-1" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="flex flex-row items-center gap-1.5" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <Calendar className="h-3 w-3 text-primary shrink-0" style={{ display: 'block' }} />
                    <div className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider m-0 mt-0.5 leading-none">Date Period</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
                  <div className="flex flex-col gap-1 w-full">
                    <Label className="text-[9px] uppercase font-mono text-muted-foreground ml-1">From</Label>
                    <Input type="date" required value={formData.fromDate} onChange={e => setFormData({...formData, fromDate: e.target.value})} className="h-12 w-full rounded-none font-mono border-border/40 bg-background/40 text-[9px] px-2" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }} />
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    <Label className="text-[9px] uppercase font-mono text-muted-foreground ml-1">To</Label>
                    <Input type="date" required value={formData.toDate} onChange={e => setFormData({...formData, toDate: e.target.value})} className="h-12 w-full rounded-none font-mono border-border/40 bg-background/40 text-[9px] px-2" style={{ height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                
                <div className="flex flex-row items-center gap-1.5 pt-2 mb-1 border-t border-border/10" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                  <Wallet className="h-3 w-3 text-primary shrink-0" style={{ display: 'block' }} />
                  <div className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider m-0 mt-0.5 leading-none">Capital & Stake</div>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
                  <div className="flex flex-col gap-1 w-full">
                    <Label className="text-[9px] uppercase font-mono text-muted-foreground ml-1">Capital</Label>
                    <div className="flex flex-row items-center justify-between bg-background/40 border border-border/40 h-12 w-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }}>
                      <Input type="number" required value={formData.initialBalance} onChange={e => setFormData({...formData, initialBalance: e.target.value})} className="h-full w-full rounded-none font-mono border-0 bg-transparent text-[11px] focus:ring-0 focus-visible:ring-0 px-2 p-0 m-0" style={{ border: 'none', outline: 'none' }} />
                      <span className="text-[9px] text-muted-foreground px-3 shrink-0 border-l border-border/20 h-full flex items-center justify-center" style={{ display: 'flex' }}>$</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    <Label className="text-[9px] uppercase font-mono text-muted-foreground ml-1">Stake</Label>
                    <div className="flex flex-row items-center justify-between bg-background/40 border border-border/40 h-12 w-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: '48px', minHeight: '48px', maxHeight: '48px', boxSizing: 'border-box' }}>
                      <Input type="number" step="0.01" required value={formData.stakePerTrade} onChange={e => setFormData({...formData, stakePerTrade: e.target.value})} className="h-full w-full rounded-none font-mono border-0 bg-transparent text-[11px] focus:ring-0 focus-visible:ring-0 px-2 p-0 m-0" style={{ border: 'none', outline: 'none' }} />
                      <span className="text-[9px] text-muted-foreground px-3 shrink-0 border-l border-border/20 h-full flex items-center justify-center" style={{ display: 'flex' }}>$</span>
                    </div>
                  </div>
                </div>
              </div>
            </form>
            
            <div className="p-3 border-t border-border/30 bg-[#0E121B] shrink-0">
              <Button type="submit" onClick={handleRun} disabled={runBacktest.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-8 text-[10px] shadow-lg shadow-primary/10">
                {runBacktest.isPending ? "Simulating..." : "Run Backtest"}
              </Button>
            </div>
          </div>

          {/* COLUMN 2: BACKTEST LIST (Span 8) */}
          <div className="col-span-8 min-w-0 flex flex-col h-full bg-[#0A0D14] overflow-hidden">
            <div className="p-3 border-b border-border/30 bg-[#121824]/40 shrink-0 flex flex-row items-center justify-between" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="flex flex-row items-center gap-2" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 className="h-3.5 w-3.5 text-primary shrink-0" style={{ display: 'block' }} />
                <div className="text-xs font-bold font-mono uppercase tracking-wider text-foreground m-0 leading-none">History</div>
              </div>
              <span className="text-[9px] font-mono text-muted-foreground bg-[#1E293B] px-1.5 py-0.5 border border-border/30">{backtests?.length || 0} Runs</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2 hide-scrollbar">
              {isResultsLoading ? (
                <div className="p-8 text-center text-xs font-mono uppercase text-muted-foreground animate-pulse">Loading...</div>
              ) : !backtests || backtests.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono uppercase text-muted-foreground">No backtests found</div>
              ) : (
                backtests.map(bt => {
                  const isSelected = selectedBacktestId === bt.id;
                  const res = parseResults(bt.results);
                  return (
                    <div 
                      key={bt.id} 
                      className={`group relative border transition-all rounded-none ${isSelected ? 'bg-primary/5 border-primary shadow-sm' : 'bg-[#111520]/60 border-border/30 hover:border-primary/40'}`}
                    >
                      <div className="p-2.5 cursor-pointer" onClick={() => setSelectedBacktestId(isSelected ? null : bt.id)}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-[11px] font-mono text-primary uppercase">#{bt.id} · {bt.symbol}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1 py-0.2 text-[8px] font-mono uppercase font-bold border ${bt.status === 'completed' ? 'text-primary border-primary/20 bg-primary/5' : bt.status === 'failed' ? 'text-destructive border-destructive/25 bg-destructive/5' : 'text-yellow-500 border-yellow-500/25 bg-yellow-500/5'}`}>
                              {bt.status}
                            </span>
                            <button
                              onClick={(e) => handleDeleteBacktest(bt.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5"
                              title="Delete backtest"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="px-1.5 py-0.2 text-[8px] font-mono uppercase bg-muted/30 text-muted-foreground border border-border/30">
                            {timeframeShort(res.granularitySec)}
                          </span>
                          <span className="text-[9px] font-mono uppercase text-muted-foreground truncate max-w-[160px]">{res.tradeType} · {res.duration}{res.durationUnit}</span>
                        </div>
                        {bt.status === "running" ? (
                          <BacktestProgress bt={bt} />
                        ) : (
                          <div className="flex flex-col gap-1 pt-1.5 border-t border-border/10">
                            <div className="flex justify-between items-center w-full">
                              <span className="text-[9px] uppercase font-mono text-muted-foreground">Win Rate</span>
                              <span className="text-[10px] font-bold font-mono">{bt.winRate != null ? `${bt.winRate.toFixed(1)}%` : '-'}</span>
                            </div>
                            <div className="flex justify-between items-center w-full">
                              <span className="text-[9px] uppercase font-mono text-muted-foreground">P&L</span>
                              <span className={`text-[10px] font-bold font-mono ${bt.totalPnl && bt.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {bt.totalPnl != null ? `${bt.totalPnl >= 0 ? '+' : ''}$${bt.totalPnl.toFixed(2)}` : '-'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {isSelected && selectedBt && (
                        <div className="border-t border-primary/20 bg-[#0A0D14] flex flex-col">
                          <div className="p-3 border-b border-border/30 bg-[#121824]/40 shrink-0">
                            <div className="flex items-center justify-between mb-3">
                              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                <Target className="h-3.5 w-3.5 text-primary" /> Details #{selectedBt.id}
                              </h2>
                              <div className="flex gap-1.5">
                                <Link href={`/backtest/${selectedBt.id}/replay`}>
                                  <Button variant="outline" className="h-6.5 text-[9px] font-mono font-bold uppercase border-primary/40 text-primary hover:bg-primary/10 rounded-none px-2" title="Visual Replay">
                                    <Activity className="h-3 w-3 mr-1 animate-pulse" /> Replay
                                  </Button>
                                </Link>
                                <Button size="icon" variant="outline" onClick={() => downloadCsv(`bt-${selectedBt.id}.csv`, selectedBtTrades)} className="h-6.5 w-6.5 rounded-none border-border/40" title="Download CSV">
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="outline" onClick={() => downloadPdfReport(selectedBt, selectedBtResults!)} className="h-6.5 w-6.5 rounded-none border-border/40" title="Download PDF Report">
                                  <FileText className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="outline" onClick={(e) => handleDeleteBacktest(selectedBt.id, e)} className="h-6.5 w-6.5 rounded-none border-destructive/40 text-destructive hover:bg-destructive/10" title="Delete Backtest">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 mt-2">
                              <div className="bg-[#111520] border border-border/20 p-3 rounded flex flex-col justify-between">
                                <span className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Win Rate</span>
                                <span className="text-lg font-bold font-mono text-primary">{selectedBt.winRate?.toFixed(1)}%</span>
                              </div>
                              <div className="bg-[#111520] border border-border/20 p-3 rounded flex flex-col justify-between">
                                <span className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Net P&L</span>
                                <span className={`text-lg font-bold font-mono ${selectedBt.totalPnl! >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                  {selectedBt.totalPnl! >= 0 ? '+' : ''}${selectedBt.totalPnl?.toFixed(2)}
                                </span>
                              </div>
                              <div className="bg-[#111520] border border-border/20 p-3 rounded flex flex-col justify-between">
                                <span className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Total Trades</span>
                                <span className="text-lg font-bold font-mono">{selectedBt.totalTrades}</span>
                              </div>
                              <div className="bg-[#111520] border border-border/20 p-3 rounded flex flex-col justify-between">
                                <span className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Max Drawdown</span>
                                <span className="text-lg font-bold font-mono text-destructive">{selectedBt.maxDrawdown?.toFixed(1)}%</span>
                              </div>
                            </div>

                            {selectedBtResults?.sessionMetrics && (
                              <div className="bg-[#111520] border border-border/20 p-4 mb-4 font-mono text-xs rounded">
                                <div className="text-muted-foreground uppercase font-bold tracking-wider mb-3 border-b border-border/10 pb-2">
                                  Per-Session Performance
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                  {Object.entries(selectedBtResults.sessionMetrics).map(([session, metrics]) => (
                                    <div key={session} className="flex flex-col bg-background/50 p-2 rounded border border-border/5">
                                      <span className="text-[9px] uppercase text-muted-foreground font-bold mb-1">{sessionShort(session as SessionKey)}</span>
                                      <div className="flex justify-between items-center mt-1">
                                        <span className="text-[10px]">Trades</span>
                                        <span className="text-[10px] font-bold">{metrics.totalTrades}</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-[#10b981]">Wins</span>
                                        <span className="text-[10px] font-bold text-[#10b981]">{metrics.wins}</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-[#ef4444]">Losses</span>
                                        <span className="text-[10px] font-bold text-[#ef4444]">{metrics.losses}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {selectedBtTrades.length > 0 && (
                              <div className="bg-[#111520] border border-border/20 p-4 mb-4 font-mono text-xs rounded">
                                <div className="text-muted-foreground uppercase font-bold tracking-wider mb-3 border-b border-border/10 pb-2">
                                  Buy/Sell Setup Performance Breakdown
                                </div>
                                <div className="grid grid-cols-2 gap-4 w-full">
                                  <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                                    <span className="text-[#10b981] font-bold text-[10px]">WINNING BUY (CALL)</span>
                                    <span className="text-white font-bold text-right text-[10px]">{selectedBtStats.winBuyCount} <span className="text-muted-foreground ml-1">(${selectedBtStats.winBuyPnl.toFixed(2)})</span></span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                                    <span className="text-[#10b981] font-bold text-[10px]">WINNING SELL (PUT)</span>
                                    <span className="text-white font-bold text-right text-[10px]">{selectedBtStats.winSellCount} <span className="text-muted-foreground ml-1">(${selectedBtStats.winSellPnl.toFixed(2)})</span></span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                                    <span className="text-[#ef4444] font-bold text-[10px]">LOSING BUY (CALL)</span>
                                    <span className="text-white font-bold text-right text-[10px]">{selectedBtStats.loseBuyCount} <span className="text-muted-foreground ml-1">(${selectedBtStats.loseBuyPnl.toFixed(2)})</span></span>
                                  </div>
                                  <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                                    <span className="text-[#ef4444] font-bold text-[10px]">LOSING SELL (PUT)</span>
                                    <span className="text-white font-bold text-right text-[10px]">{selectedBtStats.loseSellCount} <span className="text-muted-foreground ml-1">(${selectedBtStats.loseSellPnl.toFixed(2)})</span></span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {selectedBt.errorMessage && (
                              <div className="p-2 bg-destructive/10 border border-destructive/20 text-destructive text-[9px] font-mono leading-relaxed">
                                <span className="font-bold uppercase block mb-0.5">Error Details:</span> {selectedBt.errorMessage}
                              </div>
                            )}
                          </div>

                          <div className="flex-1 overflow-auto bg-[#0A0D14] max-h-[400px]">
                            {selectedBtTrades.length === 0 ? (
                              <div className="p-8 text-center text-xs font-mono uppercase text-muted-foreground opacity-50">No trades executed</div>
                            ) : (
                              <table className="w-full text-xs font-mono text-left whitespace-nowrap border-collapse">
                                <thead className="bg-[#121824] sticky top-0 z-10 shadow-sm">
                                  <tr>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase border-b border-border/30 tracking-wider">#</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase border-b border-border/30 tracking-wider">Dir</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-right border-b border-border/30 tracking-wider">Entry Date</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-right border-b border-border/30 tracking-wider">Entry Time</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-right border-b border-border/30 tracking-wider">Exit Date</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-right border-b border-border/30 tracking-wider">Exit Time</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-right border-b border-border/30 tracking-wider">Entry</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-right border-b border-border/30 tracking-wider">P&L</th>
                                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-center border-b border-border/30 tracking-wider">Chart</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10 bg-[#0A0D14]">
                                  {selectedBtTrades.map(t => (
                                    <tr key={t.id} className="hover:bg-[#1A2235] transition-colors">
                                      <td className="px-4 py-2.5 text-muted-foreground">{t.id}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`font-bold ${t.direction === "CALL" ? "text-primary bg-primary/10 px-2 py-0.5 rounded-sm" : "text-destructive bg-destructive/10 px-2 py-0.5 rounded-sm"}`}>{t.direction}</span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right text-muted-foreground">{new Date(t.entryAt).toLocaleDateString()}</td>
                                      <td className="px-4 py-2.5 text-right">{new Date(t.entryAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
                                      <td className="px-4 py-2.5 text-right text-muted-foreground">{t.exitAt ? new Date(t.exitAt).toLocaleDateString() : '-'}</td>
                                      <td className="px-4 py-2.5 text-right">{t.exitAt ? new Date(t.exitAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : '-'}</td>
                                      <td className="px-4 py-2.5 text-right">{t.entry.toFixed(4)}</td>
                                      <td className={`px-4 py-2.5 text-right font-bold ${t.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary rounded" onClick={() => handleViewChart(t, selectedBt.id)}>
                                          <LineChart className="h-4 w-4" />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
