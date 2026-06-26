import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { Bell, X, Check, CheckCheck, Trash2, Zap, BarChart2, Newspaper, Settings2, BellOff } from "lucide-react";
import { useNotifications, Notification, NotificationCategory } from "@/hooks/useNotifications";

const CATEGORIES: { key: NotificationCategory | "all"; label: string; icon: React.ReactNode }[] = [
  { key: "all",    label: "All",     icon: <Bell size={12} /> },
  { key: "signal", label: "Signals", icon: <Zap size={12} /> },
  { key: "trade",  label: "Trades",  icon: <BarChart2 size={12} /> },
  { key: "news",   label: "News",    icon: <Newspaper size={12} /> },
  { key: "system", label: "System",  icon: <Settings2 size={12} /> },
];

const CATEGORY_COLORS: Record<NotificationCategory, string> = {
  signal: "#10b981",
  trade:  "#3b82f6",
  news:   "#f59e0b",
  system: "#6366f1",
};

const CATEGORY_BG: Record<NotificationCategory, string> = {
  signal: "rgba(16,185,129,0.12)",
  trade:  "rgba(59,130,246,0.12)",
  news:   "rgba(245,158,11,0.12)",
  system: "rgba(99,102,241,0.12)",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function NotificationItem({ notif, onRead }: { notif: Notification; onRead: (id: string) => void }) {
  const color = CATEGORY_COLORS[notif.category];
  const bg = CATEGORY_BG[notif.category];
  return (
    <div
      onClick={() => onRead(notif.id)}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        backgroundColor: notif.read ? "transparent" : "rgba(255,255,255,0.025)",
        cursor: "pointer",
        transition: "background 0.15s",
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        position: "relative",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = notif.read ? "transparent" : "rgba(255,255,255,0.025)"; }}
    >
      {/* Unread dot */}
      {!notif.read && (
        <div style={{
          position: "absolute", top: 12, left: 5,
          width: 5, height: 5, borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
        }} />
      )}

      {/* Category badge */}
      <div style={{
        flexShrink: 0, marginTop: 2,
        width: 28, height: 28, borderRadius: 6,
        backgroundColor: bg,
        border: `1px solid ${color}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color,
      }}>
        {notif.category === "signal" && <Zap size={13} />}
        {notif.category === "trade"  && <BarChart2 size={13} />}
        {notif.category === "news"   && <Newspaper size={13} />}
        {notif.category === "system" && <Settings2 size={13} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, fontFamily: "monospace",
            color: notif.read ? "#94a3b8" : "#e2e8f0",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {notif.title}
          </span>
          <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9, color: "#475569", fontFamily: "monospace" }}>
            {timeAgo(notif.timestamp)}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 10.5, color: "#64748b", lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {notif.message}
        </p>

        {/* Signal meta */}
        {notif.category === "signal" && notif.meta && (
          <div style={{ marginTop: 5, display: "flex", gap: 5 }}>
            {notif.meta.symbol && (
              <span style={{ fontSize: 9, fontFamily: "monospace", backgroundColor: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 4, color: "#94a3b8" }}>
                {notif.meta.symbol}
              </span>
            )}
            {notif.meta.direction && (
              <span style={{
                fontSize: 9, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                backgroundColor: notif.meta.direction === "BUY" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                color: notif.meta.direction === "BUY" ? "#10b981" : "#ef4444",
              }}>
                {notif.meta.direction}
              </span>
            )}
            {notif.meta.aiResult && (
              <span style={{
                fontSize: 9, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                backgroundColor: notif.meta.aiResult === "VALID" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                color: notif.meta.aiResult === "VALID" ? "#10b981" : "#ef4444",
              }}>
                AI {notif.meta.aiResult}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory | "all">("all");
  const [animating, setAnimating] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, markRead, markAllRead, clear, unreadCount } = useNotifications();

  const totalUnread = unreadCount();

  // Pulse bell when new notification arrives
  const prevUnread = useRef(totalUnread);
  useEffect(() => {
    if (totalUnread > prevUnread.current) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
    }
    prevUnread.current = totalUnread;
  }, [totalUnread]);

  // Close on outside click — check both the bell button and the portal panel
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const clickedBell = bellRef.current?.contains(e.target as Node);
      const clickedPanel = panelRef.current?.contains(e.target as Node);
      if (!clickedBell && !clickedPanel) setIsOpen(false);
    };
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const visibleNotifs = notifications.filter(
    (n) => activeCategory === "all" || n.category === activeCategory
  );

  const catUnread = (cat: NotificationCategory | "all") =>
    cat === "all" ? totalUnread : unreadCount(cat as NotificationCategory);

  const panelJSX = isOpen ? (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: "3.1rem",
        right: "8px",
        width: 430,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 4rem)",
        backgroundColor: "#0a0d11",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
          {/* Header */}
          <div style={{
            padding: "12px 14px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Notifications
              </span>
              {totalUnread > 0 && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                  {totalUnread} unread
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => markAllRead(activeCategory === "all" ? undefined : activeCategory)}
                title="Mark all read"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#475569", padding: "3px 5px", borderRadius: 4, display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
              >
                <CheckCheck size={13} />
              </button>
              <button
                onClick={() => clear(activeCategory === "all" ? undefined : activeCategory)}
                title="Clear all"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#475569", padding: "3px 5px", borderRadius: 4, display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#475569", padding: "3px 5px", borderRadius: 4, display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Category tabs */}
          <div style={{
            display: "flex", gap: 2, padding: "8px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0, overflowX: "auto", scrollbarWidth: "none",
          }}>
            {CATEGORIES.map((cat) => {
              const unread = catUnread(cat.key);
              const isActive = activeCategory === cat.key;
              const accent = cat.key === "all" ? "#10b981" : CATEGORY_COLORS[cat.key as NotificationCategory];
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  style={{
                    background: isActive ? `${accent}18` : "transparent",
                    border: isActive ? `1px solid ${accent}44` : "1px solid transparent",
                    borderRadius: 6,
                    padding: "4px 10px",
                    cursor: "pointer",
                    color: isActive ? accent : "#475569",
                    fontFamily: "monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                >
                  {cat.icon}
                  {cat.label}
                  {unread > 0 && (
                    <span style={{
                      backgroundColor: isActive ? accent : "#374151",
                      color: isActive ? "white" : "#9ca3af",
                      borderRadius: 8, fontSize: 9, padding: "0 4px",
                      minWidth: 14, textAlign: "center",
                    }}>
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Notification list */}
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#1e293b transparent" }}>
            {visibleNotifs.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                padding: "48px 20px", color: "#374151",
              }}>
                <BellOff size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                <span style={{ fontFamily: "monospace", fontSize: 11, textAlign: "center" }}>
                  No notifications yet
                </span>
              </div>
            ) : (
              visibleNotifs.map((notif) => (
                <NotificationItem key={notif.id} notif={notif} onRead={markRead} />
              ))
            )}
          </div>
    </div>
  ) : null;

  return (
    <div style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen((o) => !o)}
        style={{
          background: isOpen ? "rgba(16,185,129,0.1)" : "transparent",
          border: isOpen ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
          borderRadius: 6,
          width: 30, height: 30,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          color: isOpen ? "#10b981" : "#64748b",
          position: "relative",
          transition: "all 0.2s",
        }}
        title="Notifications"
      >
        <Bell
          size={15}
          style={{
            transform: animating ? "rotate(-20deg)" : "none",
            transition: "transform 0.1s ease",
          }}
        />
        {totalUnread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 8,
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: 9, fontWeight: 700, fontFamily: "monospace",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px",
            boxShadow: "0 0 6px rgba(239,68,68,0.6)",
          }}>
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Render panel via portal so it escapes the header's backdropFilter stacking context */}
      {typeof document !== "undefined" && ReactDOM.createPortal(panelJSX, document.body)}
    </div>
  );
}
