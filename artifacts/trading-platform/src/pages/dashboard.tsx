import { AppLayout } from "@/components/layout/AppLayout";
import { useGetDashboardSummary, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: user, isLoading: isLoadingUser } = useGetMe();

  return (
    <AppLayout>
      <div className="p-6 overflow-auto w-full h-full flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold uppercase tracking-tight">System Status</h1>
          <div className="flex gap-2">
            <Link href="/chart">
              <Button className="rounded-none text-xs uppercase font-bold tracking-wider">Open Chart</Button>
            </Link>
            <Link href="/trades">
              <Button variant="outline" className="rounded-none text-xs uppercase font-bold tracking-wider">Trade History</Button>
            </Link>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-none border-border bg-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Account Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-24 rounded-none bg-muted" />
              ) : (
                <div className="text-3xl font-bold font-mono">
                  {summary?.currency || 'USD'} {(summary?.accountBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Today's P&L</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-24 rounded-none bg-muted" />
              ) : (
                <div className={`text-3xl font-bold font-mono ${(summary?.totalPnlToday || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {(summary?.totalPnlToday || 0) >= 0 ? '+' : ''}{(summary?.totalPnlToday || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Win Rate (Today)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-24 rounded-none bg-muted" />
              ) : (
                <div className="text-3xl font-bold font-mono text-primary">
                  {(summary?.winRateToday || 0).toFixed(1)}%
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Active Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {isLoadingSummary ? (
                <Skeleton className="h-8 w-24 rounded-none bg-muted" />
              ) : (
                <div className="text-3xl font-bold font-mono text-primary">
                  {summary?.activeTrades || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <Card className="lg:col-span-2 rounded-none border-border bg-card flex flex-col min-h-[300px]">
            <CardHeader className="p-4 border-b border-border shrink-0">
              <CardTitle className="text-sm font-mono text-foreground uppercase tracking-wider">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
              {isLoadingSummary ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full rounded-none bg-muted" />
                  <Skeleton className="h-10 w-full rounded-none bg-muted" />
                  <Skeleton className="h-10 w-full rounded-none bg-muted" />
                </div>
              ) : summary?.recentActivity && summary.recentActivity.length > 0 ? (
                <table className="w-full text-sm font-mono text-left">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="p-3 font-normal text-muted-foreground">ID</th>
                      <th className="p-3 font-normal text-muted-foreground">ASSET</th>
                      <th className="p-3 font-normal text-muted-foreground">TYPE</th>
                      <th className="p-3 font-normal text-muted-foreground">STATUS</th>
                      <th className="p-3 font-normal text-muted-foreground text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.recentActivity.map((trade) => (
                      <tr key={trade.id} className="hover:bg-muted/10 transition-colors">
                        <td className="p-3">
                          <Link href={`/trades/${trade.id}`} className="text-primary hover:underline">
                            #{trade.id}
                          </Link>
                        </td>
                        <td className="p-3 text-foreground">{trade.displayName}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-xs ${trade.direction === 'buy' || trade.direction === 'call' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                            {trade.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{trade.status.toUpperCase()}</td>
                        <td className={`p-3 text-right ${trade.currentProfit && trade.currentProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {trade.currentProfit ? (trade.currentProfit >= 0 ? '+' : '') + trade.currentProfit.toFixed(2) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-muted-foreground font-mono text-sm uppercase">
                  No recent trades found
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card flex flex-col min-h-[300px]">
            <CardHeader className="p-4 border-b border-border shrink-0">
              <CardTitle className="text-sm font-mono text-foreground uppercase tracking-wider">System Info</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">API Connection</span>
                {isLoadingSummary ? (
                  <Skeleton className="h-5 w-16 bg-muted" />
                ) : (
                  <span className={summary?.derivConnected ? 'text-primary' : 'text-destructive'}>
                    {summary?.derivConnected ? 'ONLINE' : 'OFFLINE'}
                  </span>
                )}
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Open Trades</span>
                <span>{summary?.openTradesCount || 0}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Total Trades</span>
                <span>{summary?.totalTradesAllTime || 0}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Account Role</span>
                <span className="uppercase text-primary">{user?.role || '...'}</span>
              </div>
              
              {!summary?.derivConnected && !isLoadingSummary && (
                <div className="pt-4">
                  <Link href="/settings">
                    <Button variant="destructive" className="w-full rounded-none uppercase font-bold tracking-wider text-xs">
                      Connect Deriv API
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}