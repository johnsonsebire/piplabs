import { JournalEntry } from "@workspace/api-client-react";
import { format } from "date-fns";

interface TradeCardProps {
  trade: JournalEntry;
}

export function TradeCard({ trade }: TradeCardProps) {
  const isProfit = (trade.profitLossRaw || 0) >= 0;
  const pnlColor = isProfit ? "#22c55e" : "#ef4444"; // green-500 or red-500
  const pnlText = isProfit ? "PROFIT" : "LOSS";
  const glowColor = isProfit ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";

  return (
    <div 
      style={{
        position: "relative",
        width: "550px",
        height: "550px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "32px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", // Dark navy to deep gray
        fontFamily: "'Inter', system-ui, sans-serif",
        borderRadius: "24px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        color: "white",
        boxSizing: "border-box"
      }}
    >
      {/* Glow Effects */}
      <div style={{
        position: "absolute", top: "-50px", right: "-50px", width: "250px", height: "250px",
        background: glowColor, filter: "blur(80px)", borderRadius: "50%", pointerEvents: "none"
      }}></div>
      <div style={{
        position: "absolute", bottom: "-50px", left: "-50px", width: "250px", height: "250px",
        background: glowColor, filter: "blur(80px)", borderRadius: "50%", pointerEvents: "none"
      }}></div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "24px", fontWeight: "bold", color: "white", letterSpacing: "-0.5px" }}>PipLabs</span>
          <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.4)" }}>x</span>
          <span style={{ fontSize: "24px", fontWeight: "bold", color: "#94a3b8", letterSpacing: "-0.5px" }}>GraceFXC</span>
        </div>
        <div style={{
          padding: "6px 16px", borderRadius: "999px", backgroundColor: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)", fontSize: "12px", fontWeight: "600",
          textTransform: "uppercase", letterSpacing: "1px", color: "#cbd5e1"
        }}>
          Closed Trade
        </div>
      </div>

      {/* Center Content - PnL */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1, position: "relative", zIndex: 10, marginTop: "20px" }}>
        <div style={{
          padding: "4px 16px", borderRadius: "999px", backgroundColor: isProfit ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
          color: pnlColor, fontSize: "14px", fontWeight: "bold", letterSpacing: "2px", marginBottom: "16px"
        }}>
          {pnlText}
        </div>
        <div style={{
          fontSize: "85px", fontWeight: "800", lineHeight: "1", color: "white",
          letterSpacing: "-2px", marginBottom: "24px"
        }}>
          {isProfit ? "" : "-"}${Math.abs(trade.profitLossRaw || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        {/* Badges Grid */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{
            padding: "6px 20px", borderRadius: "8px", fontWeight: "bold", fontSize: "14px",
            backgroundColor: trade.side === 'sell' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            color: trade.side === 'sell' ? '#fca5a5' : '#86e256',
            border: `1px solid ${trade.side === 'sell' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
          }}>
            {trade.side.toUpperCase()}
          </span>
          <span style={{
            padding: "6px 20px", borderRadius: "8px", fontWeight: "bold", fontSize: "14px",
            backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "white",
            fontFamily: "'Courier New', Courier, monospace"
          }}>
            {trade.volume} LOTS
          </span>
          <span style={{
            padding: "6px 20px", borderRadius: "8px", fontWeight: "bold", fontSize: "15px",
            backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white"
          }}>
            {trade.symbol}
          </span>
        </div>
      </div>

      {/* Dotted Divider */}
      <div style={{ width: "100%", borderTop: "2px dotted rgba(255,255,255,0.1)", margin: "24px 0", position: "relative", zIndex: 10 }}></div>

      {/* Bottom Prices Side by Side */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", position: "relative", zIndex: 10 }}>
        {/* Open Box */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#94a3b8", fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Open Price</div>
          <div style={{ color: "white", fontSize: "22px", fontWeight: "bold", fontFamily: "'Courier New', Courier, monospace", marginBottom: "4px" }}>
            ${Number(trade.openPrice).toLocaleString('en-US', { minimumFractionDigits: 5 })}
          </div>
          <div style={{ color: "#64748b", fontSize: "12px" }}>
            {format(new Date(trade.openTime), "MMM dd, yyyy • HH:mm:ss")}
          </div>
        </div>

        {/* Vertical Divider */}
        <div style={{ width: "1px", backgroundColor: "rgba(255,255,255,0.1)" }}></div>

        {/* Close Box */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right" }}>
          <div style={{ color: "#94a3b8", fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Close Price</div>
          <div style={{ color: "white", fontSize: "22px", fontWeight: "bold", fontFamily: "'Courier New', Courier, monospace", marginBottom: "4px" }}>
            {trade.closePrice ? `$${Number(trade.closePrice).toLocaleString('en-US', { minimumFractionDigits: 5 })}` : '-'}
          </div>
          <div style={{ color: "#64748b", fontSize: "12px" }}>
            {trade.closeTime ? format(new Date(trade.closeTime), "MMM dd, yyyy • HH:mm:ss") : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
