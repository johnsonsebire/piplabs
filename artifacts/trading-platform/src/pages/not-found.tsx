import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" data-bs-theme="dark" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
      <div className="card mx-3" style={{ maxWidth: '28rem', width: '100%' }}>
        <div className="card-body p-4">
          <div className="d-flex align-items-center gap-3 mb-3">
            <div className="d-flex align-items-center justify-content-center" style={{ width: '2.5rem', height: '2.5rem', backgroundColor: 'var(--bs-danger-bg-subtle)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <h1 className="h5 fw-bold text-uppercase mb-0 font-mono">404</h1>
              <div className="small text-secondary font-mono text-uppercase letter-spacing-wider">Page Not Found</div>
            </div>
          </div>

          <p className="small text-secondary font-mono mb-4">
            The requested resource could not be located. Check the URL or navigate back to the terminal.
          </p>

          <Link href="/dashboard">
            <Button className="w-100 text-uppercase fw-bold letter-spacing-wider small">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
