import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { 
  useGetTrade, 
  useCloseTrade, 
  useUpdateTrade,
  useListTradeLogs, 
  useListTradeComments, 
  useAddTradeComment, 
  useAnalyzeWithAI, 
  useListAIAnalyses,
  TradeStatus,
  getGetTradeQueryKey,
  getListTradeLogsQueryKey,
  getListTradeCommentsQueryKey,
  getListAIAnalysesQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { swalSuccess, swalError, swalConfirm } from "@/lib/swal";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInSeconds } from "date-fns";
import { Edit2, Check, X } from "lucide-react";

function calculateTimeRemaining(openedAt: string, duration?: number | null, unit?: string | null): string | null {
  if (!duration || !unit || unit === 't') return null;
  const start = new Date(openedAt);
  let durationSeconds = 0;
  if (unit === 's') durationSeconds = duration;
  if (unit === 'm') durationSeconds = duration * 60;
  if (unit === 'h') durationSeconds = duration * 3600;
  if (unit === 'd') durationSeconds = duration * 86400;

  const end = new Date(start.getTime() + durationSeconds * 1000);
  const now = new Date();
  const diffSec = differenceInSeconds(end, now);
  if (diffSec <= 0) return "Closing...";

  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m > 60) {
    const h = Math.floor(m / 60);
    const hm = m % 60;
    return `${h}h ${hm}m`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TradeDetailPage() {
  const [, params] = useRoute("/trades/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const queryClient = useQueryClient();

  const { data: trade, isLoading: isTradeLoading } = useGetTrade(id, {
    query: { enabled: !!id, queryKey: getGetTradeQueryKey(id), refetchInterval: 5000 }
  });

  const { data: logs, isLoading: isLogsLoading } = useListTradeLogs(id, {
    query: { enabled: !!id, queryKey: getListTradeLogsQueryKey(id), refetchInterval: 5000 }
  });

  const { data: comments, isLoading: isCommentsLoading } = useListTradeComments(id, {
    query: { enabled: !!id, queryKey: getListTradeCommentsQueryKey(id) }
  });

  const aiParams = { tradeId: id, limit: 5 };
  const { data: analyses } = useListAIAnalyses(aiParams, {
    query: { enabled: !!id, queryKey: getListAIAnalysesQueryKey(aiParams) }
  });

  const closeTrade = useCloseTrade();
  const updateTrade = useUpdateTrade();
  const addComment = useAddTradeComment();
  const analyzeTrade = useAnalyzeWithAI();

  const [commentText, setCommentText] = useState("");
  const [editingTp, setEditingTp] = useState(false);
  const [tpValue, setTpValue] = useState("");
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (trade && trade.status === 'open') {
      const interval = setInterval(() => {
        setTimeLeft(calculateTimeRemaining(trade.openedAt, trade.duration, trade.durationUnit));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
    return () => {};
  }, [trade]);

  const handleClose = async () => {
    const confirmed = await swalConfirm("Close Trade?", "Are you sure you want to manually sell this contract at market price?", "Yes, sell it");
    if (!confirmed) return;

    closeTrade.mutate({ id }, {
      onSuccess: (res: any) => {
        swalSuccess("Trade closed", `Contract sold for $${res.currentProfit + trade!.stake}.`);
        queryClient.invalidateQueries({ queryKey: getGetTradeQueryKey(id) });
      },
      onError: (err: any) => {
        swalError("Failed to close trade", err?.response?.data?.error || err?.message);
      }
    });
  };

  const handleSaveTp = () => {
    const val = parseFloat(tpValue);
    if (isNaN(val)) {
      swalError("Invalid Input", "Target profit must be a number.");
      return;
    }
    updateTrade.mutate({ id, data: { targetProfit: val } }, {
      onSuccess: () => {
        swalSuccess("Target Profit Updated", "Auto-sell target has been updated.");
        setEditingTp(false);
        queryClient.invalidateQueries({ queryKey: getGetTradeQueryKey(id) });
      },
      onError: (err: any) => {
        swalError("Failed to update TP", err?.response?.data?.error || err?.message);
      }
    });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment.mutate({ id, data: { content: commentText } }, {
      onSuccess: () => {
        setCommentText("");
        queryClient.invalidateQueries({ queryKey: getListTradeCommentsQueryKey(id) });
      }
    });
  };

  const handleAnalyze = () => {
    if (!trade) return;
    analyzeTrade.mutate({
      data: {
        symbol: trade.symbol,
        tradeType: trade.type as any,
        direction: trade.direction as any,
        tradeId: trade.id
      }
    }, {
      onSuccess: () => {
        swalSuccess("Analysis complete", "AI has evaluated the trade.");
      },
      onError: (err: any) => {
        swalError("Analysis failed", err?.response?.data?.error || err?.message);
      }
    });
  };

  if (!id) return null;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-4 gap-4 max-w-[1400px] mx-auto">
        <div className="flex justify-between items-start shrink-0 mt-4">
          <div>
            <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground flex items-center gap-4">
              Trade #{id}
              {trade?.status === 'open' && (
                <span className="text-sm px-2 py-1 bg-primary/20 text-primary animate-pulse tracking-widest">LIVE</span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-wider">{trade?.displayName || "---"}</p>
          </div>
          <div className="flex gap-2">
            {trade?.status === TradeStatus.open && (
              <Button 
                variant="destructive" 
                className="rounded-none font-bold uppercase tracking-wider"
                onClick={handleClose}
                disabled={closeTrade.isPending}
                data-testid="button-close-trade"
              >
                {closeTrade.isPending ? "Selling..." : "Sell at Market"}
              </Button>
            )}
            <Button 
              variant="outline" 
              className="rounded-none font-bold uppercase tracking-wider border-primary text-primary hover:bg-primary/10 hover:text-primary"
              onClick={handleAnalyze}
              disabled={analyzeTrade.isPending || !trade}
              data-testid="button-analyze-trade"
            >
              {analyzeTrade.isPending ? "Analyzing..." : "Analyze with AI"}
            </Button>
          </div>
        </div>

        {/* Info Card */}
        <div className="border border-border bg-card p-6 grid grid-cols-2 md:grid-cols-4 gap-6 shrink-0 relative">
          {isTradeLoading ? (
            Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-muted rounded-none" />)
          ) : trade ? (
            <>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Type / Direction</p>
                <p className="font-mono font-bold uppercase">
                  {trade.type} / <span className={trade.direction === 'buy' || trade.direction === 'call' ? 'text-primary' : 'text-destructive'}>{trade.direction}</span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Stake</p>
                <p className="font-mono font-bold">${trade.stake.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Status / Time Left</p>
                <p className="font-mono font-bold uppercase">
                  {trade.status}
                  {timeLeft && <span className="text-muted-foreground ml-2">({timeLeft})</span>}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Live P&L</p>
                <p className={`font-mono font-bold text-lg ${trade.currentProfit && trade.currentProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {trade.currentProfit !== null && trade.currentProfit !== undefined ? 
                    `${trade.currentProfit >= 0 ? '+' : ''}$${trade.currentProfit.toFixed(2)}` : '---'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Opened At</p>
                <p className="font-mono text-sm">{format(new Date(trade.openedAt), "yyyy-MM-dd HH:mm:ss")}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Closed At</p>
                <p className="font-mono text-sm">{trade.closedAt ? format(new Date(trade.closedAt), "yyyy-MM-dd HH:mm:ss") : '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Entry Price</p>
                <p className="font-mono text-sm">{trade.entryPrice ? trade.entryPrice.toFixed(4) : '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Target Profit (TP)</p>
                {editingTp ? (
                  <div className="flex gap-2 items-center">
                    <Input 
                      type="number" 
                      className="h-7 w-20 rounded-none font-mono text-sm p-1" 
                      value={tpValue} 
                      onChange={e => setTpValue(e.target.value)} 
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" onClick={handleSaveTp}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingTp(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="font-mono text-sm flex items-center gap-2 group">
                    {trade.targetProfit ? `$${trade.targetProfit.toFixed(2)}` : 'None'}
                    <button className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setTpValue(trade.targetProfit?.toString() || ""); setEditingTp(true); }}>
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* AI Analyses (if any) */}
        {analyses && analyses.length > 0 && (
          <div className="border border-border bg-primary/5 p-4 shrink-0">
            <h3 className="text-xs font-bold font-mono text-primary uppercase mb-3">AI Analysis Result</h3>
            <div className="space-y-2 text-sm font-mono text-foreground">
              <p><span className="text-muted-foreground">Recommendation:</span> <span className="uppercase font-bold">{analyses[0].recommendation}</span> (Confidence: {analyses[0].confidence}%)</p>
              <p><span className="text-muted-foreground">Reasoning:</span> {analyses[0].reasoning}</p>
            </div>
          </div>
        )}

        {/* Tabs for Logs and Comments */}
        <div className="flex-1 min-h-0 flex flex-col border border-border bg-card">
          <Tabs defaultValue="logs" className="h-full flex flex-col">
            <TabsList className="rounded-none border-b border-border bg-muted/30 p-0 h-10 w-full justify-start shrink-0">
              <TabsTrigger value="logs" className="rounded-none font-mono text-xs uppercase h-full data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary bg-transparent shadow-none">Activity Log</TabsTrigger>
              <TabsTrigger value="comments" className="rounded-none font-mono text-xs uppercase h-full data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary bg-transparent shadow-none">Comments</TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs" className="flex-1 p-0 m-0 overflow-auto">
              <div className="p-4 space-y-2">
                {isLogsLoading ? (
                  <Skeleton className="h-10 w-full bg-muted rounded-none" />
                ) : !Array.isArray(logs) || logs.length === 0 ? (
                  <p className="text-muted-foreground font-mono text-sm">No activity logs found.</p>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="flex gap-4 text-sm font-mono border-b border-border pb-2 last:border-0">
                      <span className="text-muted-foreground w-40 shrink-0">{format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}</span>
                      <span className={`w-20 shrink-0 uppercase ${log.level === 'error' ? 'text-destructive' : log.level === 'success' ? 'text-primary' : 'text-foreground'}`}>{log.level}</span>
                      <span className="text-foreground flex-1">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="comments" className="flex-1 p-0 m-0 flex flex-col">
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {isCommentsLoading ? (
                  <Skeleton className="h-16 w-full bg-muted rounded-none" />
                ) : !Array.isArray(comments) || comments.length === 0 ? (
                  <p className="text-muted-foreground font-mono text-sm">No comments yet.</p>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="bg-muted/10 p-3 border border-border">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-xs font-mono uppercase text-primary">{comment.userDisplayName || 'User'}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{format(new Date(comment.createdAt), "yyyy-MM-dd HH:mm")}</span>
                      </div>
                      <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-border bg-background shrink-0">
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Input 
                    value={commentText} 
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Add a comment..." 
                    className="rounded-none font-mono border-border bg-card"
                    data-testid="input-comment"
                  />
                  <Button type="submit" disabled={!commentText.trim() || addComment.isPending} className="rounded-none font-bold uppercase font-mono shrink-0" data-testid="button-add-comment">
                    Post
                  </Button>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}