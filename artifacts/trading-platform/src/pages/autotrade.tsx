import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListAutoTradeSessions, useCreateAutoTradeSession, useUpdateAutoTradeSession, useDeleteAutoTradeSession, useListStrategies, AutoTradeSessionInputMode, AutoTradeSessionUpdateStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function AutoTradePage() {
  const { data: sessions, isLoading } = useListAutoTradeSessions({});
  const { data: strategies } = useListStrategies({});
  
  const createSession = useCreateAutoTradeSession();
  const updateSession = useUpdateAutoTradeSession();
  const deleteSession = useDeleteAutoTradeSession();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    strategyId: "",
    symbol: "R_100",
    mode: AutoTradeSessionInputMode.demo,
    stakeAmount: "10",
    maxTrades: "",
    stopOnLoss: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.strategyId) {
      toast({ variant: "destructive", title: "Error", description: "Select a strategy" });
      return;
    }
    createSession.mutate({
      data: {
        strategyId: parseInt(formData.strategyId),
        symbol: formData.symbol,
        mode: formData.mode,
        stakeAmount: parseFloat(formData.stakeAmount),
        maxTrades: formData.maxTrades ? parseInt(formData.maxTrades) : null,
        stopOnLoss: formData.stopOnLoss ? parseFloat(formData.stopOnLoss) : null
      }
    }, {
      onSuccess: () => {
        toast({ title: "Session created" });
        setShowForm(false);
        queryClient.invalidateQueries({ queryKey: ["/api/autotrade"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      }
    });
  };

  const handleUpdateStatus = (id: number, status: AutoTradeSessionUpdateStatus) => {
    updateSession.mutate({
      id,
      data: { status }
    }, {
      onSuccess: () => {
        toast({ title: `Session ${status}` });
        queryClient.invalidateQueries({ queryKey: ["/api/autotrade"] });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this session?")) {
      deleteSession.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Session deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/autotrade"] });
        }
      });
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center shrink-0">
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Auto Trading Sessions</h1>
          <Button 
            className="rounded-none font-bold uppercase tracking-wider font-mono"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "New Session"}
          </Button>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          {/* List Panel */}
          <div className={`flex-1 border border-border bg-card overflow-auto ${showForm ? 'hidden md:block' : ''}`}>
            <table className="w-full text-sm font-mono text-left whitespace-nowrap">
              <thead className="bg-muted/30 sticky top-0 border-b border-border">
                <tr>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Strategy</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Symbol</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Mode</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">P&L</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground uppercase">Loading...</td></tr>
                ) : !Array.isArray(sessions) || sessions.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground uppercase">No active sessions</td></tr>
                ) : (
                  sessions.map(s => (
                    <tr key={s.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-bold text-primary">{s.strategyName || `Strategy #${s.strategyId}`}</td>
                      <td className="p-4 text-foreground">{s.symbol}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${s.mode === 'live' ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}`}>
                          {s.mode}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 text-xs uppercase ${s.status === 'running' ? 'text-primary' : s.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className={`p-4 font-bold ${s.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {s.totalPnl >= 0 ? '+' : ''}{s.totalPnl.toFixed(2)}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {s.status === 'running' ? (
                          <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleUpdateStatus(s.id, AutoTradeSessionUpdateStatus.paused)}>Pause</Button>
                        ) : (
                          <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleUpdateStatus(s.id, AutoTradeSessionUpdateStatus.running)}>Start</Button>
                        )}
                        <Button variant="outline" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleUpdateStatus(s.id, AutoTradeSessionUpdateStatus.stopped)}>Stop</Button>
                        <Button variant="destructive" size="sm" className="rounded-none text-[10px] uppercase font-mono h-6" onClick={() => handleDelete(s.id)}>Del</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Form Panel */}
          {showForm && (
            <div className="w-full md:w-[350px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">New Session</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Strategy</Label>
                  <Select value={formData.strategyId} onValueChange={(v) => setFormData({...formData, strategyId: v})}>
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
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Symbol</Label>
                  <Input 
                    required 
                    value={formData.symbol} 
                    onChange={e => setFormData({...formData, symbol: e.target.value})}
                    className="rounded-none font-mono border-border bg-background uppercase"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Mode</Label>
                  <Select value={formData.mode} onValueChange={(v: any) => setFormData({...formData, mode: v})}>
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

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Max Trades (Optional)</Label>
                  <Input 
                    type="number"
                    value={formData.maxTrades} 
                    onChange={e => setFormData({...formData, maxTrades: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
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

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button type="submit" disabled={createSession.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {createSession.isPending ? "Starting..." : "Start Session"}
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
