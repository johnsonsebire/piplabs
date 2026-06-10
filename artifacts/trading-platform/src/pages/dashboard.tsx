import { AppLayout } from "@/components/layout/AppLayout";
import { useGetDashboardSummary, useGetMe } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function StatCard({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="col">
      <div className="card h-100 stat-card">
        <div className="card-header p-3 pb-2 d-flex align-items-center justify-content-between bg-transparent border-0">
          <span className="font-mono text-secondary text-uppercase letter-spacing-wider" style={{ fontSize: '0.6875rem' }}>{title}</span>
          {badge}
        </div>
        <div className="card-body pt-0 px-3 pb-3">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: user, isLoading: isLoadingUser } = useGetMe();

  const livePnl = summary?.livePnlToday || 0;
  const demoPnl = summary?.demoPnlToday || 0;

  return (
    <AppLayout>
      <div className="p-4 overflow-auto w-100 h-100 d-flex flex-column gap-4">
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mt-4">
          <div>
            <h1 className="h5 fw-bold text-uppercase mb-0" style={{ letterSpacing: '-0.02em' }}>System Status</h1>
            <div className="d-flex align-items-center gap-2 mt-1">
              <div className="rounded-circle" style={{ width: '0.375rem', height: '0.375rem', backgroundColor: summary?.derivConnected ? '#10b981' : '#ef4444', animation: 'pulse 2s infinite' }}></div>
              <span className="font-mono text-secondary text-uppercase letter-spacing-widest" style={{ fontSize: '0.5625rem' }}>
                {isLoadingSummary ? 'Loading...' : summary?.derivConnected ? 'All systems operational' : 'Deriv disconnected'}
              </span>
            </div>
          </div>
          <div className="d-flex gap-2">
            <Link href="/chart">
              <Button className="small text-uppercase fw-bold letter-spacing-wider">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                Open Chart
              </Button>
            </Link>
            <Link href="/trades">
              <Button variant="outline" className="small text-uppercase fw-bold letter-spacing-wider">Trade History</Button>
            </Link>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3">
          {/* Account Balance */}
          <StatCard 
            title="Account Balance"
            badge={summary?.accountMode && (
              <span 
                className="badge font-mono text-uppercase fw-bold letter-spacing-widest" 
                style={{ 
                  fontSize: '0.5625rem',
                  color: summary.accountMode === 'live' ? '#ef4444' : '#10b981',
                  backgroundColor: summary.accountMode === 'live' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                  border: `1px solid ${summary.accountMode === 'live' ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`
                }}
              >
                {summary.accountMode}
              </span>
            )}
          >
            {isLoadingSummary ? (
              <Skeleton className="w-100" style={{ height: '2rem' }} />
            ) : !summary?.derivConnected ? (
              <div className="font-mono text-secondary text-uppercase" style={{ fontSize: '0.75rem' }}>
                No Deriv account connected.{' '}
                <Link href="/settings" className="text-success text-decoration-none fw-bold">Connect →</Link>
              </div>
            ) : summary?.balanceError ? (
              <div>
                <div className="font-mono text-danger text-uppercase" style={{ fontSize: '0.75rem' }}>Balance unavailable</div>
                <div className="font-mono text-secondary mt-1 text-truncate" style={{ fontSize: '0.5625rem' }} title={summary.balanceError}>{summary.balanceError}</div>
              </div>
            ) : summary?.accountBalance == null ? (
              <div className="font-mono text-secondary h4 mb-0">—</div>
            ) : (
              <div>
                <div className="h3 fw-bold font-mono mb-0 text-success">
                  <span className="text-secondary me-1" style={{ fontSize: '0.75rem' }}>{summary?.currency || 'USD'}</span>
                  {summary.accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                {summary?.loginId && (
                  <div className="font-mono text-secondary mt-1 letter-spacing-wider" style={{ fontSize: '0.5625rem' }}>
                    {summary.loginId}
                  </div>
                )}
              </div>
            )}
          </StatCard>

          {/* Today's P&L */}
          <StatCard title="Today's P&L (Live / Demo)">
            {isLoadingSummary ? (
              <Skeleton className="w-100" style={{ height: '2rem' }} />
            ) : (
              <div className="d-flex align-items-baseline gap-2">
                <div className={`h4 fw-bold font-mono mb-0 ${livePnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {livePnl >= 0 ? '+' : ''}{livePnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span className="ms-1 text-secondary" style={{ fontSize: '0.5625rem' }}>LIVE</span>
                </div>
                <span className="text-secondary fw-light">/</span>
                <div className={`h4 fw-bold font-mono mb-0 ${demoPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {demoPnl >= 0 ? '+' : ''}{demoPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span className="ms-1 text-secondary" style={{ fontSize: '0.5625rem' }}>DEMO</span>
                </div>
              </div>
            )}
          </StatCard>

          {/* Win Rate */}
          <StatCard title="Win Rate (Today)">
            {isLoadingSummary ? (
              <Skeleton className="w-100" style={{ height: '2rem' }} />
            ) : (
              <div>
                <div className="h3 fw-bold font-mono mb-0 text-success">
                  {(summary?.winRateToday || 0).toFixed(1)}%
                </div>
                {/* Mini progress bar */}
                <div className="mt-2" style={{ height: '3px', backgroundColor: 'rgba(30,41,59,0.5)' }}>
                  <div style={{ width: `${Math.min(summary?.winRateToday || 0, 100)}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.6s ease' }}></div>
                </div>
              </div>
            )}
          </StatCard>

          {/* Active Trades */}
          <StatCard title="Active Trades">
            {isLoadingSummary ? (
              <Skeleton className="w-100" style={{ height: '2rem' }} />
            ) : (
              <div className="d-flex align-items-baseline gap-3">
                <div className="h3 fw-bold font-mono mb-0 text-success">
                  {summary?.liveOpenTrades || 0}
                  <span className="ms-1 text-secondary text-uppercase font-mono letter-spacing-widest" style={{ fontSize: '0.5625rem' }}>Live</span>
                </div>
                <span className="text-secondary fw-light">/</span>
                <div className="h3 fw-bold font-mono mb-0">
                  {summary?.demoOpenTrades || 0}
                  <span className="ms-1 text-secondary text-uppercase font-mono letter-spacing-widest" style={{ fontSize: '0.5625rem' }}>Demo</span>
                </div>
              </div>
            )}
          </StatCard>
        </div>

        {/* Bottom Section - Recent Activity + System Info */}
        <div className="row g-4 flex-1" style={{ minHeight: 0 }}>
          {/* Recent Activity Table */}
          <div className="col-lg-8 d-flex flex-column" style={{ minHeight: '300px' }}>
            <div className="card flex-1 d-flex flex-column">
              <div className="card-header p-3 d-flex align-items-center justify-content-between bg-transparent">
                <span className="font-mono text-uppercase letter-spacing-wider" style={{ fontSize: '0.6875rem' }}>Recent Activity</span>
                <Link href="/trades" className="text-success text-decoration-none font-mono text-uppercase letter-spacing-wider" style={{ fontSize: '0.5625rem' }}>
                  View All →
                </Link>
              </div>
              <div className="card-body p-0 overflow-auto">
                {isLoadingSummary ? (
                  <div className="p-3 d-flex flex-column gap-3">
                    <Skeleton className="w-100" style={{ height: '2.5rem' }} />
                    <Skeleton className="w-100" style={{ height: '2.5rem' }} />
                    <Skeleton className="w-100" style={{ height: '2.5rem' }} />
                  </div>
                ) : summary?.recentActivity && summary.recentActivity.length > 0 ? (
                  <table className="table table-sm table-hover font-mono mb-0" style={{ fontSize: '0.75rem' }}>
                    <thead>
                      <tr>
                        <th className="py-3 fw-normal text-secondary text-uppercase letter-spacing-wider border-0" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>ID</th>
                        <th className="py-3 fw-normal text-secondary text-uppercase letter-spacing-wider border-0" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>Mode</th>
                        <th className="py-3 fw-normal text-secondary text-uppercase letter-spacing-wider border-0" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>Asset</th>
                        <th className="py-3 fw-normal text-secondary text-uppercase letter-spacing-wider border-0" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>Type</th>
                        <th className="py-3 fw-normal text-secondary text-uppercase letter-spacing-wider border-0" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>Status</th>
                        <th className="py-3 fw-normal text-secondary text-uppercase letter-spacing-wider border-0 text-end" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recentActivity.map((trade) => (
                        <tr key={trade.id} className="trade-row" style={{ cursor: 'pointer' }}>
                          <td className="py-3 border-color-subtle">
                            <Link href={`/trades/${trade.id}`} className="text-success text-decoration-none fw-bold">
                              #{trade.id}
                            </Link>
                          </td>
                          <td className="py-3 border-color-subtle">
                            <span 
                              className="badge font-mono text-uppercase fw-bold letter-spacing-widest" 
                              style={{ 
                                fontSize: '0.5625rem',
                                color: trade.mode === 'live' ? '#ef4444' : '#10b981',
                                backgroundColor: trade.mode === 'live' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                border: `1px solid ${trade.mode === 'live' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`
                              }}
                            >
                              {trade.mode}
                            </span>
                          </td>
                          <td className="py-3 border-color-subtle fw-medium">{trade.displayName}</td>
                          <td className="py-3 border-color-subtle">
                            <span className={`fw-bold ${trade.direction === 'buy' || trade.direction === 'call' ? 'text-success' : 'text-danger'}`}>
                              {trade.direction.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 border-color-subtle text-secondary text-uppercase">{trade.status.toUpperCase()}</td>
                          <td className={`py-3 border-color-subtle text-end fw-bold ${trade.currentProfit && trade.currentProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                            {trade.currentProfit ? (trade.currentProfit >= 0 ? '+' : '') + trade.currentProfit.toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="d-flex flex-column h-100 align-items-center justify-content-center p-5 text-center">
                    <div className="mb-3" style={{ opacity: 0.3 }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                      </svg>
                    </div>
                    <div className="text-secondary font-mono small text-uppercase letter-spacing-wider">No recent trades found</div>
                    <Link href="/chart" className="text-success text-decoration-none font-mono mt-2" style={{ fontSize: '0.6875rem' }}>
                      Start Trading →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* System Info Panel */}
          <div className="col-lg-4 d-flex flex-column" style={{ minHeight: '300px' }}>
            <div className="card flex-1 d-flex flex-column">
              <div className="card-header p-3 bg-transparent">
                <span className="font-mono text-uppercase letter-spacing-wider" style={{ fontSize: '0.6875rem' }}>System Info</span>
              </div>
              <div className="card-body p-0 d-flex flex-column font-mono" style={{ fontSize: '0.75rem' }}>
                {/* System info rows */}
                <div className="d-flex justify-content-between align-items-center px-3 py-3" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                  <span className="text-secondary">API Connection</span>
                  {isLoadingSummary ? (
                    <Skeleton style={{ width: '4rem', height: '1.25rem' }} />
                  ) : (
                    <span className={`d-flex align-items-center gap-2 fw-bold text-uppercase ${summary?.derivConnected ? 'text-success' : 'text-danger'}`}>
                      <span className="rounded-circle" style={{ width: '0.375rem', height: '0.375rem', backgroundColor: 'currentColor', display: 'inline-block' }}></span>
                      {summary?.derivConnected ? 'Online' : 'Offline'}
                    </span>
                  )}
                </div>
                <div className="d-flex justify-content-between align-items-center px-3 py-3" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                  <span className="text-secondary">Open Trades</span>
                  <span className="fw-bold">{summary?.openTradesCount || 0}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center px-3 py-3" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                  <span className="text-secondary">Total Trades</span>
                  <span className="fw-bold">{summary?.totalTradesAllTime || 0}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center px-3 py-3" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                  <span className="text-secondary">Account Role</span>
                  <span className="text-uppercase text-success fw-bold">{user?.role || '...'}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center px-3 py-3" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
                  <span className="text-secondary">Platform</span>
                  <span className="fw-bold text-uppercase letter-spacing-wider" style={{ fontSize: '0.625rem' }}>PipLabs v1.0</span>
                </div>
                
                {/* Connect CTA if disconnected */}
                {!summary?.derivConnected && !isLoadingSummary && (
                  <div className="p-3 mt-auto">
                    <Link href="/settings">
                      <Button variant="destructive" className="w-100 text-uppercase fw-bold letter-spacing-wider small">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-1">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                          <line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                        Connect Deriv API
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
