import { useState, useMemo } from "react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays 
} from "date-fns";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JournalEntry } from "@workspace/api-client-react";
import { exportCalendarImage } from "./exportCalendarImage.tsx";

interface JournalCalendarProps {
  journals: JournalEntry[];
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  initialMonth?: Date;
  isExport?: boolean;
  workspaceName?: string;
}

export function JournalCalendar({ journals, selectedDate, onSelectDate, initialMonth, isExport, workspaceName }: JournalCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth || new Date());
  const [isExporting, setIsExporting] = useState(false);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  // Compute calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays: Date[] = [];
  let day = startDate;
  while (day <= endDate) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", signDisplay: "exceptZero" }).format(amount);
  };

  return (
    <div className="card bg-dark border-secondary h-100">
      <div className="card-header border-secondary bg-transparent py-3 d-flex justify-content-between align-items-center">
        <h5 className="mb-0 text-white fw-bold">Trading Calendar</h5>
        <div className="d-flex align-items-center gap-3">
          {!isExport && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-secondary hover:text-light" 
              onClick={async () => {
                if (isExporting) return;
                setIsExporting(true);
                try {
                  await exportCalendarImage(journals, currentMonth, workspaceName || "Trading");
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
            >
              <Download size={18} />
            </Button>
          )}
          <Button variant="outline" size="icon" className="border-secondary text-light h-8 w-8" onClick={prevMonth} style={{ visibility: isExport ? 'hidden' : 'visible' }}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-light fw-medium" style={{ minWidth: "120px", textAlign: "center", fontSize: isExport ? '1.2rem' : 'inherit' }}>
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="icon" className="border-secondary text-light h-8 w-8" onClick={nextMonth} style={{ visibility: isExport ? 'hidden' : 'visible' }}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <div className="card-body p-0">
        <div className="d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {/* Weekday Headers */}
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
            <div key={dayName} className="p-2 text-center text-secondary small fw-medium border-bottom border-secondary">
              {dayName}
            </div>
          ))}

          {/* Calendar Grid */}
          {calendarDays.map((date, idx) => {
            // Aggregate stats for this date
            const dayTrades = journals.filter(j => isSameDay(new Date(j.openTime), date));
            const totalPnL = dayTrades.reduce((sum, j) => sum + (j.profitLossRaw || 0), 0);
            
            const isSelected = selectedDate && isSameDay(date, selectedDate);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const hasTrades = dayTrades.length > 0;
            const isPositive = totalPnL > 0;
            const isNegative = totalPnL < 0;

            return (
              <div 
                key={idx} 
                onClick={() => onSelectDate(isSelected ? null : date)}
                className={`
                  p-2 border-bottom border-end border-secondary position-relative transition-colors
                  ${!isExport && "cursor-pointer"}
                  ${!isCurrentMonth ? "opacity-50 bg-darker" : "bg-dark"}
                  ${isSelected && !isExport ? "ring-2 ring-primary ring-inset" : !isExport ? "hover:bg-secondary/10" : ""}
                  ${hasTrades ? (isPositive ? "bg-success/5" : isNegative ? "bg-danger/5" : "") : ""}
                `}
                style={{ minHeight: isExport ? "130px" : "100px" }}
              >
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className={`small fw-bold ${isSelected ? "text-primary" : "text-light"}`}>
                    {format(date, "d")}
                  </span>
                  {hasTrades && (
                    <span className="badge bg-secondary text-light rounded-pill" style={{ fontSize: "0.65rem" }}>
                      {dayTrades.length}
                    </span>
                  )}
                </div>
                
                {hasTrades && (
                  <div className="d-flex flex-column gap-1 mt-2">
                    <span className={`small fw-bold ${isPositive ? "text-success" : isNegative ? "text-danger" : "text-light"}`}>
                      {formatMoney(totalPnL)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
