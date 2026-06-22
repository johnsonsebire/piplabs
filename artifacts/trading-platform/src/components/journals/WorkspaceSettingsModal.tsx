import { useState, useEffect } from "react";
import { useUpdateJournalWorkspace, useDeleteJournalWorkspace, JournalWorkspace, getListJournalWorkspacesQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { swalSuccess, swalError, swalConfirm } from "@/lib/swal";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: JournalWorkspace;
}

export function WorkspaceSettingsModal({ isOpen, onClose, workspace }: WorkspaceSettingsModalProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const updateWorkspace = useUpdateJournalWorkspace();
  const deleteWorkspace = useDeleteJournalWorkspace();

  const [name, setName] = useState(workspace.name);
  const [startingBalance, setStartingBalance] = useState(workspace.startingBalance || 0);

  useEffect(() => {
    setName(workspace.name);
    setStartingBalance(workspace.startingBalance || 0);
  }, [workspace, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWorkspace.mutateAsync({
        id: workspace.id,
        data: {
          name,
          startingBalance
        }
      });
      swalSuccess("Success", "Workspace updated");
      queryClient.invalidateQueries({ queryKey: getListJournalWorkspacesQueryKey() });
      // We don't change the URL because ID is the slug/uuid and we just updated the name
      onClose();
    } catch (error) {
      swalError("Error", "Failed to update workspace");
    }
  };

  const handleDelete = async () => {
    const confirmed = await swalConfirm(
      "Delete Workspace?",
      "This will delete the workspace AND ALL trades inside it. This action cannot be undone.",
      "Yes, delete everything",
      "error"
    );
    
    if (confirmed) {
      try {
        await deleteWorkspace.mutateAsync({ id: workspace.id });
        swalSuccess("Deleted", "Workspace has been deleted.");
        queryClient.invalidateQueries({ queryKey: getListJournalWorkspacesQueryKey() });
        setLocation("/journals");
      } catch (error) {
        swalError("Error", "Failed to delete workspace");
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-dark text-light border-secondary sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="col-12">
              <label className="form-label small">Workspace Name</label>
              <input 
                required 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="form-control bg-dark border-secondary text-light form-control-sm" 
              />
            </div>
            <div className="col-12">
              <label className="form-label small">Starting Balance ($)</label>
              <input 
                type="number" 
                step="any" 
                value={startingBalance} 
                onChange={(e) => setStartingBalance(Number(e.target.value))} 
                className="form-control bg-dark border-secondary text-light form-control-sm" 
              />
              <div className="form-text text-secondary mt-1" style={{ fontSize: '0.75rem' }}>
                Used to calculate your total equity curve.
              </div>
            </div>
          </div>
          
          <div className="d-flex justify-content-between align-items-center mt-4">
            <Button type="button" variant="outline" className="border-danger text-danger hover:bg-danger hover:text-white" onClick={handleDelete} disabled={deleteWorkspace.isPending}>
              <Trash2 size={16} className="me-2" />
              Delete Workspace
            </Button>
            
            <div className="d-flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-secondary text-light hover:bg-secondary">
                Cancel
              </Button>
              <Button type="submit" className="bg-success text-dark hover:bg-success/90" disabled={updateWorkspace.isPending}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
