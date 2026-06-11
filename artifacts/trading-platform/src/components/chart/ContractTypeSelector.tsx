/**
 * ContractTypeSelector.tsx
 * Reusable contract type picker used in Chart, Auto Trader, and Backtest pages.
 * Shows all 10 Deriv contract types grouped by category.
 */
import { useState } from "react";
import {
  DERIV_CONTRACT_TYPES,
  groupedContractTypes,
  type ContractSubtype,
  type ContractTypeConfig,
} from "@/lib/deriv-contract-types";

interface Props {
  value: ContractSubtype;
  onChange: (type: ContractSubtype) => void;
  /** If true, render as a compact dropdown instead of the full grid */
  compact?: boolean;
}

// ─── Full grid picker (used in Chart sidebar and Auto Trader modal) ────────────
export function ContractTypeSelector({ value, onChange, compact = false }: Props) {
  const [open, setOpen] = useState(!compact);
  const selected = DERIV_CONTRACT_TYPES.find(t => t.id === value)!;
  const groups = groupedContractTypes().filter(g => g.id !== "multiplier");

  if (compact) {
    // Compact: show selected type + click to open dropdown overlay
    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            backgroundColor: "#111620",
            border: `1px solid ${selected.badgeColor}40`,
            cursor: "pointer",
            color: "#e2e8f0",
          }}
        >
          <i className={`bi ${selected.icon}`} style={{ fontSize: "0.85rem", color: selected.badgeColor }} />
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {selected.label}
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.5625rem", color: "#64748b" }}>
              {selected.description.split(".")[0]}.
            </div>
          </div>
          <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: "#64748b" }}>
            {open ? "▲" : "▼"}
          </span>
        </button>

        {open && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            backgroundColor: "#0d1117",
            border: "1px solid #1a2332",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            maxHeight: "360px",
            overflowY: "auto",
          }}>
            <GridContent groups={groups} value={value} onChange={(t) => { onChange(t); setOpen(false); }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <GridContent groups={groups} value={value} onChange={onChange} />
    </div>
  );
}

function GridContent({
  groups,
  value,
  onChange,
}: {
  groups: ReturnType<typeof groupedContractTypes>;
  value: ContractSubtype;
  onChange: (t: ContractSubtype) => void;
}) {
  return (
    <div>
      {groups.map(group => (
        <div key={group.id}>
          <div style={{
            padding: "0.3rem 0.75rem",
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.5rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#475569",
            backgroundColor: "#0a0d11",
            borderBottom: "1px solid #1a2332",
            borderTop: "1px solid #1a2332",
          }}>
            {group.label}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {group.types.map(ct => {
              const isSelected = ct.id === value;
              return (
                <ContractTypeButton
                  key={ct.id}
                  config={ct}
                  isSelected={isSelected}
                  onClick={() => onChange(ct.id)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContractTypeButton({
  config,
  isSelected,
  onClick,
}: {
  config: ContractTypeConfig;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.25rem",
        padding: "0.625rem 0.75rem",
        border: "none",
        borderBottom: "1px solid #1a2332",
        borderRight: "1px solid #1a2332",
        cursor: "pointer",
        backgroundColor: isSelected
          ? config.badgeBg
          : hovered
          ? "rgba(30,41,59,0.4)"
          : "transparent",
        transition: "background-color 0.15s ease",
        outline: isSelected ? `1px solid ${config.badgeColor}50` : "none",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <i
          className={`bi ${config.icon}`}
          style={{
            fontSize: "0.75rem",
            color: isSelected ? config.badgeColor : "#64748b",
            transition: "color 0.15s",
          }}
        />
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.5625rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: isSelected ? config.badgeColor : "#94a3b8",
        }}>
          {config.shortLabel}
        </span>
      </div>
      <span style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: "0.5rem",
        color: "#475569",
        lineHeight: 1.4,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
        textAlign: "left",
      }}>
        {config.directions.map(d => d.label).join(" / ")}
      </span>
    </button>
  );
}

// ─── Compact select for Backtest (matches existing select styling) ────────────
export function ContractTypeSelectItems() {
  const groups = groupedContractTypes().filter(g => g.id !== "multiplier");
  return (
    <>
      {groups.map(group => (
        <optgroup key={group.id} label={group.label}>
          {group.types.map(ct => (
            <option key={ct.id} value={ct.id}>{ct.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
