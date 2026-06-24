import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useListJournals, useGetJournalStats, useDeleteJournal, JournalEntry, useListJournalWorkspaces } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Settings, TrendingUp, TrendingDown, Target, Activity, MoreVertical, Edit, Trash2, BookOpen, Calendar, List, BarChart2, Download, Wallet, AlertCircle, Hash, Clock } from "lucide-react";
import { JournalFormModal } from "@/components/journals/JournalFormModal";
import { ImportMT5Modal } from "@/components/journals/ImportMT5Modal";
import { WorkspaceSettingsModal } from "@/components/journals/WorkspaceSettingsModal";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JournalCalendar } from "@/components/journals/JournalCalendar";
import { JournalAnalytics } from "@/components/journals/JournalAnalytics";
import { isSameDay, format } from "date-fns";
import { swalConfirm, swalSuccess, swalError } from "@/lib/swal";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { exportTradeCardImage } from "@/components/journals/exportTradeCardImage";

export default function JournalDashboard() {
  const [, params] = useRoute("/journals/:accountId");
  const accountId = params?.accountId;
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: workspaces } = useListJournalWorkspaces();
  const workspace = workspaces?.find(w => w.id === accountId);

  const { data: statsData, isLoading: isLoadingStats } = useGetJournalStats({ accountName: accountId! });
  const { data: journalsData, isLoading: isLoadingJournals } = useListJournals({ accountName: accountId! });
  const deleteJournal = useDeleteJournal();

  const filteredJournals = useMemo(() => {
    if (!journalsData) return [];
    if (!selectedDate) return journalsData;
    return journalsData.filter(trade => isSameDay(new Date(trade.openTime), selectedDate));
  }, [journalsData, selectedDate]);

  const advancedStats = useMemo(() => {
    if (!journalsData || !workspace) return null;

    const startingBalance = workspace.startingBalance || 0;
    const totalPnL = statsData?.totalPnL || 0;
    const currentBalance = startingBalance + totalPnL;

    const sortedJournals = [...journalsData].sort((a, b) => new Date(a.openTime).getTime() - new Date(b.openTime).getTime());

    let peakEquity = startingBalance;
    let maxDrawdown = 0;
    let runningEquity = startingBalance;

    let todaysPnL = 0;
    let dailyDrawdown = 0;
    const today = new Date();

    let totalLots = 0;
    const tradingDaysSet = new Set<string>();
    const symbolCounts: Record<string, number> = {};

    sortedJournals.forEach(j => {
      const pnl = j.profitLossRaw || 0;
      runningEquity += pnl;

      if (runningEquity > peakEquity) peakEquity = runningEquity;
      const drawdown = peakEquity - runningEquity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (isSameDay(new Date(j.openTime), today)) {
        todaysPnL += pnl;
      }

      totalLots += Number(j.volume) || 0;
      tradingDaysSet.add(format(new Date(j.openTime), "yyyy-MM-dd"));
      symbolCounts[j.symbol] = (symbolCounts[j.symbol] || 0) + 1;
    });

    const todaysStartingBalance = currentBalance - todaysPnL;

    let todayRunningEq = todaysStartingBalance;
    let todayPeak = todaysStartingBalance;
    const todayTrades = sortedJournals.filter(j => isSameDay(new Date(j.openTime), today));
    todayTrades.forEach(j => {
       todayRunningEq += (j.profitLossRaw || 0);
       if (todayRunningEq > todayPeak) todayPeak = todayRunningEq;
       const dd = todayPeak - todayRunningEq;
       if (dd > dailyDrawdown) dailyDrawdown = dd;
    });

    let mostTradedAsset = "-";
    let maxCount = 0;
    Object.entries(symbolCounts).forEach(([symbol, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostTradedAsset = symbol;
      }
    });

    const averageWin = statsData?.averageWin || 0;
    const averageLoss = Math.abs(statsData?.averageLoss || 0);
    const averageRRR = averageLoss > 0 ? (averageWin / averageLoss) : (averageWin > 0 ? 999 : 0);

    return {
      startingBalance,
      currentBalance,
      currentEquity: currentBalance,
      todaysStartingBalance,
      dailyDrawdown,
      maxDrawdown,
      totalTrades: statsData?.totalTrades || 0,
      totalLots: Number(totalLots.toFixed(2)),
      averageRRR,
      winRate: statsData?.winRate || 0,
      tradingDays: tradingDaysSet.size,
      mostTradedAsset,
      averageLosingTrade: averageLoss
    };
  }, [journalsData, workspace, statsData]);

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this journal entry?")) {
      await deleteJournal.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["listJournals"] });
      queryClient.invalidateQueries({ queryKey: ["getJournalStats"] });
    }
  };

  const openNewModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const formatMoney = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  return (
    <AppLayout>
      <div className="container-fluid p-4 h-100 overflow-auto">
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div className="d-flex align-items-center gap-3">
            <Link href="/journals">
              <Button variant="ghost" size="icon" className="rounded-circle text-secondary hover:text-white">
                <ArrowLeft size={20} />
              </Button>
            </Link>
            <div>
              <h1 className="h4 mb-1 fw-bold text-white text-capitalize">{workspace?.name || accountId?.replace(/-/g, ' ')}</h1>
              <p className="text-secondary mb-0 small">Dashboard & Analytics</p>
            </div>
          </div>
          <div className="d-flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="border-secondary text-light d-flex align-items-center gap-2">
                  <Download size={16} />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-dark text-light border-secondary">
                <DropdownMenuItem 
                  className="cursor-pointer hover:bg-secondary/50" 
                  onClick={() => exportToCSV(filteredJournals, `${workspace?.name || 'journal'}_export.csv`)}
                >
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="cursor-pointer hover:bg-secondary/50" 
                  onClick={() => exportToPDF(filteredJournals, `${workspace?.name || 'journal'}_export.pdf`, `${workspace?.name || 'Journal'} Report`)}
                >
                  Export to PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="outline" className="border-secondary text-light d-flex align-items-center gap-2" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={16} />
              Settings
            </Button>
            <Button size="sm" variant="outline" className="border-secondary text-light hover:text-primary d-flex align-items-center gap-2" onClick={() => setIsImportOpen(true)}>
              <List size={16} />
              Import MT5
            </Button>
            <Button size="sm" className="bg-success text-dark hover:bg-success/90 d-flex align-items-center gap-2" onClick={openNewModal}>
              <Plus size={16} />
              Add Trade
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <div className="border-b border-border p-2 bg-[#0a0d11] mb-4">
            <TabsList className="strategy-tabs-list">
              <TabsTrigger 
                value="overview" 
                className="strategy-tab-trigger flex gap-2 items-center"
                data-tab="overview"
              >
                <Activity size={14} />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="calendar" 
                className="strategy-tab-trigger flex gap-2 items-center"
                data-tab="calendar"
              >
                <Calendar size={14} />
                <span>Calendar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="analytics" 
                className="strategy-tab-trigger flex gap-2 items-center"
                data-tab="analytics"
              >
                <BarChart2 size={14} />
                <span>Analytics</span>
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="strategy-tab-trigger flex gap-2 items-center"
                data-tab="history"
              >
                <List size={14} />
                <span>History</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="m-0 focus-visible:outline-none">
            <div className="mb-4">
              <h5 className="text-light fw-bold mb-3">Account Information</h5>
              <div className="row g-3">
                <div className="col-6 col-md-4 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-secondary small text-uppercase tracking-wider">Account Size</span>
                        <Wallet size={14} className="text-secondary" />
                      </div>
                      <h5 className="fw-bold mb-0 text-white">{formatMoney(advancedStats?.startingBalance)}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-secondary small text-uppercase tracking-wider">Current Balance</span>
                        <Wallet size={14} className="text-primary" />
                      </div>
                      <h5 className="fw-bold mb-0 text-white">{formatMoney(advancedStats?.currentBalance)}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-secondary small text-uppercase tracking-wider">Current Equity</span>
                        <Target size={14} className="text-success" />
                      </div>
                      <h5 className="fw-bold mb-0 text-white">{formatMoney(advancedStats?.currentEquity)}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-secondary small text-uppercase tracking-wider">Today's Start</span>
                        <Calendar size={14} className="text-secondary" />
                      </div>
                      <h5 className="fw-bold mb-0 text-white">{formatMoney(advancedStats?.todaysStartingBalance)}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-secondary small text-uppercase tracking-wider">Daily DD</span>
                        <TrendingDown size={14} className="text-danger" />
                      </div>
                      <h5 className="fw-bold mb-0 text-danger">{formatMoney(advancedStats?.dailyDrawdown)}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-secondary small text-uppercase tracking-wider">Max DD</span>
                        <AlertCircle size={14} className="text-danger" />
                      </div>
                      <h5 className="fw-bold mb-0 text-danger">{formatMoney(advancedStats?.maxDrawdown)}</h5>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h5 className="text-light fw-bold mb-3">Trading Stats</h5>
              <div className="row g-3">
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Trades</div>
                      <h5 className="fw-bold mb-0 text-white">{advancedStats?.totalTrades || 0}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Lots</div>
                      <h5 className="fw-bold mb-0 text-white">{advancedStats?.totalLots || 0}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Avg RRR</div>
                      <h5 className="fw-bold mb-0 text-info">{advancedStats?.averageRRR?.toFixed(2) || "0.00"}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Win Rate</div>
                      <h5 className="fw-bold mb-0 text-success">{advancedStats?.winRate?.toFixed(1) || "0.0"}%</h5>
                    </div>
                  </div>
                </div>
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Trading Days</div>
                      <h5 className="fw-bold mb-0 text-white">{advancedStats?.tradingDays || 0}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Most Traded</div>
                      <h5 className="fw-bold mb-0 text-primary">{advancedStats?.mostTradedAsset || "-"}</h5>
                    </div>
                  </div>
                </div>
                <div className="col-4 col-sm-3 col-lg-2">
                  <div className="card bg-dark border-secondary h-100">
                    <div className="card-body p-3 text-center">
                      <div className="text-secondary small text-uppercase tracking-wider mb-1">Avg Losing Trade</div>
                      <h5 className="fw-bold mb-0 text-danger">{formatMoney(advancedStats?.averageLosingTrade)}</h5>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

      <TabsContent value="calendar" className="m-0 focus-visible:outline-none">
            <div className="mb-4">
              <JournalCalendar 
                journals={journalsData || []} 
                selectedDate={selectedDate} 
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  if (date) {
                    setActiveTab("history");
                  }
                }} 
              />
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="m-0 focus-visible:outline-none">
            <div className="mb-4">
              <JournalAnalytics journals={journalsData || []} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="m-0 focus-visible:outline-none">
            {/* Trade History */}
            <div className="card bg-dark border-secondary">
              <div className="card-header border-secondary bg-transparent py-3 d-flex justify-content-between align-items-center">
                <h5 className="mb-0 text-white fw-bold">
                  Trade History {selectedDate && <span className="text-primary small ms-2">({selectedDate.toLocaleDateString()})</span>}
                </h5>
                {selectedDate && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)} className="text-secondary hover:text-white">
                    Clear Date Filter
                  </Button>
                )}
              </div>
              <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-dark table-hover mb-0 align-middle">
                <thead>
                  <tr>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Open Time</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Symbol</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Side</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Type</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Volume</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Open Price</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium">Close Price</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium text-end">P&L</th>
                    <th className="bg-transparent border-secondary text-secondary small fw-medium text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingJournals ? (
                    <tr>
                      <td colSpan={9} className="text-center py-4 text-secondary">Loading trades...</td>
                    </tr>
                  ) : filteredJournals && filteredJournals.length > 0 ? (
                    filteredJournals.map((trade) => (
                      <tr key={trade.id}>
                        <td className="text-light">{new Date(trade.openTime).toLocaleString()}</td>
                        <td className="fw-bold text-light">{trade.symbol}</td>
                        <td>
                          <span className={`badge ${trade.side === 'buy' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                            {trade.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-light text-capitalize">{trade.tradeType.replace('_', ' ')}</td>
                        <td className="text-light">{trade.volume}</td>
                        <td className="text-light">{trade.openPrice}</td>
                        <td className="text-light">{trade.closePrice || '-'}</td>
                        <td className={`text-end fw-bold ${(trade.profitLossRaw || 0) > 0 ? 'text-success' : (trade.profitLossRaw || 0) < 0 ? 'text-danger' : 'text-light'}`}>
                          {formatMoney(trade.profitLossRaw)}
                        </td>
                        <td className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-dark text-light border-secondary">
                              <DropdownMenuItem className="cursor-pointer hover:bg-secondary/50" onClick={() => exportTradeCardImage(trade)}>
                                <Download className="mr-2 h-4 w-4" /> Download Card
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer hover:bg-secondary/50" onClick={() => handleEdit(trade)}>
                                <Edit className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer text-danger hover:bg-danger/20" onClick={() => handleDelete(trade.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-5 text-secondary">
                        <BookOpen className="mx-auto mb-3 opacity-50" size={32} />
                        <p>No journal entries found.</p>
                        <Button variant="outline" size="sm" className="border-secondary text-light mt-2" onClick={openNewModal}>
                          Add your first trade
                        </Button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
      </div>
      
      {accountId && (
        <JournalFormModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          accountName={accountId}
          initialData={editingEntry}
        />
      )}

      {workspace && (
        <WorkspaceSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          workspace={workspace}
        />
      )}

      {accountId && (
        <ImportMT5Modal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          accountName={accountId}
        />
      )}
    </AppLayout>
  );
}
