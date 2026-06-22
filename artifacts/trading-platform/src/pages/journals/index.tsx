import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen, ChevronRight, Activity, ArrowUpRight } from "lucide-react";
import { useListJournals, useListJournalWorkspaces, useCreateJournalWorkspace, getListJournalWorkspacesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { swalSuccess, swalError } from "@/lib/swal";

export default function JournalsPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useListJournalWorkspaces();
  const { data: allJournals, isLoading: isLoadingJournals } = useListJournals({});
  const createWorkspace = useCreateJournalWorkspace();

  const handleCreate = async () => {
    if (!newWorkspaceName.trim()) return;
    
    try {
      const workspace = await createWorkspace.mutateAsync({
        data: {
          name: newWorkspaceName.trim(),
          startingBalance: 0
        }
      });
      swalSuccess("Success", "Workspace created!");
      queryClient.invalidateQueries({ queryKey: getListJournalWorkspacesQueryKey() });
      setNewWorkspaceName("");
      setLocation(`/journals/${workspace.id}`);
    } catch (error) {
      swalError("Error", "Failed to create workspace");
    }
  };

  const isLoading = isLoadingWorkspaces || isLoadingJournals;

  // Aggregate metrics using DB workspaces and all journals
  const workspaceMetrics = workspaces?.map(ws => {
    let tradesCount = 0;
    let wins = 0;
    let completedTrades = 0;

    if (allJournals) {
      for (const trade of allJournals) {
        if (trade.accountName === ws.id) {
          tradesCount++;
          if (trade.closeTime && trade.profitLossRaw !== null) {
            completedTrades++;
            if (trade.profitLossRaw > 0) {
              wins++;
            }
          }
        }
      }
    }

    const winRate = completedTrades > 0 ? Math.round((wins / completedTrades) * 100) : 0;

    return {
      ...ws,
      tradesCount,
      winRate
    };
  }) || [];

  return (
    <AppLayout>
      <div className="container-fluid p-4 h-100 overflow-auto">
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <h1 className="h3 mb-1 fw-bold d-flex align-items-center gap-2">
              <BookOpen className="text-success" size={24} />
              Journal Workspaces
            </h1>
            <p className="text-secondary mb-0">Select a workspace to view your trading journal and analytics.</p>
          </div>
          
          <div className="d-flex gap-2">
            <input 
              type="text" 
              className="form-control form-control-sm bg-dark border-secondary text-light"
              placeholder="New Workspace Name..."
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              disabled={createWorkspace.isPending}
            />
            <Button 
              size="sm" 
              variant="outline" 
              className="d-flex align-items-center gap-1 text-success border-success" 
              onClick={handleCreate}
              disabled={createWorkspace.isPending || !newWorkspaceName.trim()}
            >
              <Plus size={16} />
              Create
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-5 text-secondary">Loading workspaces...</div>
        ) : (
          <div className="row g-3">
            {workspaceMetrics.length === 0 ? (
              <div className="col-12 text-center py-5">
                 <p className="text-secondary">No workspaces found. Create one to get started!</p>
              </div>
            ) : workspaceMetrics.map((workspace) => (
                <div key={workspace.id} className="col-12 col-md-6 col-lg-4">
                  <div 
                    className="card bg-dark border-secondary h-100" 
                    style={{ cursor: "pointer", transition: "all 0.2s" }}
                    onClick={() => setLocation(`/journals/${workspace.id}`)}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--bs-success)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--bs-border-color)'}
                  >
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <h5 className="card-title fw-bold mb-0 text-white">{workspace.name}</h5>
                        <ChevronRight size={20} className="text-secondary" />
                      </div>
                      
                      <div className="d-flex gap-3 text-secondary small">
                        <div className="d-flex align-items-center gap-1">
                          <Activity size={14} />
                          <span>{workspace.tradesCount} Trades</span>
                        </div>
                        <div className="d-flex align-items-center gap-1 text-success">
                          <ArrowUpRight size={14} />
                          <span>{workspace.winRate}% Win Rate</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
