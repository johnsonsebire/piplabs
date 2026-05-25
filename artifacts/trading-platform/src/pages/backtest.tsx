import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListStrategies,
  useRunBacktest,
  useListBacktests,
  getListBacktestsQueryKey,
  BacktestInputTradeType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Download, FileText, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Activity, DollarSign, Target,
  BarChart3, LineChart, Settings, Calendar, Wallet, Clock, Layers, Globe
} from "lucide-react";

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

// Available timeframes for backtest (in seconds) - aligned with Deriv API granularities
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const backtestParams = { strategyId: selectedStrategy ? parseInt(selectedStrategy) : undefined };
  const { data: backtests, isLoading: isResultsLoading } = useListBacktests(
    backtestParams,
    { query: { enabled: true, queryKey: getListBacktestsQueryKey(backtestParams) } }
  );

  const runBacktest = useRunBacktest();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Multi-timeframe mode toggle
  const [multiTimeframeMode, setMultiTimeframeMode] = useState(false);
  // Single timeframe value (default 5M = 300s)
  const [selectedTimeframe, setSelectedTimeframe] = useState<number>(300);
  // Multi-timeframe selection (set of granularity seconds)
  const [selectedTimeframes, setSelectedTimeframes] = useState<Set<number>>(
    new Set([60, 300, 900, 3600]) // Default: 1M, 5M, 15M, 1H
  );

  // Session filter: empty Set => all sessions allowed
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

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStrategy) {
      toast({ variant: "destructive", title: "Select a strategy first" });
      return;
    }

    const timeframesToRun = multiTimeframeMode
      ? Array.from(selectedTimeframes).sort((a, b) => a - b)
      : [selectedTimeframe];

    if (timeframesToRun.length === 0) {
      toast({ variant: "destructive", title: "Select at least one timeframe" });
      return;
    }

    const sessionsArr = Array.from(selectedSessions);

    const baseData = {
      strategyId: parseInt(selectedStrategy),
      symbol: formData.symbol,
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      initialBalance: parseFloat(formData.initialBalance),
      stakePerTrade: parseFloat(formData.stakePerTrade),
      tradeType: formData.tradeType as any,
      duration: parseInt(formData.duration),
      durationUnit: formData.durationUnit as any,
      sessions: sessionsArr.length > 0 ? sessionsArr : null,
    };

    // Show toast for multi-timeframe runs
    if (timeframesToRun.length > 1) {
      toast({ title: `Running ${timeframesToRun.length} backtests in parallel`, description: `Timeframes: ${timeframesToRun.map(timeframeShort).join(", ")}` });
    }

    // Fire all backtests in parallel
    const promises = timeframesToRun.map(granularitySec =>
      runBacktest.mutateAsync({
        data: { ...baseData, granularitySec } as any,
      }).catch((err: any) => {
        toast({
          variant: "destructive",
          title: `Backtest failed for ${timeframeShort(granularitySec)}`,
          description: err?.message
        });
        return null;
      })
    );

    await Promise.all(promises);
    queryClient.invalidateQueries({ queryKey: ["/api/backtests"] });

    if (timeframesToRun.length === 1) {
      toast({ title: "Backtest initiated" });
    } else {
      toast({ title: "All backtests initiated", description: "Results will appear shortly" });
    }
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] w-full overflow-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Page Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Backtest</h1>
                <p className="text-sm text-muted-foreground font-mono mt-0.5">Test strategies against real historical market data</p>
              </div>
            </div>
          </div>

          {/* Main Grid: Configuration + Results */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column - Configuration Panel */}
            <div className="lg:col-span-4">
              <Card className="border-border rounded-xl overflow-hidden sticky top-6">
                <div className="p-5 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">Configuration</h2>
                  </div>
                </div>

                <form onSubmit={handleRun} className="p-5 space-y-5">
                  {/* Strategy Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Target className="h-3 w-3" />
                      Strategy
                    </Label>
                    <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                      <SelectTrigger className="w-full h-10 rounded-lg border-border bg-background font-mono text-sm">
                        <SelectValue placeholder="Select Strategy" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg border-border">
                        {Array.isArray(strategies) ? strategies.map(s => (
                          <SelectItem key={s.id} value={s.id.toString()} className="font-mono text-xs uppercase">{s.name}</SelectItem>
                        )) : null}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Timeframe Selection */}
                  <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-primary" />
                        <h3 className="text-[11px] uppercase font-mono text-foreground font-bold tracking-wider">Timeframe</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMultiTimeframeMode(m => !m)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono uppercase font-bold tracking-wider transition-all ${
                          multiTimeframeMode
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-muted text-muted-foreground border border-border hover:border-primary/30 hover:text-primary"
                        }`}
                        title="Toggle multi-timeframe mode"
                      >
                        <Layers className="h-3 w-3" />
                        Multi
                      </button>
                    </div>

                    {!multiTimeframeMode ? (
                      <>
                        <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">Candle Period</Label>
                        <Select value={String(selectedTimeframe)} onValueChange={(v) => setSelectedTimeframe(parseInt(v))}>
                          <SelectTrigger className="w-full h-10 rounded-lg border-border bg-background font-mono text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border-border max-h-80">
                            {TIMEFRAMES.map(tf => (
                              <SelectItem key={tf.value} value={String(tf.value)} className="font-mono text-xs uppercase">
                                {tf.short} — {tf.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground/70 font-mono leading-relaxed">
                          The granularity of historical candles used during the backtest.
                        </p>
                      </>
                    ) : (
                      <>
                        <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">
                          Select Multiple ({selectedTimeframes.size} selected)
                        </Label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {TIMEFRAMES.map(tf => {
                            const active = selectedTimeframes.has(tf.value);
                            return (
                              <button
                                type="button"
                                key={tf.value}
                                onClick={() => toggleTimeframe(tf.value)}
                                className={`h-9 rounded-md text-[10px] font-mono uppercase font-bold tracking-wider border transition-all ${
                                  active
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-primary"
                                }`}
                                title={tf.label}
                              >
                                {tf.short}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 font-mono leading-relaxed">
                          Will run {selectedTimeframes.size} parallel backtests, one per selected timeframe. Compare results to find the best.
                        </p>
                      </>
                    )}
                  </div>

                  {/* Trade Settings */}
                  <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-primary" />
                      <h3 className="text-[11px] uppercase font-mono text-foreground font-bold tracking-wider">Trade Settings</h3>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">Trade Type</Label>
                      <Select value={formData.tradeType} onValueChange={(v) => setFormData({ ...formData, tradeType: v })}>
                        <SelectTrigger className="w-full h-10 rounded-lg border-border bg-background font-mono text-sm" data-testid="select-backtest-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-border">
                          <SelectItem value="vanilla_options" className="font-mono text-xs uppercase">Vanilla Options</SelectItem>
                          <SelectItem value="multiplier" className="font-mono text-xs uppercase">Multiplier</SelectItem>
                          <SelectItem value="forex" className="font-mono text-xs uppercase">Forex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">Trade Duration</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          required
                          value={formData.duration}
                          onChange={e => setFormData({ ...formData, duration: e.target.value })}
                          className="rounded-lg font-mono border-border bg-background flex-1"
                          data-testid="input-backtest-duration"
                        />
                        <Select value={formData.durationUnit} onValueChange={(v) => setFormData({ ...formData, durationUnit: v })}>
                          <SelectTrigger className="w-[100px] h-10 rounded-lg border-border bg-background font-mono text-sm" data-testid="select-backtest-duration-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border-border">
                            <SelectItem value="m" className="font-mono text-xs">Min</SelectItem>
                            <SelectItem value="t" className="font-mono text-xs">Ticks</SelectItem>
                            <SelectItem value="s" className="font-mono text-xs">Sec</SelectItem>
                            <SelectItem value="h" className="font-mono text-xs">Hours</SelectItem>
                            <SelectItem value="d" className="font-mono text-xs">Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 font-mono leading-relaxed">
                        How long each simulated trade is held open.
                      </p>
                    </div>
                  </div>

                  {/* Trading Sessions */}
                  <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-primary" />
                        <h3 className="text-[11px] uppercase font-mono text-foreground font-bold tracking-wider">Trading Sessions</h3>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {selectedSessions.size === 0 ? "ALL" : `${selectedSessions.size} selected`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {SESSIONS.map(s => {
                        const active = selectedSessions.has(s.value);
                        return (
                          <button
                            type="button"
                            key={s.value}
                            onClick={() => toggleSession(s.value)}
                            title={`${s.label} (${s.hours})`}
                            className={`flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-md text-left border transition-all ${
                              active
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-primary"
                            }`}
                          >
                            <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
                              {s.short}
                            </span>
                            <span className={`text-[9px] font-mono ${active ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}>
                              {s.hours}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-muted-foreground/70 font-mono leading-relaxed">
                      {selectedSessions.size === 0
                        ? "All sessions included. Click to restrict entries to specific sessions."
                        : "Only trades initiated within the selected sessions (UTC) will be opened."}
                    </p>
                  </div>

                  {/* Market & Period */}
                  <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-primary" />
                      <h3 className="text-[11px] uppercase font-mono text-foreground font-bold tracking-wider">Market & Period</h3>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">Symbol</Label>
                      <Input
                        required
                        value={formData.symbol}
                        onChange={e => setFormData({...formData, symbol: e.target.value})}
                        className="rounded-lg font-mono border-border bg-background uppercase font-bold"
                        placeholder="R_100"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">From</Label>
                        <Input type="date" required value={formData.fromDate}
                          onChange={e => setFormData({...formData, fromDate: e.target.value})}
                          className="rounded-lg font-mono border-border bg-background text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">To</Label>
                        <Input type="date" required value={formData.toDate}
                          onChange={e => setFormData({...formData, toDate: e.target.value})}
                          className="rounded-lg font-mono border-border bg-background text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Capital */}
                  <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-3 w-3 text-primary" />
                      <h3 className="text-[11px] uppercase font-mono text-foreground font-bold tracking-wider">Capital</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">Initial $</Label>
                        <Input type="number" required value={formData.initialBalance}
                          onChange={e => setFormData({...formData, initialBalance: e.target.value})}
                          className="rounded-lg font-mono border-border bg-background"
                          placeholder="10000" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase font-mono text-muted-foreground tracking-wider">Stake $</Label>
                        <Input type="number" step="0.01" required value={formData.stakePerTrade}
                          onChange={e => setFormData({...formData, stakePerTrade: e.target.value})}
                          className="rounded-lg font-mono border-border bg-background"
                          placeholder="1.00" />
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={runBacktest.isPending}
                    className="w-full rounded-lg font-bold uppercase font-mono tracking-wider h-11 text-sm shadow-md hover:shadow-lg transition-all"
                  >
                    {runBacktest.isPending ? (
                      <>
                        <Activity className="h-4 w-4 mr-2 animate-spin" />
                        Simulating...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Execute Backtest{multiTimeframeMode && selectedTimeframes.size > 1 ? ` (${selectedTimeframes.size}x)` : ""}
                      </>
                    )}
                  </Button>
                </form>
              </Card>
            </div>

            {/* Right Column - Results */}
            <div className="lg:col-span-8">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold font-mono uppercase text-foreground tracking-wider">Results</h2>
                </div>
                {Array.isArray(backtests) && backtests.length > 0 && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {backtests.length} backtest{backtests.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {isResultsLoading ? (
                <Card className="border-border rounded-xl p-12 flex flex-col items-center justify-center">
                  <Activity className="h-8 w-8 text-primary animate-spin mb-4" />
                  <div className="text-center text-muted-foreground font-mono uppercase text-sm">Loading results...</div>
                </Card>
              ) : !Array.isArray(backtests) || backtests.length === 0 ? (
                <Card className="border-border rounded-xl p-12 flex flex-col items-center justify-center min-h-[400px]">
                  <BarChart3 className="h-16 w-16 mb-4 text-muted-foreground/20" />
                  <div className="font-mono uppercase text-sm text-muted-foreground">No backtests run yet</div>
                  <p className="text-xs mt-2 text-muted-foreground/60 font-mono">Configure and execute a backtest to see results</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {backtests.map(bt => {
                    const results = parseResults(bt.results);
                    const trades = results.trades ?? [];
                    const isOpen = expandedId === bt.id;
                    return (
                      <Card key={bt.id} className="border-border rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                        {/* Result Header */}
                        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-muted/30 to-transparent flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-primary/10">
                                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <span className="font-bold text-base font-mono text-primary uppercase">#{bt.id}</span>
                            </div>
                            <span className={`px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-md font-bold ${
                              bt.status === 'completed' ? 'bg-primary/15 text-primary border border-primary/20' :
                              bt.status === 'failed' ? 'bg-destructive/15 text-destructive border border-destructive/20' :
                              'bg-yellow-500/15 text-yellow-600 border border-yellow-500/20'
                            }`}>
                              {bt.status}
                            </span>
                            {/* Timeframe Badge */}
                            <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-md bg-primary/10 text-primary font-bold border border-primary/20 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {timeframeShort(results.granularitySec)}
                            </span>
                            {results.tradeType && (
                              <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-md bg-muted text-muted-foreground font-semibold border border-border">
                                {results.tradeType} · {results.duration}{results.durationUnit}
                              </span>
                            )}
                            {results.sessions && results.sessions.length > 0 && (
                              <span
                                className="px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-md bg-primary/10 text-primary font-bold border border-primary/20 flex items-center gap-1"
                                title={`Filtered to: ${results.sessions.map(sessionShort).join(", ")}`}
                              >
                                <Globe className="h-3 w-3" />
                                {results.sessions.map(sessionShort).join(" · ")}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono font-bold text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border">
                            {bt.symbol}
                          </span>
                        </div>

                        {/* Metrics Grid - well-spaced, label above value with breathing room */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
                          <div className="px-5 py-4 bg-card flex flex-col gap-2 min-w-0">
                            <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <Target className="h-3 w-3 shrink-0" />
                              <span>Win Rate</span>
                            </span>
                            <span className="text-2xl font-bold font-mono text-foreground leading-none tabular-nums">
                              {bt.winRate != null ? `${bt.winRate.toFixed(1)}%` : '---'}
                            </span>
                          </div>
                          <div className="px-5 py-4 bg-card flex flex-col gap-2 min-w-0">
                            <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <DollarSign className="h-3 w-3 shrink-0" />
                              <span>Net P&amp;L</span>
                            </span>
                            <span className={`text-2xl font-bold font-mono leading-none tabular-nums ${bt.totalPnl != null && bt.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                              {bt.totalPnl != null ? `${bt.totalPnl >= 0 ? '+' : ''}$${bt.totalPnl.toFixed(2)}` : '---'}
                            </span>
                          </div>
                          <div className="px-5 py-4 bg-card flex flex-col gap-2 min-w-0">
                            <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <Activity className="h-3 w-3 shrink-0" />
                              <span>Trades</span>
                            </span>
                            <span className="text-2xl font-bold font-mono text-foreground leading-none tabular-nums">
                              {bt.totalTrades ?? '---'}
                            </span>
                          </div>
                          <div className="px-5 py-4 bg-card flex flex-col gap-2 min-w-0">
                            <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <TrendingDown className="h-3 w-3 shrink-0" />
                              <span>Max DD</span>
                            </span>
                            <span className="text-2xl font-bold font-mono text-destructive leading-none tabular-nums">
                              {bt.maxDrawdown != null ? `${bt.maxDrawdown.toFixed(1)}%` : '---'}
                            </span>
                          </div>
                        </div>

                        {/* Trade List Toggle */}
                        {trades.length > 0 && (
                          <div className="border-t border-border">
                            <div className="flex items-center justify-between p-3 bg-muted/10 gap-2 flex-wrap">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-[11px] uppercase font-mono h-8 px-3 font-semibold border-border hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all"
                                onClick={() => setExpandedId(isOpen ? null : bt.id)}
                                data-testid={`button-toggle-trades-${bt.id}`}
                              >
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5 mr-1.5" /> : <ChevronRight className="h-3.5 w-3.5 mr-1.5" />}
                                {isOpen ? "Hide" : "Show"} Trades ({trades.length})
                              </Button>
                              <div className="flex gap-2">
                                <Button
                                  type="button" size="sm" variant="outline"
                                  onClick={() => downloadCsv(`backtest-${bt.id}-${timeframeShort(results.granularitySec)}-trades.csv`, trades)}
                                  className="rounded-lg text-[11px] uppercase font-mono h-8 px-3 font-semibold border-border hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all"
                                  data-testid={`button-csv-${bt.id}`}
                                >
                                  <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                                </Button>
                                <Button
                                  type="button" size="sm" variant="outline"
                                  onClick={() => printPdf(`Backtest #${bt.id} — ${bt.symbol} @ ${timeframeShort(results.granularitySec)}`, trades)}
                                  className="rounded-lg text-[11px] uppercase font-mono h-8 px-3 font-semibold border-border hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all"
                                  data-testid={`button-pdf-${bt.id}`}
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1.5" /> PDF
                                </Button>
                              </div>
                            </div>

                            {isOpen && (
                              <div className="overflow-x-auto max-h-96 overflow-y-auto border-t border-border">
                                <table className="w-full text-xs font-mono border-separate border-spacing-0 min-w-[760px]">
                                  <thead className="bg-muted/40 sticky top-0 backdrop-blur-sm z-10">
                                    <tr>
                                      <th className="w-10 px-3 py-3 text-left text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">#</th>
                                      <th className="px-4 py-3 text-left text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">Entry Time</th>
                                      <th className="w-20 px-3 py-3 text-left text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">Dir</th>
                                      <th className="px-4 py-3 text-right text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">Entry</th>
                                      <th className="px-4 py-3 text-right text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">Exit</th>
                                      <th className="px-4 py-3 text-right text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">P&amp;L</th>
                                      <th className="w-20 px-3 py-3 text-center text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">Result</th>
                                      <th className="w-24 px-3 py-3 text-center text-[10px] uppercase text-muted-foreground font-bold tracking-wider border-b border-border">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {trades.map(t => (
                                      <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-3 py-3 text-muted-foreground font-semibold border-b border-border/40">{t.id}</td>
                                        <td className="px-4 py-3 text-muted-foreground text-[11px] whitespace-nowrap border-b border-border/40">{new Date(t.entryAt).toLocaleString()}</td>
                                        <td className="px-3 py-3 border-b border-border/40">
                                          <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] tracking-wider ${t.direction === "CALL" ? "bg-primary/15 text-primary border border-primary/20" : "bg-destructive/15 text-destructive border border-destructive/20"}`}>
                                            {t.direction}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums border-b border-border/40">{t.entry.toFixed(4)}</td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums border-b border-border/40">{t.exit.toFixed(4)}</td>
                                        <td className={`px-4 py-3 text-right font-bold tabular-nums border-b border-border/40 ${t.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                                        </td>
                                        <td className="px-3 py-3 text-center border-b border-border/40">
                                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${t.outcome === "win" ? "bg-primary/15 text-primary border border-primary/20" : "bg-destructive/15 text-destructive border border-destructive/20"}`}>
                                            {t.outcome}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center border-b border-border/40">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleViewChart(t, bt.id)}
                                            className="h-8 px-2.5 rounded-md text-[10px] font-mono uppercase font-semibold border-border hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all"
                                            title="View trade on chart"
                                          >
                                            <LineChart className="h-3 w-3 mr-1" />
                                            Chart
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {bt.errorMessage && (
                          <div className="p-4 bg-destructive/5 border-t border-destructive/20 text-destructive font-mono text-xs flex items-start gap-2">
                            <span className="font-bold">Error:</span>
                            <span>{bt.errorMessage}</span>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </AppLayout>
  );
}
