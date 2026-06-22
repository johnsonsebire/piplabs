import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useListJournals, useGetJournalStats, useDeleteJournal, JournalEntry, useListJournalWorkspaces } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Settings, TrendingUp, TrendingDown, Target, Activity, MoreVertical, Edit, Trash2, BookOpen } from "lucide-react";
import { JournalFormModal } from "@/components/journals/JournalFormModal";
import { WorkspaceSettingsModal } from "@/components/journals/WorkspaceSettingsModal";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { swalConfirm, swalSuccess, swalError } from "@/lib/swal";

export default function JournalDashboard() {
  const [, params] = useRoute("/journals/:accountId");
  const accountId = params?.accountId;
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  const { data: workspaces } = useListJournalWorkspaces();
  const workspace = workspaces?.find(w => w.id === accountId);

  const { data: statsData, isLoading: isLoadingStats } = useGetJournalStats({ accountName: accountId! });
  const { data: journalsData, isLoading: isLoadingJournals } = useListJournals({ accountName: accountId! });
  const deleteJournal = useDeleteJournal();

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
            <Button size="sm" variant="outline" className="border-secondary text-light d-flex align-items-center gap-2" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={16} />
              Settings
            </Button>
            <Button size="sm" className="bg-success text-dark hover:bg-success/90 d-flex align-items-center gap-2" onClick={openNewModal}>
              <Plus size={16} />
              Add Trade
            </Button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="text-secondary mb-0 small text-uppercase tracking-wider">Net P&L</h6>
                  <Target size={16} className="text-primary" />
                </div>
                <h3 className={`fw-bold mb-1 ${(statsData?.totalPnL || 0) >= 0 ? "text-success" : "text-danger"}`}>
                  {formatMoney(statsData?.totalPnL)}
                </h3>
                {workspace && workspace.startingBalance > 0 && (
                  <div className="mt-2 text-secondary small">
                    Equity: <strong className="text-light">{formatMoney(workspace.startingBalance + (statsData?.totalPnL || 0))}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h6 className="text-secondary mb-0 small text-uppercase tracking-wider">Win Rate</h6>
                  <Activity size={16} className="text-success" />
                </div>
                <h3 className="fw-bold mb-1 text-white">
                  {statsData?.winRate?.toFixed(1) || 0}%
                </h3>
                <span className="small text-secondary">{statsData?.totalTrades || 0} Total Trades</span>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h6 className="text-secondary mb-0 small text-uppercase tracking-wider">Profit Factor</h6>
                  <TrendingUp size={16} className="text-warning" />
                </div>
                <h3 className="fw-bold mb-1 text-white">
                  {statsData?.profitFactor?.toFixed(2) || "0.00"}
                </h3>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h6 className="text-secondary mb-0 small text-uppercase tracking-wider">Avg Win / Loss</h6>
                  <TrendingDown size={16} className="text-danger" />
                </div>
                <div className="d-flex flex-column gap-1">
                  <span className="text-success fw-medium">{formatMoney(statsData?.averageWin)}</span>
                  <span className="text-danger fw-medium">{formatMoney(statsData?.averageLoss)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trade History */}
        <div className="card bg-dark border-secondary">
          <div className="card-header border-secondary bg-transparent py-3">
            <h5 className="mb-0 text-white fw-bold">Trade History</h5>
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
                  ) : journalsData && journalsData.length > 0 ? (
                    journalsData.map((trade) => (
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
    </AppLayout>
  );
}
