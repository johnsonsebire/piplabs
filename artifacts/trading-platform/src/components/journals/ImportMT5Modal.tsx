import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";
import { useImportJournals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { swalSuccess, swalError } from "@/lib/swal";

interface ImportMT5ModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
}

export function ImportMT5Modal({ isOpen, onClose, accountName }: ImportMT5ModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const importJournals = useImportJournals();
  const queryClient = useQueryClient();

  const parseExcelDate = (dateStr: string) => {
    if (!dateStr) return null;
    const cleaned = dateStr.replace(/\./g, "-");
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const handleImport = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

          let isPositionsSection = false;
          let isDealsSection = false;
          let headers: string[] = [];
          let dealsHeaders: string[] = [];
          const extractedTrades: any[] = [];
          const extractedTransactions: any[] = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.length === 0 || !row[0]) continue;

            const firstCell = String(row[0]).trim();

            if (firstCell === "Positions") {
              isPositionsSection = true;
              isDealsSection = false;
              continue;
            }
            if (firstCell === "Deals") {
              isDealsSection = true;
              isPositionsSection = false;
              continue;
            }

            if (isPositionsSection && headers.length === 0 && firstCell === "Time") {
              headers = row.map((h) => String(h || "").trim());
              continue;
            }

            if (isPositionsSection && headers.length > 0) {
              if (firstCell === "Orders" || firstCell === "Deals" || String(row[1]) === "Balance" || firstCell === "Results") {
                isPositionsSection = false;
                if (firstCell === "Deals") isDealsSection = true;
                continue; // End of positions
              }

              const openTime = parseExcelDate(row[0]);
              const symbol = String(row[2] || "");
              const side = String(row[3] || "").toLowerCase();
              const volume = parseFloat(String(row[4] || ""));
              
              // Remove spaces from numbers like '4 318.99' to '4318.99'
              const parseNumberStr = (str: any) => parseFloat(String(str || "").replace(/ /g, ""));
              
              const openPrice = parseNumberStr(row[5]);
              const closeTime = parseExcelDate(row[8]);
              const closePrice = parseNumberStr(row[9]);
              const commission = parseNumberStr(row[10]);
              const swap = parseNumberStr(row[11]);
              const profitLossRaw = parseNumberStr(row[12]);

              if (!openTime || !symbol || isNaN(volume)) continue;

              const durationMinutes = closeTime ? Math.round((closeTime.getTime() - openTime.getTime()) / 60000) : 0;

              // Map tradeType to valid enums: ["vanilla_options", "forex", "multiplier", "futures"]
              let tradeType = "forex";
              if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("NAS") || symbol.includes("US30")) {
                 tradeType = "futures"; // Using futures for crypto/indices CFDs
              }

              extractedTrades.push({
                accountName,
                symbol,
                side: side === "buy" || side === "sell" ? side : "buy",
                tradeType,
                volume,
                openTime: openTime.toISOString(),
                closeTime: closeTime ? closeTime.toISOString() : null,
                openPrice,
                closePrice: isNaN(closePrice) ? null : closePrice,
                profitLossRaw: isNaN(profitLossRaw) ? null : profitLossRaw,
                grossProfit: null,
                commission: isNaN(commission) ? null : commission,
                swap: isNaN(swap) ? null : swap,
                durationMinutes,
                notes: `MT5 Position ${row[1]}`,
              });
            }

            if (isDealsSection && dealsHeaders.length === 0 && firstCell === "Time") {
              dealsHeaders = row.map((h) => String(h || "").trim());
              continue;
            }

            if (isDealsSection && dealsHeaders.length > 0) {
              if (firstCell === "Results" || String(row[1]) === "Balance") {
                isDealsSection = false;
                continue;
              }

              const time = parseExcelDate(row[0]);
              if (!time) continue;

              // Row format in Deals: Time, Deal, Order, Symbol, Type, Direction, Volume, Price, Commission, Swap, Profit, Balance, Comment
              // Finding deposits/withdrawals based on Type or Comment
              // In MT5 Deal 'Type' is usually 'Balance' or 'Credit'
              const typeCol = String(row[2] || "").toLowerCase() === "balance" || String(row[3] || "").toLowerCase() === "balance" ? "balance" 
                           : String(row[4] || "").toLowerCase() === "balance" || String(row[4] || "").toLowerCase() === "credit" ? String(row[4]).toLowerCase() 
                           : "";
                           
              if (typeCol === "balance" || typeCol === "credit") {
                  const profitStr = row[dealsHeaders.indexOf("Profit")] || row[10] || row[11] || row[12];
                  const amount = parseFloat(String(profitStr || "").replace(/ /g, ""));
                  if (!isNaN(amount) && amount !== 0) {
                      let txType = amount > 0 ? "deposit" : "withdrawal";
                      if (typeCol === "credit") txType = "bonus";
                      extractedTransactions.push({
                          accountName,
                          type: txType,
                          amount: amount,
                          timestamp: time.toISOString(),
                          notes: `MT5 ${typeCol}`
                      });
                  }
              }
            }
          }

          if (extractedTrades.length === 0) {
            throw new Error("No positions found in the Excel file.");
          }

          await importJournals.mutateAsync({ data: { replaceExisting, data: extractedTrades, transactions: extractedTransactions } });
          queryClient.invalidateQueries({ queryKey: ["/api/journals"] });
          queryClient.invalidateQueries({ queryKey: ["/api/journals/stats"] });
          swalSuccess("Success", `Imported ${extractedTrades.length} trades!`);
          onClose();
        } catch (err: any) {
          swalError("Import Failed", err.message || "Failed to process the Excel file.");
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      swalError("Import Failed", err.message || "Failed to read the file.");
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-dark text-light border-secondary">
        <DialogHeader>
          <DialogTitle>Import MT5 History</DialogTitle>
          <DialogDescription className="text-secondary">
            Upload your MT5 Excel (.xlsx) report. Ensure it contains the 'Positions' section.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="bg-[#0a0d11] border-secondary cursor-pointer"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div className="flex items-center mt-4 gap-3">
            <input
              type="checkbox"
              id="replaceExisting"
              className="w-4 h-4 cursor-pointer"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            <label htmlFor="replaceExisting" className="text-sm text-secondary cursor-pointer select-none">
              Replace Existing Data
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing} className="border-secondary text-light hover:bg-secondary/20">
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || isProcessing} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isProcessing ? "Processing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
