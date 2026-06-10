import { useState, useCallback } from "react";
import { ChevronUp, ChevronDown, Maximize2, Minimize2, X } from "lucide-react";
import { OpenTradesWidget, OrderHistoryWidget } from "@/components/chart/ChartOpenTrades";

type PanelMode = "minimized" | "expanded" | "maximized";

interface Tab {
  id: string;
  label: string;
  icon: string; // bootstrap icon class
}

const TABS: Tab[] = [
  { id: "trades", label: "Trades", icon: "bi-arrow-left-right" },
  { id: "history", label: "Order History", icon: "bi-clock-history" },
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

  const isMinimized = mode === "minimized";
  const isExpanded = mode === "expanded";
  const isMaximized = mode === "maximized";

  const panelStyle: React.CSSProperties = isMaximized
    ? {
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0f1318",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
      }
    : {
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0f1318",
        borderTop: "1px solid #1a2332",
        height: isExpanded ? `${EXPANDED_HEIGHT}px` : "2.5rem",
        minHeight: isExpanded ? `${EXPANDED_HEIGHT}px` : "2.5rem",
        overflow: "hidden",
        transition: "height 250ms cubic-bezier(0.4, 0, 0.2, 1), min-height 250ms cubic-bezier(0.4, 0, 0.2, 1)",
      };

  return (
    <div style={panelStyle}>
      {/* ── Header / Tab bar ─────────────────────────────── */}
      <div
        style={{
          height: "2.5rem",
          minHeight: "2.5rem",
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #1a2332",
          background: "linear-gradient(180deg, #111620 0%, #0f1318 100%)",
          flexShrink: 0,
        }}
      >
        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", height: "100%", flex: 1, overflow: "hidden" }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (isMinimized) expand();
                }}
                style={{
                  height: "100%",
                  padding: "0 1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                  border: "none",
                  borderRight: "1px solid #1a2332",
                  borderBottom: isActive ? "2px solid #10b981" : "2px solid transparent",
                  backgroundColor: isActive ? "rgba(16, 185, 129, 0.08)" : "transparent",
                  color: isActive ? "#10b981" : "#64748b",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  outline: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "#94a3b8";
                    e.currentTarget.style.backgroundColor = "rgba(30, 41, 59, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "#64748b";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <i className={`bi ${tab.icon}`} style={{ fontSize: "0.6rem" }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Controls ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            padding: "0 0.5rem",
            flexShrink: 0,
          }}
        >
          {/* Separator */}
          <div style={{ width: "1px", height: "1rem", backgroundColor: "#1a2332", marginRight: "4px" }} />

          {/* Expand / Collapse */}
          {isMinimized ? (
            <ControlButton onClick={expand} title="Expand panel" color="#10b981">
              <ChevronUp size={13} />
            </ControlButton>
          ) : (
            <ControlButton onClick={isMaximized ? expand : minimize} title={isMaximized ? "Restore" : "Collapse panel"}>
              <ChevronDown size={13} />
            </ControlButton>
          )}

          {/* Maximize / Restore */}
          {!isMaximized ? (
            <ControlButton onClick={maximize} title="Maximize panel" color="#10b981">
              <Maximize2 size={12} />
            </ControlButton>
          ) : (
            <ControlButton onClick={expand} title="Restore to expanded">
              <Minimize2 size={12} />
            </ControlButton>
          )}

          {/* Close / Minimize — only when not already minimized */}
          {!isMinimized && (
            <ControlButton onClick={minimize} title="Minimize panel" hoverColor="#ef4444">
              <X size={12} />
            </ControlButton>
          )}
        </div>
      </div>

      {/* ── Body / Tab content ── */}
      {!isMinimized && (
        <div style={{ flex: 1, overflow: "auto", minHeight: 0, backgroundColor: "#0a0d11" }}>
          {activeTab === "trades" && <OpenTradesWidget symbol={symbol} />}
          {activeTab === "history" && <OrderHistoryWidget />}
        </div>
      )}
    </div>
  );
}

/* ── Small inline helper component for control buttons ── */
function ControlButton({
  onClick,
  title,
  children,
  color = "#94a3b8",
  hoverColor = "#10b981",
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  color?: string;
  hoverColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.75rem",
        height: "1.75rem",
        backgroundColor: hovered ? "rgba(30, 41, 59, 0.6)" : "transparent",
        color: hovered ? hoverColor : color,
        border: "none",
        cursor: "pointer",
        outline: "none",
        borderRadius: "2px",
        transition: "background-color 0.15s ease, color 0.15s ease",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
