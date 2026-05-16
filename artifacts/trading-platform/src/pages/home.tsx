import { useLocation, Link } from "wouter";
import { useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold tracking-widest text-lg uppercase">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 13L10 6L14 10L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
            <path d="M21 3V10M21 3H14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
          </svg>
          DerivTerminal
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Log In
          </Link>
          <Link href="/sign-up">
            <Button variant="default" className="uppercase tracking-wide text-xs h-9 rounded-none font-bold">
              Initialize
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-3xl space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter uppercase">
            Precision Trading <br/><span className="text-primary">Without Compromise</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-mono">
            A high-performance terminal for serious Deriv traders. 
            Real-time data, algorithmic execution, and deep analytics.
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <Link href="/sign-up">
              <Button size="lg" className="rounded-none text-sm uppercase tracking-widest font-bold px-8 h-14">
                Launch Terminal
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full text-left">
          <div className="border border-border p-6 bg-card">
            <div className="h-10 w-10 bg-primary/10 text-primary flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <h3 className="font-bold text-lg uppercase tracking-wide mb-2">Live Data Feed</h3>
            <p className="text-sm text-muted-foreground font-mono">Direct WebSocket connection to Deriv for zero-latency market updates.</p>
          </div>
          <div className="border border-border p-6 bg-card">
            <div className="h-10 w-10 bg-primary/10 text-primary flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <h3 className="font-bold text-lg uppercase tracking-wide mb-2">Algo Strategies</h3>
            <p className="text-sm text-muted-foreground font-mono">Code, test, and deploy automated trading strategies with full control.</p>
          </div>
          <div className="border border-border p-6 bg-card">
            <div className="h-10 w-10 bg-primary/10 text-primary flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </div>
            <h3 className="font-bold text-lg uppercase tracking-wide mb-2">Deep Analytics</h3>
            <p className="text-sm text-muted-foreground font-mono">Comprehensive backtesting and AI-assisted market analysis.</p>
          </div>
        </div>
      </main>
    </div>
  );
}