import { useState, useEffect } from "react";
import { useCreateJournal, useUpdateJournal, JournalEntry, JournalEntryInput, JournalEntryUpdate, getListJournalsQueryKey, getGetJournalStatsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { swalSuccess, swalError } from "@/lib/swal";
import { useQueryClient } from "@tanstack/react-query";

interface JournalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  initialData?: JournalEntry | null;
}

export function JournalFormModal({ isOpen, onClose, accountName, initialData }: JournalFormModalProps) {
  const queryClient = useQueryClient();
  const createJournal = useCreateJournal();
  const updateJournal = useUpdateJournal();

  const [formData, setFormData] = useState<Partial<JournalEntry>>({
    tradeType: 'forex',
    side: 'buy',
    volume: 1,
    symbol: '',
    openPrice: 0,
    openTime: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        openTime: initialData.openTime ? new Date(initialData.openTime).toISOString().slice(0, 16) : '',
        closeTime: initialData.closeTime ? new Date(initialData.closeTime).toISOString().slice(0, 16) : '',
      });
    } else {
      setFormData({
        tradeType: 'forex',
        side: 'buy',
        volume: 1,
        symbol: '',
        openPrice: 0,
        openTime: new Date().toISOString().slice(0, 16),
        closeTime: '',
        closePrice: '',
        profitLossRaw: '',
        notes: '',
      } as any);
    }
  }, [initialData, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSubmit = {
        ...formData,
        accountName,
        volume: Number(formData.volume),
        openPrice: Number(formData.openPrice),
        closeTime: formData.closeTime || null,
        closePrice: formData.closePrice ? Number(formData.closePrice) : null,
        profitLossRaw: formData.profitLossRaw ? Number(formData.profitLossRaw) : null,
      };

      if (initialData) {
        await updateJournal.mutateAsync({
          id: initialData.id,
          data: dataToSubmit as JournalEntryUpdate
        });
        swalSuccess("Success", "Journal entry updated");
      } else {
        await createJournal.mutateAsync({
          data: dataToSubmit as JournalEntryInput
        });
        swalSuccess("Success", "Journal entry created");
      }
      queryClient.invalidateQueries({ queryKey: getListJournalsQueryKey({ accountName }) });
      queryClient.invalidateQueries({ queryKey: getGetJournalStatsQueryKey({ accountName }) });
      onClose();
    } catch (error) {
      swalError("Error", "Failed to save journal entry");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-dark text-light border-secondary sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Journal Entry" : "Add Journal Entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small">Symbol</label>
                <input required name="symbol" value={formData.symbol || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" placeholder="EURUSD" />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Trade Type</label>
                <select required name="tradeType" value={formData.tradeType || 'forex'} onChange={handleChange} className="form-select bg-dark border-secondary text-light form-select-sm">
                  <option value="forex">Forex</option>
                  <option value="futures">Futures</option>
                  <option value="vanilla_options">Options</option>
                  <option value="multiplier">Multiplier</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label small">Side</label>
                <select required name="side" value={formData.side || 'buy'} onChange={handleChange} className="form-select bg-dark border-secondary text-light form-select-sm">
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label small">Volume / Stake</label>
                <input required type="number" step="any" name="volume" value={formData.volume || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" />
              </div>

              <div className="col-md-6">
                <label className="form-label small">Open Time</label>
                <input required type="datetime-local" name="openTime" value={formData.openTime as string || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Open Price</label>
                <input required type="number" step="any" name="openPrice" value={formData.openPrice || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" />
              </div>

              <div className="col-md-6">
                <label className="form-label small">Close Time (Optional)</label>
                <input type="datetime-local" name="closeTime" value={formData.closeTime as string || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Close Price (Optional)</label>
                <input type="number" step="any" name="closePrice" value={formData.closePrice || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" />
              </div>
              
              <div className="col-12">
                <label className="form-label small">P&L ($)</label>
                <input type="number" step="any" name="profitLossRaw" value={formData.profitLossRaw || ''} onChange={handleChange} className="form-control bg-dark border-secondary text-light form-control-sm" placeholder="e.g. 50.50 or -20.00" />
              </div>

              <div className="col-12">
                <label className="form-label small">Notes</label>
                <textarea 
                  name="notes" 
                  value={formData.notes || ''} 
                  onChange={handleChange} 
                  className="form-control bg-dark border-secondary text-light form-control-sm" 
                  rows={4}
                  placeholder="What was your setup? How did you manage the trade? How were you feeling?"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="border-secondary text-light hover:bg-secondary">
              Cancel
            </Button>
            <Button type="submit" className="bg-success text-dark hover:bg-success/90" disabled={createJournal.isPending || updateJournal.isPending}>
              Save Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
