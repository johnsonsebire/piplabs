import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Chart", href: "/chart" },
    { label: "Trades", href: "/trades" },
    { label: "Strategies", href: "/strategies" },
    { label: "Indicators", href: "/indicators" },
    { label: "Backtest", href: "/backtest" },
    { label: "Auto Trade", href: "/autotrade" },
    { label: "News", href: "/news" },
    { label: "Settings", href: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card z-10 relative">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 text-primary font-bold tracking-widest text-sm uppercase">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 13L10 6L14 10L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
              <path d="M21 3V10M21 3H14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
            </svg>
            Terminal
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors ${isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border-r border-border pr-3 mr-1">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
            <span className="text-xs font-mono text-muted-foreground">WS: CONNECTED</span>
          </div>
          
          <Link href="/settings">
            <div className="text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer truncate max-w-[150px]">
              {user?.primaryEmailAddress?.emailAddress || 'User'}
            </div>
          </Link>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs uppercase font-mono rounded-none h-8"
            onClick={() => signOut({ redirectUrl: '/' })}
          >
            Exit
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}