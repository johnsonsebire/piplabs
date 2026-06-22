import { JournalEntry } from "@workspace/api-client-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const formatMoney = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
};

export function exportToCSV(journals: JournalEntry[], filename: string = "journal_export.csv") {
  const headers = [
    "Open Time", "Close Time", "Symbol", "Side", "Type", 
    "Volume", "Open Price", "Close Price", "Net P&L", "Notes"
  ];
  
  const rows = journals.map(j => [
    format(new Date(j.openTime), "yyyy-MM-dd HH:mm:ss"),
    j.closeTime ? format(new Date(j.closeTime), "yyyy-MM-dd HH:mm:ss") : "",
    j.symbol,
    j.side.toUpperCase(),
    j.tradeType.replace("_", " "),
    j.volume,
    j.openPrice,
    j.closePrice || "",
    j.profitLossRaw || 0,
    `"${(j.notes || "").replace(/"/g, '""')}"` // Escape quotes for CSV
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToPDF(journals: JournalEntry[], filename: string = "journal_export.pdf", title: string = "Trading Journal Report") {
  const doc = new jsPDF('landscape');
  
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generated on: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`, 14, 30);
  doc.text(`Total Trades: ${journals.length}`, 14, 36);
  
  const totalPnL = journals.reduce((sum, j) => sum + (j.profitLossRaw || 0), 0);
  doc.text(`Total Net P&L: ${formatMoney(totalPnL)}`, 14, 42);

  const tableColumn = ["Open Time", "Symbol", "Side", "Type", "Volume", "P&L", "Notes"];
  const tableRows = journals.map(j => [
    format(new Date(j.openTime), "MM/dd/yyyy HH:mm"),
    j.symbol,
    j.side.toUpperCase(),
    j.tradeType.replace("_", " "),
    j.volume.toString(),
    formatMoney(j.profitLossRaw),
    j.notes || ""
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 50,
    styles: { fontSize: 8 },
    columnStyles: {
      6: { cellWidth: 80 } // Give more space to notes
    }
  });

  doc.save(filename);
}
