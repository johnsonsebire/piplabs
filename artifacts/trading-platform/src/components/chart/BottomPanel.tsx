import { useState, useCallback } from "react";
import { ChevronUp, ChevronDown, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpenTradesWidget } from "@/components/chart/ChartOpenTrades";
import { cn } from "@/lib/utils";

type PanelMode = "minimized" | "expanded" | "maximized";

interface Tab {
  id: string;
  label: string;
  icon: string; // bootstrap icon class
}

const TABS: Tab[] = [
  { id: "trades", label: "Trades", icon: "bi-arrow-left-right" },
];

const EXPANDED_HEIGHT = 280;

interface BottomPanelProps {
  symbol: string;
}

export function BottomPanel({ symbol }: BottomPanelProps) {
  const [mode, setMode] = useState<PanelMode>("minimized");
  const [activeTab, setActiveTab] = useState<string>("trades");

  const expand = useCallback(() => setMode("expanded"), []);
  const maximize = useCallback(() => setMode("maximized"), []);
  const minimize = useCallback(() => setMode("minimized"), []);

  const toggleExpand = useCallback(() => {
    setMode((prev) => (prev === "minimized" ? "expanded" : "minimized"));
  }, []);

  const isMinimized = mode === "minimized";
  const isExpanded = mode === "expanded";
  const isMaximized = mode === "maximized";

  return (
    <div
      className={cn(
        "bottom-panel flex flex-col bg-card border-border transition-all duration-250 ease-in-out flex-shrink-0",
        isMaximized
          ? "bottom-panel--maximized"
          : "border-t border-border w-full"
      )}
      style={
        isMaximized
          ? {
              position: "absolute",
              inset: 0,
              zIndex: 50,
              height: "100%",
              borderTop: "none",
            }
          : isExpanded
          ? { height: `${EXPANDED_HEIGHT}px` }
          : { height: "2.5rem" }
      }
    >
      {/* ── Header / Tab bar ── */}
      <div
        className="bottom-panel__header flex items-center shrink-0 border-b border-border bg-card"
        style={{ height: "2.5rem", minHeight: "2.5rem" }}
      >
        {/* Tabs */}
        <div className="flex items-center h-full overflow-hidden flex-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (isMinimized) expand();
                }}
                className={cn(
                  "bottom-panel__tab h-full px-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider border-r border-border transition-all duration-150 shrink-0 cursor-pointer",
                  isActive
                    ? "text-primary bg-primary/10 border-b-2 border-b-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
                style={{ borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent" }}
              >
                <i className={`bi ${tab.icon}`} style={{ fontSize: "0.65rem" }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 px-2 shrink-0">
          {/* Expand / Collapse toggle */}
          {isMinimized ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={expand}
              title="Expand panel"
            >
              <ChevronUp size={14} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={isMaximized ? expand : minimize}
              title={isMaximized ? "Restore" : "Collapse panel"}
            >
              <ChevronDown size={14} />
            </Button>
          )}

          {/* Maximize */}
          {!isMaximized ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={maximize}
              title="Maximize panel"
            >
              <Maximize2 size={13} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={expand}
              title="Restore to expanded"
            >
              <Minimize2 size={13} />
            </Button>
          )}

          {/* Minimize (close) — always available */}
          {!isMinimized && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={minimize}
              title="Minimize panel"
            >
              <X size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* ── Body / Tab content ── */}
      {!isMinimized && (
        <div className="bottom-panel__body flex-1 overflow-auto min-h-0">
          {activeTab === "trades" && <OpenTradesWidget symbol={symbol} />}
        </div>
      )}
    </div>
  );
}
