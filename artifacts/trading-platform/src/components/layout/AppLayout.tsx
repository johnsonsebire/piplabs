import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { AiChatWidget } from "@/components/chat/AiChatWidget";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: "bi-grid" },
    { label: "Chart", href: "/chart", icon: "bi-graph-up" },
    { label: "Trades", href: "/trades", icon: "bi-arrow-left-right" },
    { label: "Strategies", href: "/strategies", icon: "bi-lightning" },
    { label: "Indicators", href: "/indicators", icon: "bi-bar-chart-line" },
    { label: "Backtest", href: "/backtest", icon: "bi-clock-history" },
    { label: "Auto Trade", href: "/autotrade", icon: "bi-robot" },
    { label: "MT5 Accounts", href: "/mt5-accounts", icon: "bi-wallet2" },
    { label: "Copy Trading", href: "/copy-trading", icon: "bi-people" },
    { label: "News", href: "/news", icon: "bi-newspaper" },
    { label: "AI Builder", href: "/ai-builder", icon: "bi-robot" },
    { label: "Settings", href: "/settings", icon: "bi-gear" },
  ];

  return (
    <div className="min-vh-100 d-flex flex-column" data-bs-theme="dark">
      {/* Top navigation bar */}
      <header 
        className="d-flex align-items-center justify-content-between px-3 px-md-4 flex-shrink-0"
        style={{ 
          height: '3rem', 
          backgroundColor: 'var(--bs-card-bg)', 
          borderBottom: '1px solid var(--bs-border-color)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Left: Logo + Nav */}
        <div className="d-flex align-items-center gap-3 overflow-hidden">
          <Link href="/dashboard" className="d-flex align-items-center gap-2 text-success fw-bold text-uppercase flex-shrink-0" style={{ textDecoration: 'none', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 13L10 6L14 10L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
              <path d="M21 3V10M21 3H14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
            </svg>
            Terminal
          </Link>

          {/* Divider */}
          <div className="d-none d-md-block flex-shrink-0" style={{ width: '1px', height: '1.25rem', backgroundColor: 'var(--bs-border-color)' }}></div>

          {/* Navigation */}
          <nav className="d-none d-md-flex align-items-center gap-0 overflow-auto" style={{ scrollbarWidth: 'none' }}>
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div 
                    className={`px-2 px-lg-3 py-2 font-mono text-uppercase d-flex align-items-center gap-1 flex-shrink-0`}
                    style={{ 
                      fontSize: '0.625rem',
                      letterSpacing: '0.05em',
                      color: isActive ? '#10b981' : '#64748b',
                      backgroundColor: isActive ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                      borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = '#94a3b8';
                        e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = '#64748b';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <i className={`bi ${item.icon}`} style={{ fontSize: '0.6875rem' }}></i>
                    <span className="d-none d-lg-inline">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Status + User */}
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {/* Connection status */}
          <div className="d-none d-sm-flex align-items-center gap-2 pe-2 me-1" style={{ borderRight: '1px solid var(--bs-border-color)' }}>
            <div className="rounded-circle" style={{ width: '0.375rem', height: '0.375rem', backgroundColor: '#10b981', animation: 'pulse 2s infinite' }}></div>
            <span className="font-mono text-secondary" style={{ fontSize: '0.5625rem' }}>CONNECTED</span>
          </div>
          
          {/* User email */}
          <Link href="/settings" style={{ textDecoration: 'none' }}>
            <div 
              className="font-mono text-secondary text-truncate"
              style={{ 
                maxWidth: '120px', 
                fontSize: '0.6875rem',
                transition: 'color 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
            >
              {user?.primaryEmailAddress?.emailAddress || 'User'}
            </div>
          </Link>
          
          {/* Exit button */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-uppercase font-mono"
            style={{ fontSize: '0.625rem' }}
            onClick={() => signOut({ redirectUrl: '/' })}
          >
            Exit
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 d-flex flex-column position-relative overflow-hidden" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
        {children}
      </main>

      <AiChatWidget />
    </div>
  );
}