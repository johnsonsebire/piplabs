import { useState } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { 
  useGetTrade, 
  useCloseTrade, 
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function TradeDetailPage() {
  const [, params] = useRoute("/trades/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trade, isLoading: isTradeLoading } = useGetTrade(id, {
    query: { enabled: !!id, queryKey: getGetTradeQueryKey(id) }
  });

  const { data: logs, isLoading: isLogsLoading } = useListTradeLogs(id, {
    query: { enabled: !!id, queryKey: getListTradeLogsQueryKey(id) }
  });

  const { data: comments, isLoading: isCommentsLoading } = useListTradeComments(id, {
    query: { enabled: !!id, queryKey: getListTradeCommentsQueryKey(id) }
  });

  const aiParams = { tradeId: id, limit: 5 };
  const { data: analyses } = useListAIAnalyses(aiParams, {
    query: { enabled: !!id, queryKey: getListAIAnalysesQueryKey(aiParams) }
  });

  const closeTrade = useCloseTrade();
  const addComment = useAddTradeComment();
  const analyzeTrade = useAnalyzeWithAI();

  const [commentText, setCommentText] = useState("");

  const handleClose = () => {
    closeTrade.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Trade closed successfully" });
        queryClient.invalidateQueries({ queryKey: getGetTradeQueryKey(id) });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to close trade", description: err?.message });
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
        toast({ title: "Analysis complete" });
        // Would invalidate list here if we exported the key helper for it
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Analysis failed", description: err?.message });
      }
    });
  };

  if (!id) return null;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-start shrink-0">
          <div>
            <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Trade #{id}</h1>
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
                {closeTrade.isPending ? "Closing..." : "Close Trade"}
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
        <div className="border border-border bg-card p-6 grid grid-cols-2 md:grid-cols-4 gap-6 shrink-0">
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
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Status</p>
                <p className="font-mono font-bold uppercase">{trade.status}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">P&L</p>
                <p className={`font-mono font-bold ${trade.currentProfit && trade.currentProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
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
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Exit Price</p>
                <p className="font-mono text-sm">{trade.exitPrice ? trade.exitPrice.toFixed(4) : '---'}</p>
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
              <TabsTrigger value="logs" className="rounded-none font-mono text-xs uppercase h-full data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary bg-transparent shadow-none">Audit Log</TabsTrigger>
              <TabsTrigger value="comments" className="rounded-none font-mono text-xs uppercase h-full data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary bg-transparent shadow-none">Comments</TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs" className="flex-1 p-0 m-0 overflow-auto">
              <div className="p-4 space-y-2">
                {isLogsLoading ? (
                  <Skeleton className="h-10 w-full bg-muted rounded-none" />
                ) : !Array.isArray(logs) || logs.length === 0 ? (
                  <p className="text-muted-foreground font-mono text-sm">No logs found.</p>
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