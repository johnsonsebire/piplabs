import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-vh-100 d-flex flex-column" data-bs-theme="dark" style={{ backgroundColor: 'var(--bs-body-bg)', color: 'var(--bs-body-color)' }}>
      {/* Header */}
      <header className="d-flex align-items-center justify-content-between px-4 flex-shrink-0" style={{ height: '3.5rem', borderBottom: '1px solid var(--bs-border-color)', backgroundColor: 'var(--bs-card-bg)' }}>
        <div className="d-flex align-items-center gap-2 text-success fw-bold text-uppercase small letter-spacing-widest" style={{ letterSpacing: '0.1em' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 13L10 6L14 10L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
            <path d="M21 3V10M21 3H14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
          </svg>
          PipLabs
        </div>
        <div className="d-flex align-items-center gap-3">
          <Link href="/sign-in" className="small fw-medium text-secondary text-decoration-none" style={{ transition: 'color 0.2s' }}>
            Log In
          </Link>
          <Link href="/sign-up">
            <Button className="text-uppercase letter-spacing-wider fw-bold small">
              Initialize
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 d-flex flex-column align-items-center justify-content-center p-4 text-center">
        <div style={{ maxWidth: '48rem' }}>
          {/* Glowing badge */}
          <div className="mb-4 d-inline-flex align-items-center gap-2 px-3 py-2" style={{ backgroundColor: 'var(--bs-primary-bg-subtle)', border: '1px solid var(--bs-primary-border-subtle)' }}>
            <div className="rounded-circle bg-success" style={{ width: '0.375rem', height: '0.375rem', animation: 'pulse 2s infinite' }}></div>
            <span className="font-mono text-success text-uppercase letter-spacing-widest" style={{ fontSize: '0.625rem' }}>System Online</span>
          </div>

          <h1 className="display-4 fw-bold text-uppercase mb-3" style={{ letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Precision Trading <br/>
            <span className="text-success">Without Compromise</span>
          </h1>
          <p className="lead font-mono text-secondary mx-auto mb-4" style={{ maxWidth: '36rem', fontSize: '1rem' }}>
            A high-performance universal terminal for serious traders. 
            Real-time data, algorithmic execution, and deep analytics.
          </p>
          <div className="d-flex align-items-center justify-content-center gap-3 pt-3">
            <Link href="/sign-up">
              <Button className="text-uppercase letter-spacing-widest fw-bold px-5" style={{ height: '3.25rem', fontSize: '0.75rem' }}>
                Launch Terminal
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" className="text-uppercase letter-spacing-widest fw-bold px-4" style={{ height: '3.25rem', fontSize: '0.75rem' }}>
                Access Terminal
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature cards */}
        <div className="row row-cols-1 row-cols-md-3 g-4 mt-5 w-100" style={{ maxWidth: '64rem' }}>
          <div className="col">
            <div className="card h-100 p-4 feature-card" style={{ transition: 'border-color 0.3s, background-color 0.3s' }}>
              <div className="d-flex align-items-center justify-content-center mb-3" style={{ width: '2.5rem', height: '2.5rem', backgroundColor: 'var(--bs-primary-bg-subtle)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <h3 className="fw-bold text-uppercase letter-spacing-wider mb-2" style={{ fontSize: '0.875rem' }}>Live Data Feed</h3>
              <p className="small font-mono text-secondary mb-0">Direct WebSocket connection to Deriv for zero-latency market updates.</p>
            </div>
          </div>
          <div className="col">
            <div className="card h-100 p-4 feature-card" style={{ transition: 'border-color 0.3s, background-color 0.3s' }}>
              <div className="d-flex align-items-center justify-content-center mb-3" style={{ width: '2.5rem', height: '2.5rem', backgroundColor: 'var(--bs-primary-bg-subtle)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h3 className="fw-bold text-uppercase letter-spacing-wider mb-2" style={{ fontSize: '0.875rem' }}>Algo Strategies</h3>
              <p className="small font-mono text-secondary mb-0">Code, test, and deploy automated trading strategies with full control.</p>
            </div>
          </div>
          <div className="col">
            <div className="card h-100 p-4 feature-card" style={{ transition: 'border-color 0.3s, background-color 0.3s' }}>
              <div className="d-flex align-items-center justify-content-center mb-3" style={{ width: '2.5rem', height: '2.5rem', backgroundColor: 'var(--bs-primary-bg-subtle)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </div>
              <h3 className="fw-bold text-uppercase letter-spacing-wider mb-2" style={{ fontSize: '0.875rem' }}>Deep Analytics</h3>
              <p className="small font-mono text-secondary mb-0">Comprehensive backtesting and AI-assisted market analysis.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-3 font-mono text-secondary flex-shrink-0" style={{ fontSize: '0.625rem', borderTop: '1px solid var(--bs-border-color)' }}>
        <span className="text-uppercase letter-spacing-wider">PipLabs</span> — Built for precision
      </footer>
    </div>
  );
}