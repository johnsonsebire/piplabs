import React, { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListAutoTradeSessions, useCreateAutoTradeSession, useUpdateAutoTradeSession, useDeleteAutoTradeSession, useListStrategies, AutoTradeSessionInputMode, getListAutoTradeSessionsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { swalSuccess, swalError, swalWarning, swalConfirm } from "@/lib/swal";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { SessionLiveChart } from "@/components/SessionLiveChart";
import { Bot, Terminal, Activity, List, ChevronDown } from "lucide-react";

function SessionTrades({ sessionId }: { sessionId: number }) {
  const { data: trades, isLoading } = useQuery({
    queryKey: ["/api/autotrade/sessions", sessionId, "trades"],
    queryFn: async () => {
      const res = await fetch(`/api/autotrade/sessions/${sessionId}/trades`);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return res.json();
    },
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="p-4 text-xs font-mono text-muted-foreground uppercase">Loading trades...</div>;
  if (!trades || trades.length === 0) return <div className="p-4 text-xs font-mono text-muted-foreground uppercase">No trades executed yet.</div>;

  return (
    <div className="bg-muted/10 border-t border-border p-4">
      <h3 className="text-xs font-bold uppercase mb-2 font-mono">Recent Session Trades</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono text-left whitespace-nowrap">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-2 font-normal text-muted-foreground uppercase">Symbol</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Dir</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Stake</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Entry Date</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Entry Time</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Exit Date</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Exit Time</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Entry Px</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">P&L</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Status</th>
              <th className="p-2 font-normal text-muted-foreground uppercase">Chart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trades.map((t: any) => (
              <tr key={t.id} className="hover:bg-muted/5">
                <td className="p-2 font-bold">{t.symbol}</td>
                <td className="p-2 uppercase">{t.direction}</td>
                <td className="p-2">${t.stake}</td>
                <td className="p-2">{new Date(t.openedAt).toLocaleDateString()}</td>
                <td className="p-2">{new Date(t.openedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
                <td className="p-2">{t.closedAt ? new Date(t.closedAt).toLocaleDateString() : '-'}</td>
                <td className="p-2">{t.closedAt ? new Date(t.closedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : '-'}</td>
                <td className="p-2">{t.entryPrice ?? '-'}</td>
                <td className={`p-2 font-bold ${t.currentProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {t.currentProfit ? (t.currentProfit > 0 ? '+' : '') + t.currentProfit.toFixed(2) : '-'}
                </td>
                <td className="p-2 uppercase">{t.status}</td>
                <td className="p-2">
                  {(t.status === 'closed' || t.status === 'cancelled') ? (
                    <Link href={`/autotrade/chart?tradeId=${t.id}`}>
                      <button className="text-[10px] font-mono uppercase border border-primary/40 text-primary px-2 py-0.5 hover:bg-primary/10 transition-colors">
                        Chart
                      </button>
                    </Link>
                  ) : (
                    <Link href={`/autotrade/chart?tradeId=${t.id}`}>
                      <button className="text-[10px] font-mono uppercase border border-muted-foreground/20 text-muted-foreground px-2 py-0.5 hover:bg-muted/10 transition-colors">
                        Live
                      </button>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionLogs({ sessionId }: { sessionId: number }) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const { data: logs, isLoading } = useQuery({
    queryKey: ["/api/autotrade/sessions", sessionId, "logs"],
    queryFn: async () => {
      const res = await fetch(`/api/autotrade/sessions/${sessionId}/logs`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 5000,
  });

  if (isLoading) return (
    <div className="w-full">
      <div className="session-logs-header">
        <div className="session-logs-header-dot" />
        <span>DATA WINDOW</span>
        <span className="session-logs-header-sub">Loading...</span>
      </div>
      <div className="session-logs-body">
        <div className="session-logs-empty">Loading logs...</div>
      </div>
    </div>
  );
  if (!logs || logs.length === 0) return (
    <div className="w-full">
      <div className="session-logs-header">
        <div className="session-logs-header-dot" />
        <span>DATA WINDOW</span>
        <span className="session-logs-header-sub">0 entries</span>
      </div>
      <div className="session-logs-body">
        <div className="session-logs-empty">No logs yet. Logs will appear when the strategy begins evaluating.</div>
      </div>
    </div>
  );

  const getActionClass = (action: string) => {
    switch (action) {
      case 'trade': return 'session-log-action-trade';
      case 'ai_result': return 'session-log-action-ai';
      case 'blocked': return 'session-log-action-blocked';
      case 'error': return 'session-log-action-error';
      case 'evaluate': return 'session-log-action-evaluate';
      default: return 'session-log-action-default';
    }
  };

  return (
    <div className="w-full">
      <div className="session-logs-header">
        <div className="session-logs-header-dot session-logs-header-dot--active" />
        <span>DATA WINDOW</span>
        <span className="session-logs-header-sub">{logs.length} entries</span>
      </div>
      <div className="session-logs-body">
        {logs.map((log: any, idx: number) => (
          <div key={log.id} className={`session-log-row ${idx % 2 === 0 ? 'session-log-row--even' : ''}`}>
            <span className="session-log-time">
              {new Date(log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
            </span>
            <span className="session-log-symbol">{log.symbol}</span>
            <span className={`session-log-action ${getActionClass(log.action)}`}>
              {log.action}
            </span>
            <span className="session-log-message">{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

function SessionExpandedPanel({ session }: { session: any }) {
  const [tab, setTab] = useState<"chart" | "trades" | "logs">("chart");
  
  const isActive = session.status === "running" || session.status === "paused";
  
  let symbols: string[] = [session.symbol];
  if (Array.isArray(session.symbols) && session.symbols.length > 0) {
    symbols = session.symbols;
  }
  
  if (session.pairMode === "rotating" && symbols.length > 0) {
    const idx = (session.currentPairIdx || 0) % symbols.length;
    symbols = [symbols[idx]];
  }

  // If not active, only show trades
  if (!isActive) {
    return <SessionTrades sessionId={session.id} />;
  }

  return (
    <div className="session-expanded-panel">
      <div className="session-tab-bar">
        <div className="session-tab-group">
          <button 
            onClick={() => setTab("chart")}
            className={`session-tab-btn ${tab === "chart" ? "session-tab-btn--active" : ""}`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Scanner</span>
          </button>
          <button 
            onClick={() => setTab("trades")}
            className={`session-tab-btn ${tab === "trades" ? "session-tab-btn--active" : ""}`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Trade List</span>
          </button>
          <button 
            onClick={() => setTab("logs")}
            className={`session-tab-btn ${tab === "logs" ? "session-tab-btn--active" : ""}`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Data Window</span>
          </button>
        </div>
      </div>
      <div className={tab === "logs" ? "w-full" : "p-4"}>
        {tab === "chart" ? (
          <div className="flex flex-col gap-4">
            {symbols.map(sym => (
              <div key={sym} className="flex flex-col border border-border">
                <SessionLiveChart sessionId={session.id} symbol={sym} strategyId={session.strategyId} />
              </div>
            ))}
          </div>
        ) : tab === "trades" ? (
          <SessionTrades sessionId={session.id} />
        ) : (
          <SessionLogs sessionId={session.id} />
        )}
      </div>
    </div>
  );
}

export default function AutoTradePage() {
  // Use a faster refetch interval so live updates show up, even in background
  const { data: sessions, isLoading } = useListAutoTradeSessions({ 
    query: { 
      queryKey: getListAutoTradeSessionsQueryKey(), 
      refetchInterval: 5000,
      refetchIntervalInBackground: true
    } 
  });
  const { data: strategies } = useListStrategies({});
  
  const createSession = useCreateAutoTradeSession();
  const updateSession = useUpdateAutoTradeSession();
  const deleteSession = useDeleteAutoTradeSession();
  
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    strategyId: "",
    symbols: ["R_100", "R_75"],
    pairMode: "rotating" as "single" | "simultaneous" | "rotating",
    mode: AutoTradeSessionInputMode.demo,
    stakeAmount: "10",
    duration: "15",
    durationUnit: "m",
    maxTrades: "",
    stopOnLoss: "",
    profitTarget: "",
    tradeProfitTarget: "",
    alternateDirection: false,
  });

  const [filter, setFilter] = useState<"all" | "active" | "past">("all");

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter(s => {
      if (filter === "active") return s.status === "running" || s.status === "paused";
      if (filter === "past") return s.status === "stopped" || s.status === "error";
      return true;
    });
  }, [sessions, filter]);

  const openNewForm = () => {
    setEditingId(null);
    setFormData({
      strategyId: "",
      symbols: ["R_100"],
      pairMode: "single",
      mode: AutoTradeSessionInputMode.demo,
      stakeAmount: "10",
      duration: "15",
      durationUnit: "m",
      maxTrades: "",
      stopOnLoss: "",
      profitTarget: "",
      tradeProfitTarget: "",
      alternateDirection: false,
    });
    setShowForm(true);
  };

  const openEditForm = (session: any) => {
    setEditingId(session.id);
    let parsedSymbols = [session.symbol];
    try {
      const arr = JSON.parse(session.symbols);
      if (Array.isArray(arr) && arr.length > 0) parsedSymbols = arr.map(String);
    } catch {}

    setFormData({
      strategyId: session.strategyId.toString(),
      symbols: parsedSymbols,
      pairMode: session.pairMode || "single",
      mode: session.mode,
      stakeAmount: session.stakeAmount.toString(),
      duration: session.duration.toString(),
      durationUnit: session.durationUnit,
      maxTrades: session.maxTrades ? session.maxTrades.toString() : "",
      stopOnLoss: session.stopOnLoss ? session.stopOnLoss.toString() : "",
      profitTarget: session.profitTarget ? session.profitTarget.toString() : "",
      tradeProfitTarget: session.tradeProfitTarget ? session.tradeProfitTarget.toString() : "",
      alternateDirection: session.alternateDirection || false,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.strategyId) {
      swalWarning("Select a strategy", "Please choose a strategy.");
      return;
    }

    const symbolsArray = formData.symbols.filter(s => s.trim().length > 0);
    if (symbolsArray.length === 0) {
      swalWarning("Missing symbols", "Please enter at least one symbol.");
      return;
    }

    const payload = {
      strategyId: parseInt(formData.strategyId),
      symbol: symbolsArray[0],
      symbols: symbolsArray,
      pairMode: formData.pairMode,
      mode: formData.mode,
      stakeAmount: parseFloat(formData.stakeAmount),
      duration: parseInt(formData.duration),
      durationUnit: formData.durationUnit,
      maxTrades: formData.maxTrades ? parseInt(formData.maxTrades) : null,
      stopOnLoss: formData.stopOnLoss ? parseFloat(formData.stopOnLoss) : null,
      profitTarget: formData.profitTarget ? parseFloat(formData.profitTarget) : null,
      tradeProfitTarget: formData.tradeProfitTarget ? parseFloat(formData.tradeProfitTarget) : null,
      alternateDirection: formData.alternateDirection,
    };

    if (editingId) {
      updateSession.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          swalSuccess("Session updated", "The session settings have been saved.");
          setShowForm(false);
          queryClient.invalidateQueries({ queryKey: ["/api/autotrade/sessions"] });
        },
        onError: (err: any) => {
          swalError("Failed to update", err?.response?.data?.error || err?.message);
        }
      });
    } else {
      createSession.mutate({ data: payload }, {
        onSuccess: () => {
          swalSuccess("Session started!", `Auto trading session is now running.`);
          setShowForm(false);
          queryClient.invalidateQueries({ queryKey: ["/api/autotrade/sessions"] });
        },
        onError: (err: any) => {
          swalError("Failed to create session", err?.response?.data?.error || err?.message);
        }
      });
    }
  };

  const handleUpdateStatus = (id: number, status: "running" | "paused" | "stopped") => {
    updateSession.mutate({ id, data: { status } }, {
      onSuccess: () => {
        swalSuccess(`Session ${status}`, `The session has been ${status} successfully.`);
        queryClient.invalidateQueries({ queryKey: ["/api/autotrade/sessions"] });
      },
      onError: (err: any) => swalError(`Failed to ${status} session`, err?.response?.data?.error || err?.message)
    });
  };

  const handleDelete = async (id: number) => {
    const confirmed = await swalConfirm("Delete session?", "This auto trading session will be permanently removed.", "Yes, delete it");
    if (!confirmed) return;
    deleteSession.mutate({ id }, {
      onSuccess: () => {
        swalSuccess("Session deleted", "The session has been removed.");
        queryClient.invalidateQueries({ queryKey: ["/api/autotrade/sessions"] });
      },
      onError: (err: any) => swalError("Failed to delete session", err?.response?.data?.error || err?.message)
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-7xl mx-auto mt-4">
        <div className="flex justify-between items-center shrink-0 mt-8">
          <h1 className="text-3xl font-bold font-mono uppercase tracking-tight text-foreground">Auto Trading Sessions</h1>
          <Button 
            className="rounded-none font-bold uppercase tracking-wider font-mono"
            onClick={() => showForm ? setShowForm(false) : openNewForm()}
          >
            {showForm ? "Cancel" : "New Session"}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 bg-muted/10 border border-border p-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-muted-foreground font-bold">Filter Sessions:</span>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-[200px] h-8 rounded-none border-border bg-background font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border bg-card text-foreground">
                <SelectItem value="all" className="font-mono text-xs uppercase">All Sessions</SelectItem>
                <SelectItem value="active" className="font-mono text-xs uppercase">Active (Running/Paused)</SelectItem>
                <SelectItem value="past" className="font-mono text-xs uppercase">Past (Stopped/Error)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          {/* List Panel */}
          <div className={`flex-1 border border-border bg-card overflow-auto ${showForm ? 'hidden md:block' : ''}`}>
            <table className="w-full text-sm font-mono text-left whitespace-nowrap">
              <thead className="bg-muted/30 sticky top-0 border-b border-border z-10">
                <tr>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Strategy</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Pairs</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Mode</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">P&L</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground uppercase">Loading...</td></tr>
                ) : !Array.isArray(filteredSessions) || filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground uppercase">
                      {filter === "active" ? "No active sessions found" : filter === "past" ? "No past sessions found" : "No sessions found"}
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map(s => {
                    let pairsDisplay = s.symbol;
                    try {
                      const arr = typeof s.symbols === "string" ? JSON.parse(s.symbols) : s.symbols;
                      if (Array.isArray(arr) && arr.length > 1) pairsDisplay = `${arr.length} Pairs (${s.pairMode})`;
                    } catch {}

                    return (
                      <React.Fragment key={s.id}>
                        <tr className="hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setExpandedSessionId(expandedSessionId === s.id ? null : s.id)}>
                          <td className="p-4 font-bold text-primary flex items-center gap-2">
                            <span className="text-[10px] bg-muted px-1.5 py-0.5">{expandedSessionId === s.id ? "▼" : "▶"}</span>
                            {(() => {
                              const strategyInfo = strategies?.find(st => st.id === s.strategyId);
                              let aiEnabled = false;
                              if (strategyInfo) {
                                try {
                                  const code = JSON.parse(strategyInfo.code);
                                  if (code.buy?.useAIConfirmation || code.sell?.useAIConfirmation) aiEnabled = true;
                                } catch {}
                              }
                              return (
                                <span className="flex items-center gap-2">
                                  {s.strategyName || `Strategy #${s.strategyId}`}
                                  {aiEnabled && <Bot className="w-4 h-4 text-primary" title="AI Confirmation Enabled" />}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-4 text-foreground">{pairsDisplay}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${s.mode === 'live' ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}`}>
                              {s.mode}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 text-xs uppercase ${s.status === 'running' ? 'text-primary font-bold animate-pulse' : s.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className={`p-4 font-bold ${s.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {s.totalPnl >= 0 ? '+' : ''}{s.totalPnl.toFixed(2)}
                            {s.profitTarget ? <span className="text-[10px] font-normal text-muted-foreground ml-1">/ {s.profitTarget}</span> : null}
                          </td>
                          <td className="p-4 text-right space-x-2" onClick={e => e.stopPropagation()}>
                            <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => openEditForm(s)}>Edit</Button>
                            {s.status === 'running' ? (
                              <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleUpdateStatus(s.id, "paused")}>Pause</Button>
                            ) : (
                              <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleUpdateStatus(s.id, "running")}>Start</Button>
                            )}
                            <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleUpdateStatus(s.id, "stopped")}>Stop</Button>
                            <Button variant="destructive" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleDelete(s.id)}>Del</Button>
                          </td>
                        </tr>
                        {expandedSessionId === s.id && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <SessionExpandedPanel session={s} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Form Panel */}
          {showForm && (
            <div className="w-full md:w-[400px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">{editingId ? "Edit Session" : "New Session"}</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Strategy</Label>
                  <Select value={formData.strategyId} onValueChange={(v) => setFormData({...formData, strategyId: v})} disabled={!!editingId}>
                    <SelectTrigger className="w-full rounded-none border-border font-mono text-sm h-10 bg-background">
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      {Array.isArray(strategies) ? strategies.map(st => (
                        <SelectItem key={st.id} value={st.id.toString()} className="font-mono text-xs uppercase">{st.name}</SelectItem>
                      )) : null}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Pairs</Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {formData.symbols.map((sym, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-primary/20 text-primary px-2 py-1 rounded-sm text-xs font-mono font-bold">
                          {sym}
                          <button type="button" onClick={() => setFormData({...formData, symbols: formData.symbols.filter((_, i) => i !== idx)})} className="hover:text-destructive ml-1">&times;</button>
                        </div>
                      ))}
                    </div>
                    <Input 
                      placeholder="Type symbol and press Enter..."
                      className="rounded-none font-mono border-border bg-background uppercase"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim().toUpperCase();
                          if (val && !formData.symbols.includes(val)) {
                            setFormData({...formData, symbols: [...formData.symbols, val]});
                          }
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['R_100', 'R_75', 'R_50', 'R_25', 'R_10', 'BTCUSD', 'ETHUSD'].map(sym => (
                        <button 
                          key={sym} type="button" 
                          onClick={() => !formData.symbols.includes(sym) && setFormData({...formData, symbols: [...formData.symbols, sym]})}
                          className="text-[10px] bg-muted/50 hover:bg-muted text-muted-foreground px-2 py-0.5 rounded-sm font-mono transition-colors"
                        >
                          +{sym}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Pair Execution Mode</Label>
                  <Select value={formData.pairMode} onValueChange={(v: any) => setFormData({...formData, pairMode: v})}>
                    <SelectTrigger className="w-full rounded-none border-border font-mono text-sm h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value="single" className="font-mono text-xs uppercase">Single (First Pair)</SelectItem>
                      <SelectItem value="rotating" className="font-mono text-xs uppercase">Rotating (One by One)</SelectItem>
                      <SelectItem value="simultaneous" className="font-mono text-xs uppercase">Simultaneous (All at Once)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Account Mode</Label>
                  <Select value={formData.mode} onValueChange={(v: any) => setFormData({...formData, mode: v})} disabled={!!editingId}>
                    <SelectTrigger className="w-full rounded-none border-border font-mono text-sm h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value={AutoTradeSessionInputMode.demo} className="font-mono text-xs uppercase">Demo</SelectItem>
                      <SelectItem value={AutoTradeSessionInputMode.live} className="font-mono text-xs uppercase text-destructive">Live</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Stake Amount (USD)</Label>
                  <Input 
                    required 
                    type="number"
                    value={formData.stakeAmount} 
                    onChange={e => setFormData({...formData, stakeAmount: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Duration</Label>
                    <Input 
                      required 
                      type="number"
                      value={formData.duration} 
                      onChange={e => setFormData({...formData, duration: e.target.value})}
                      className="rounded-none font-mono border-border bg-background"
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Unit</Label>
                    <Select value={formData.durationUnit} onValueChange={(v: any) => setFormData({...formData, durationUnit: v})}>
                      <SelectTrigger className="w-full rounded-none border-border font-mono text-sm h-10 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border">
                        <SelectItem value="t" className="font-mono text-xs uppercase">Ticks</SelectItem>
                        <SelectItem value="s" className="font-mono text-xs uppercase">Seconds</SelectItem>
                        <SelectItem value="m" className="font-mono text-xs uppercase">Minutes</SelectItem>
                        <SelectItem value="h" className="font-mono text-xs uppercase">Hours</SelectItem>
                        <SelectItem value="d" className="font-mono text-xs uppercase">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Per-Trade Profit Target ($) (Optional)</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.tradeProfitTarget} 
                      onChange={e => setFormData({...formData, tradeProfitTarget: e.target.value})}
                      className="rounded-none font-mono border-border bg-background"
                      placeholder="e.g. 2.50"
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Session Profit Target ($) (Optional)</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.profitTarget} 
                      onChange={e => setFormData({...formData, profitTarget: e.target.value})}
                      className="rounded-none font-mono border-border bg-background"
                      placeholder="e.g. 50.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Stop on Loss (USD) (Optional)</Label>
                  <Input 
                    type="number"
                    value={formData.stopOnLoss} 
                    onChange={e => setFormData({...formData, stopOnLoss: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Max Trades (Optional)</Label>
                  <Input 
                    type="number"
                    value={formData.maxTrades} 
                    onChange={e => setFormData({...formData, maxTrades: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="alternateDirection"
                    checked={formData.alternateDirection}
                    onChange={e => setFormData({...formData, alternateDirection: e.target.checked})}
                    className="h-4 w-4 bg-background border-border rounded-sm"
                  />
                  <Label htmlFor="alternateDirection" className="text-xs uppercase font-mono text-foreground cursor-pointer">
                    Alternate direction after each trade
                  </Label>
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button type="submit" disabled={createSession.isPending || updateSession.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {editingId ? (updateSession.isPending ? "Saving..." : "Save Changes") : (createSession.isPending ? "Starting..." : "Start Session")}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
