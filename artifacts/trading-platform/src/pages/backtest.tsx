import { useState, useMemo } from "react";
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
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function printPdf(title: string, rows: SimTrade[]) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const total = rows.reduce((a, r) => a + r.pnl, 0);
  const wins = rows.filter(r => r.outcome === "win").length;
  const losses = rows.length - wins;
  const rowHtml = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${new Date(r.entryAt).toLocaleString()}</td>
      <td>${new Date(r.exitAt).toLocaleString()}</td>
      <td>${r.direction}</td>
      <td>${r.type}</td>
      <td>${r.duration}</td>
      <td style="text-align:right">${r.entry.toFixed(4)}</td>
      <td style="text-align:right">${r.exit.toFixed(4)}</td>
      <td style="text-align:right">$${r.stake.toFixed(2)}</td>
      <td style="text-align:right;color:${r.pnl >= 0 ? "#0a7a3a" : "#a8312a"}">${r.pnl >= 0 ? "+" : ""}$${r.pnl.toFixed(2)}</td>
      <td>${r.outcome.toUpperCase()}</td>
    </tr>`).join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:ui-monospace,Menlo,monospace;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      .meta{color:#555;font-size:12px;margin-bottom:16px}
      .summary{display:flex;gap:24px;margin-bottom:16px;font-size:12px}
      .summary div b{display:block;color:#333;font-size:11px;text-transform:uppercase}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
      thead th{background:#f3f3f3;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
      @media print { body{padding:12px} }
    </style></head><body>
    <h1>${title}</h1>
    <div class="meta">Generated ${new Date().toLocaleString()}</div>
    <div class="summary">
      <div><b>Trades</b>${rows.length}</div>
      <div><b>Wins</b>${wins}</div>
      <div><b>Losses</b>${losses}</div>
      <div><b>Net P&amp;L</b>${total >= 0 ? "+" : ""}$${total.toFixed(2)}</div>
    </div>
    <table><thead><tr>
      <th>#</th><th>Entry</th><th>Exit</th><th>Dir</th><th>Type</th><th>Dur</th>
      <th>Entry Px</th><th>Exit Px</th><th>Stake</th><th>P&amp;L</th><th>Outcome</th>
    </tr></thead><tbody>${rowHtml}</tbody></table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
  win.document.close();
}

export default function BacktestPage() {
  const { data: strategies } = useListStrategies({});
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [selectedBacktestId, setSelectedBacktestId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const backtestParams = { strategyId: selectedStrategy ? parseInt(selectedStrategy) : undefined };
  const { data: backtests, isLoading: isResultsLoading } = useListBacktests(
    backtestParams,
    { query: { enabled: true, queryKey: getListBacktestsQueryKey(backtestParams) } }
  );

  const runBacktest = useRunBacktest();
  const deleteBacktest = useDeleteBacktest();

  const handleDeleteBacktest = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
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
    tradeType: BacktestInputTradeType.vanilla_options as string,
    duration: "5",
    durationUnit: "m",
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
      tradeType: formData.tradeType as any,
      duration: parseInt(formData.duration),
      durationUnit: formData.durationUnit as any,
      sessions: sessionsArr.length > 0 ? sessionsArr : null,
      datasetFile: dataSource === "local" ? selectedDataset : null,
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
    swalSuccess("Simulation Completed", timeframesToRun.length > 1 ? "All parallel backtest runs have finished successfully!" : "Backtest run has finished successfully!");
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
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-[#0A0D14] text-foreground">
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 gap-0 divide-x divide-border/30">
          
          {/* COLUMN 1: CONFIGURATION (Span 3) */}
          <div className="md:col-span-3 flex flex-col h-full bg-[#0E121B]/90 overflow-hidden backdrop-blur-sm">
            <div className="p-3 border-b border-border/30 bg-[#121824]/40 shrink-0 flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">Configuration</h2>
            </div>
            
            <form onSubmit={handleRun} className="flex-1 overflow-y-auto p-3 space-y-3.5 hide-scrollbar text-xs">
              <div className="space-y-1.5">
                <Label className="text-[9px] uppercase font-mono text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Target className="h-3 w-3" /> Strategy
                </Label>
                <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                  <SelectTrigger className="w-full h-8 rounded-none border-border/40 bg-background/50 font-mono text-[11px] focus:ring-1 focus:ring-primary/40">
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
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-primary" />
                    <h3 className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider">Timeframe</h3>
                  </div>
                  <button type="button" onClick={() => setMultiTimeframeMode(m => !m)} className={`px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold tracking-wider border transition-all ${multiTimeframeMode ? "bg-primary text-primary-foreground border-primary" : "bg-background/40 text-muted-foreground border-border/40 hover:text-primary"}`}>
                    Multi
                  </button>
                </div>
                {!multiTimeframeMode ? (
                  <Select value={String(selectedTimeframe)} onValueChange={(v) => setSelectedTimeframe(parseInt(v))}>
                    <SelectTrigger className="w-full h-7 rounded-none border-border/40 bg-background/40 font-mono text-[11px]">
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
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="h-3 w-3 text-primary" />
                  <h3 className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider">Trade Settings</h3>
                </div>
                <div className="space-y-1.5">
                  <Select value={formData.tradeType} onValueChange={(v) => setFormData({ ...formData, tradeType: v })}>
                    <SelectTrigger className="w-full h-7 rounded-none border-border/40 bg-background/40 font-mono text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border bg-[#0E121B]">
                      <SelectItem value="vanilla_options" className="font-mono text-[10px] uppercase">Options</SelectItem>
                      <SelectItem value="multiplier" className="font-mono text-[10px] uppercase">Multiplier</SelectItem>
                      <SelectItem value="forex" className="font-mono text-[10px] uppercase">Forex</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Input type="number" required value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} className="h-7 rounded-none font-mono border-border/40 bg-background/40 text-[11px] w-12 px-1 text-center" />
                    <Select value={formData.durationUnit} onValueChange={(v) => setFormData({ ...formData, durationUnit: v })}>
                      <SelectTrigger className="flex-1 h-7 rounded-none border-border/40 bg-background/40 font-mono text-[10px]">
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
                </div>
              </div>

              {/* Data Source & Market */}
              <div className="p-2.5 bg-[#121824]/30 border border-border/20 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3 text-primary" />
                  <h3 className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider">Data & Market</h3>
                </div>
                <Select value={dataSource} onValueChange={(v: "deriv" | "local") => setDataSource(v)}>
                  <SelectTrigger className="w-full h-7 rounded-none border-border/40 bg-background/40 font-mono text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border bg-[#0E121B]">
                    <SelectItem value="deriv" className="font-mono text-[10px] uppercase">Deriv API</SelectItem>
                    <SelectItem value="local" className="font-mono text-[10px] uppercase">Local CSV</SelectItem>
                  </SelectContent>
                </Select>
                {dataSource === "local" ? (
                  <div className="space-y-1.5">
                    <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                      <SelectTrigger className="w-full h-7 rounded-none border-border/40 bg-background/40 font-mono text-[10px]">
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
                        className="w-full justify-between h-7 rounded-none border-border/40 bg-background/40 font-mono px-2 hover:bg-muted/50 text-[10px]"
                      >
                        <div className="flex items-center gap-1 truncate">
                          <Search size={10} className="text-muted-foreground shrink-0" />
                          <span className="truncate">{formData.symbol || "Select Market..."}</span>
                        </div>
                        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 rounded-none border-border bg-[#0f1318] shadow-2xl z-[1000]" align="start" style={{ width: '260px', backgroundColor: '#0f1318', borderRadius: 0, border: '1px solid #1a2332' }}>
                      <Command shouldFilter={false} className="bg-transparent">
                        <CommandInput
                          placeholder="Search symbols..."
                          className="font-mono text-xs border-0 focus:ring-0"
                          style={{ height: '30px', fontSize: '10px' }}
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

              {/* Capital & Period */}
              <div className="p-2.5 bg-[#121824]/30 border border-border/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-primary" />
                    <h3 className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider">Date Period</h3>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <Input type="date" required value={formData.fromDate} onChange={e => setFormData({...formData, fromDate: e.target.value})} className="h-7 rounded-none font-mono border-border/40 bg-background/40 text-[9px] px-1" />
                  <Input type="date" required value={formData.toDate} onChange={e => setFormData({...formData, toDate: e.target.value})} className="h-7 rounded-none font-mono border-border/40 bg-background/40 text-[9px] px-1" />
                </div>
                
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/10">
                  <Wallet className="h-3 w-3 text-primary" />
                  <h3 className="text-[9px] uppercase font-mono text-foreground font-bold tracking-wider">Capital & Stake</h3>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="relative">
                    <Input type="number" required value={formData.initialBalance} onChange={e => setFormData({...formData, initialBalance: e.target.value})} className="h-7 rounded-none font-mono border-border/40 bg-background/40 text-[10px] pl-4" />
                    <span className="absolute left-1.5 top-1.5 text-[9px] text-muted-foreground">$</span>
                  </div>
                  <div className="relative">
                    <Input type="number" step="0.01" required value={formData.stakePerTrade} onChange={e => setFormData({...formData, stakePerTrade: e.target.value})} className="h-7 rounded-none font-mono border-border/40 bg-background/40 text-[10px] pl-4" />
                    <span className="absolute left-1.5 top-1.5 text-[9px] text-muted-foreground">$</span>
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

          {/* COLUMN 2: BACKTEST LIST (Span 4) */}
          <div className="md:col-span-3 lg:col-span-4 flex flex-col h-full bg-[#0A0D14] overflow-hidden">
            <div className="p-3 border-b border-border/30 bg-[#121824]/40 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">History</h2>
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
                      onClick={() => setSelectedBacktestId(bt.id)}
                      className={`group relative p-2.5 border cursor-pointer transition-all rounded-none ${isSelected ? 'bg-primary/5 border-primary shadow-sm' : 'bg-[#111520]/60 border-border/30 hover:border-primary/40'}`}
                    >
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
                      <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-border/10">
                        <div className="flex justify-between items-center pr-2">
                          <span className="text-[8px] uppercase font-mono text-muted-foreground">Win Rate</span>
                          <span className="text-[10px] font-bold font-mono">{bt.winRate != null ? `${bt.winRate.toFixed(1)}%` : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center pl-2 border-l border-border/20">
                          <span className="text-[8px] uppercase font-mono text-muted-foreground">P&L</span>
                          <span className={`text-[10px] font-bold font-mono ${bt.totalPnl && bt.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {bt.totalPnl != null ? `${bt.totalPnl >= 0 ? '+' : ''}$${bt.totalPnl.toFixed(2)}` : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMN 3: RESULTS DETAIL (Span 5) */}
          <div className="md:col-span-6 lg:col-span-5 flex flex-col h-full bg-[#0E121B]/90 overflow-hidden">
            {!selectedBt ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card/10">
                <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3 animate-pulse" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">Select a Backtest</h3>
                <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 max-w-[220px] mx-auto">Click on a backtest run from the history panel to view detailed metrics and executed trades.</p>
              </div>
            ) : (
              <>
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
                      <Button size="icon" variant="outline" onClick={() => printPdf(`Backtest #${selectedBt.id}`, selectedBtTrades)} className="h-6.5 w-6.5 rounded-none border-border/40" title="Print PDF">
                        <FileText className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={(e) => handleDeleteBacktest(selectedBt.id, e)} className="h-6.5 w-6.5 rounded-none border-destructive/40 text-destructive hover:bg-destructive/10" title="Delete Backtest">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                    <div className="bg-[#111520] border border-border/20 p-2">
                      <span className="text-[8px] uppercase font-mono text-muted-foreground block mb-0.5">Win Rate</span>
                      <span className="text-xs font-bold font-mono text-primary">{selectedBt.winRate?.toFixed(1)}%</span>
                    </div>
                    <div className="bg-[#111520] border border-border/20 p-2">
                      <span className="text-[8px] uppercase font-mono text-muted-foreground block mb-0.5">P&L</span>
                      <span className={`text-xs font-bold font-mono ${selectedBt.totalPnl! >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {selectedBt.totalPnl! >= 0 ? '+' : ''}${selectedBt.totalPnl?.toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-[#111520] border border-border/20 p-2">
                      <span className="text-[8px] uppercase font-mono text-muted-foreground block mb-0.5">Trades</span>
                      <span className="text-xs font-bold font-mono">{selectedBt.totalTrades}</span>
                    </div>
                    <div className="bg-[#111520] border border-border/20 p-2">
                      <span className="text-[8px] uppercase font-mono text-muted-foreground block mb-0.5">Max DD</span>
                      <span className="text-xs font-bold font-mono text-destructive">{selectedBt.maxDrawdown?.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Buy/Sell Breakdown Table */}
                  {selectedBtTrades.length > 0 && (
                    <div className="bg-[#111520] border border-border/20 p-2.5 mb-2.5 font-mono text-[9px] rounded-none">
                      <div className="text-muted-foreground uppercase font-bold tracking-wider mb-1.5 border-b border-border/10 pb-1 text-[8px]">
                        Buy/Sell Setup Performance Breakdown
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                        <div className="flex justify-between items-center border-r border-border/10 pr-4">
                          <span className="text-[#10b981] font-bold">WINNING BUY (CALL):</span>
                          <span className="text-white font-bold">{selectedBtStats.winBuyCount} trades (${selectedBtStats.winBuyPnl.toFixed(2)})</span>
                        </div>
                        <div className="flex justify-between items-center pl-2">
                          <span className="text-[#10b981] font-bold">WINNING SELL (PUT):</span>
                          <span className="text-white font-bold">{selectedBtStats.winSellCount} trades (${selectedBtStats.winSellPnl.toFixed(2)})</span>
                        </div>
                        <div className="flex justify-between items-center border-r border-border/10 pr-4">
                          <span className="text-[#ef4444] font-bold">LOSING BUY (CALL):</span>
                          <span className="text-white font-bold">{selectedBtStats.loseBuyCount} trades (${selectedBtStats.loseBuyPnl.toFixed(2)})</span>
                        </div>
                        <div className="flex justify-between items-center pl-2">
                          <span className="text-[#ef4444] font-bold">LOSING SELL (PUT):</span>
                          <span className="text-white font-bold">{selectedBtStats.loseSellCount} trades (${selectedBtStats.loseSellPnl.toFixed(2)})</span>
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

                <div className="flex-1 overflow-auto bg-[#0A0D14]">
                  {selectedBtTrades.length === 0 ? (
                    <div className="p-8 text-center text-xs font-mono uppercase text-muted-foreground opacity-50">No trades executed</div>
                  ) : (
                    <table className="w-full text-[9px] font-mono text-left whitespace-nowrap">
                      <thead className="bg-[#121824]/50 sticky top-0 border-b border-border/30 z-10 shadow-sm">
                        <tr>
                          <th className="px-2.5 py-1.5 font-normal text-muted-foreground uppercase">#</th>
                          <th className="px-2.5 py-1.5 font-normal text-muted-foreground uppercase">Dir</th>
                          <th className="px-2.5 py-1.5 font-normal text-muted-foreground uppercase text-right">Entry</th>
                          <th className="px-2.5 py-1.5 font-normal text-muted-foreground uppercase text-right">P&L</th>
                          <th className="px-2.5 py-1.5 font-normal text-muted-foreground uppercase text-center">Chart</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/10">
                        {selectedBtTrades.map(t => (
                          <tr key={t.id} className="hover:bg-[#111520]/50 transition-colors">
                            <td className="px-2.5 py-1.5 text-muted-foreground">{t.id}</td>
                            <td className="px-2.5 py-1.5">
                              <span className={`font-bold ${t.direction === "CALL" ? "text-primary bg-primary/5 px-1 py-0.1 border border-primary/10" : "text-destructive bg-destructive/5 px-1 py-0.1 border border-destructive/10"}`}>{t.direction}</span>
                            </td>
                            <td className="px-2.5 py-1.5 text-right">{t.entry.toFixed(4)}</td>
                            <td className={`px-2.5 py-1.5 text-right font-bold ${t.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                              {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                            </td>
                            <td className="px-2.5 py-1.5 text-center">
                              <Button size="icon" variant="ghost" className="h-5.5 w-5.5 text-muted-foreground hover:text-primary rounded-none" onClick={() => handleViewChart(t, selectedBt.id)}>
                                <LineChart className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
