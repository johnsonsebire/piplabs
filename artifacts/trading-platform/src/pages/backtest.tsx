import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, FileText, ChevronDown, ChevronRight } from "lucide-react";

type SimTrade = {
  id: number; entryAt: string; exitAt: string; direction: string;
  type: string; duration: string; entry: number; exit: number;
  stake: number; pnl: number; outcome: "win" | "loss";
};

type BacktestResults = {
  wins?: number;
  losses?: number;
  tradeType?: string;
  duration?: number;
  durationUnit?: string;
  trades?: SimTrade[];
};

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

  const backtestParams = { strategyId: selectedStrategy ? parseInt(selectedStrategy) : undefined };
  const { data: backtests, isLoading: isResultsLoading } = useListBacktests(
    backtestParams,
    { query: { enabled: true, queryKey: getListBacktestsQueryKey(backtestParams) } }
  );

  const runBacktest = useRunBacktest();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStrategy) {
      toast({ variant: "destructive", title: "Select a strategy first" });
      return;
    }

    runBacktest.mutate({
      data: {
        strategyId: parseInt(selectedStrategy),
        symbol: formData.symbol,
        fromDate: formData.fromDate,
        toDate: formData.toDate,
        initialBalance: parseFloat(formData.initialBalance),
        stakePerTrade: parseFloat(formData.stakePerTrade),
        tradeType: formData.tradeType as any,
        duration: parseInt(formData.duration),
        durationUnit: formData.durationUnit as any,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Backtest initiated" });
        queryClient.invalidateQueries({ queryKey: ["/api/backtests"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        <div className="w-full md:w-80 border-r border-border bg-card shrink-0 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-border shrink-0">
            <h1 className="text-xl font-bold font-mono uppercase tracking-tight text-foreground">Simulation</h1>
            <p className="text-xs text-muted-foreground font-mono mt-1">Configure historical test run</p>
          </div>

          <form onSubmit={handleRun} className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Strategy</Label>
              <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-full h-10 rounded-none border-border bg-background font-mono text-sm text-primary">
                  <SelectValue placeholder="Select Strategy" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border">
                  {strategies?.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()} className="font-mono text-xs uppercase">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Trade Type</Label>
              <Select value={formData.tradeType} onValueChange={(v) => setFormData({ ...formData, tradeType: v })}>
                <SelectTrigger className="w-full h-10 rounded-none border-border bg-background font-mono text-sm" data-testid="select-backtest-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border">
                  <SelectItem value="vanilla_options" className="font-mono text-xs uppercase">Vanilla Options (Call/Put)</SelectItem>
                  <SelectItem value="multiplier" className="font-mono text-xs uppercase">Multiplier</SelectItem>
                  <SelectItem value="forex" className="font-mono text-xs uppercase">Forex</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Trade Duration</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  required
                  value={formData.duration}
                  onChange={e => setFormData({ ...formData, duration: e.target.value })}
                  className="rounded-none font-mono border-border bg-background flex-1"
                  data-testid="input-backtest-duration"
                />
                <Select value={formData.durationUnit} onValueChange={(v) => setFormData({ ...formData, durationUnit: v })}>
                  <SelectTrigger className="w-[110px] h-10 rounded-none border-border bg-background font-mono text-sm" data-testid="select-backtest-duration-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border">
                    <SelectItem value="m" className="font-mono text-xs">Minutes</SelectItem>
                    <SelectItem value="t" className="font-mono text-xs">Ticks</SelectItem>
                    <SelectItem value="s" className="font-mono text-xs">Seconds</SelectItem>
                    <SelectItem value="h" className="font-mono text-xs">Hours</SelectItem>
                    <SelectItem value="d" className="font-mono text-xs">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Symbol</Label>
              <Input
                required
                value={formData.symbol}
                onChange={e => setFormData({...formData, symbol: e.target.value})}
                className="rounded-none font-mono border-border bg-background uppercase font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">From</Label>
                <Input type="date" required value={formData.fromDate}
                  onChange={e => setFormData({...formData, fromDate: e.target.value})}
                  className="rounded-none font-mono border-border bg-background text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">To</Label>
                <Input type="date" required value={formData.toDate}
                  onChange={e => setFormData({...formData, toDate: e.target.value})}
                  className="rounded-none font-mono border-border bg-background text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Initial $</Label>
                <Input type="number" required value={formData.initialBalance}
                  onChange={e => setFormData({...formData, initialBalance: e.target.value})}
                  className="rounded-none font-mono border-border bg-background" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Stake $</Label>
                <Input type="number" step="0.01" required value={formData.stakePerTrade}
                  onChange={e => setFormData({...formData, stakePerTrade: e.target.value})}
                  className="rounded-none font-mono border-border bg-background" />
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <Button type="submit" disabled={runBacktest.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-12 text-sm bg-primary text-primary-foreground hover:bg-primary/90">
                {runBacktest.isPending ? "Simulating..." : "Execute Backtest"}
              </Button>
            </div>
          </form>
        </div>

        <div className="flex-1 bg-background flex flex-col min-w-0">
          <div className="p-4 border-b border-border bg-muted/20 shrink-0">
            <h2 className="text-sm font-bold font-mono uppercase text-foreground">Simulation Results</h2>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {isResultsLoading ? (
              <div className="text-center text-muted-foreground font-mono uppercase mt-10">Loading results...</div>
            ) : backtests?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-mono uppercase">
                No backtests run yet
              </div>
            ) : (
              <div className="space-y-6">
                {backtests?.map(bt => {
                  const results = parseResults(bt.results);
                  const trades = results.trades ?? [];
                  const isOpen = expandedId === bt.id;
                  return (
                    <div key={bt.id} className="border border-border bg-card">
                      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/10">
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-lg font-mono text-primary uppercase">Run #{bt.id}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${bt.status === 'completed' ? 'bg-primary/20 text-primary' : bt.status === 'failed' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-500'}`}>
                            {bt.status}
                          </span>
                          {results.tradeType && (
                            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-muted text-muted-foreground">
                              {results.tradeType} · {results.duration}{results.durationUnit}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">{bt.symbol}</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border md:divide-y-0">
                        <div className="p-4 flex flex-col">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Win Rate</span>
                          <span className="text-xl font-bold font-mono text-foreground">{bt.winRate ? `${bt.winRate.toFixed(1)}%` : '---'}</span>
                        </div>
                        <div className="p-4 flex flex-col">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Net P&L</span>
                          <span className={`text-xl font-bold font-mono ${bt.totalPnl && bt.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {bt.totalPnl != null ? `${bt.totalPnl >= 0 ? '+' : ''}$${bt.totalPnl.toFixed(2)}` : '---'}
                          </span>
                        </div>
                        <div className="p-4 flex flex-col">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Total Trades</span>
                          <span className="text-xl font-bold font-mono text-foreground">{bt.totalTrades ?? '---'}</span>
                        </div>
                        <div className="p-4 flex flex-col">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Max Drawdown</span>
                          <span className="text-xl font-bold font-mono text-destructive">{bt.maxDrawdown ? `${bt.maxDrawdown.toFixed(1)}%` : '---'}</span>
                        </div>
                      </div>

                      {trades.length > 0 && (
                        <div className="border-t border-border">
                          <div className="flex items-center justify-between p-3 bg-muted/5">
                            <button
                              type="button"
                              className="flex items-center gap-2 text-xs font-mono uppercase text-foreground hover:text-primary"
                              onClick={() => setExpandedId(isOpen ? null : bt.id)}
                              data-testid={`button-toggle-trades-${bt.id}`}
                            >
                              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {isOpen ? "Hide" : "Show"} Trade List ({trades.length})
                            </button>
                            <div className="flex gap-2">
                              <Button
                                type="button" size="sm" variant="outline"
                                onClick={() => downloadCsv(`backtest-${bt.id}-trades.csv`, trades)}
                                className="rounded-none text-[10px] uppercase font-mono h-7"
                                data-testid={`button-csv-${bt.id}`}
                              >
                                <Download className="h-3 w-3 mr-1" /> CSV / Excel
                              </Button>
                              <Button
                                type="button" size="sm" variant="outline"
                                onClick={() => printPdf(`Backtest Run #${bt.id} — ${bt.symbol}`, trades)}
                                className="rounded-none text-[10px] uppercase font-mono h-7"
                                data-testid={`button-pdf-${bt.id}`}
                              >
                                <FileText className="h-3 w-3 mr-1" /> PDF
                              </Button>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                              <table className="w-full text-xs font-mono">
                                <thead className="bg-muted/30 sticky top-0">
                                  <tr>
                                    <th className="p-2 text-left text-[10px] uppercase text-muted-foreground">#</th>
                                    <th className="p-2 text-left text-[10px] uppercase text-muted-foreground">Entry</th>
                                    <th className="p-2 text-left text-[10px] uppercase text-muted-foreground">Dir</th>
                                    <th className="p-2 text-left text-[10px] uppercase text-muted-foreground">Dur</th>
                                    <th className="p-2 text-right text-[10px] uppercase text-muted-foreground">Entry Px</th>
                                    <th className="p-2 text-right text-[10px] uppercase text-muted-foreground">Exit Px</th>
                                    <th className="p-2 text-right text-[10px] uppercase text-muted-foreground">Stake</th>
                                    <th className="p-2 text-right text-[10px] uppercase text-muted-foreground">P&L</th>
                                    <th className="p-2 text-left text-[10px] uppercase text-muted-foreground">Result</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {trades.map(t => (
                                    <tr key={t.id} className="hover:bg-muted/10">
                                      <td className="p-2 text-muted-foreground">{t.id}</td>
                                      <td className="p-2 text-muted-foreground text-[10px]">{new Date(t.entryAt).toLocaleString()}</td>
                                      <td className={`p-2 font-bold ${t.direction === "CALL" ? "text-primary" : "text-destructive"}`}>{t.direction}</td>
                                      <td className="p-2 text-muted-foreground">{t.duration}</td>
                                      <td className="p-2 text-right">{t.entry.toFixed(4)}</td>
                                      <td className="p-2 text-right">{t.exit.toFixed(4)}</td>
                                      <td className="p-2 text-right">${t.stake.toFixed(2)}</td>
                                      <td className={`p-2 text-right font-bold ${t.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                                      </td>
                                      <td className={`p-2 text-[10px] uppercase ${t.outcome === "win" ? "text-primary" : "text-destructive"}`}>{t.outcome}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {bt.errorMessage && (
                        <div className="p-4 bg-destructive/10 border-t border-border text-destructive font-mono text-xs">
                          Error: {bt.errorMessage}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
