import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { dark } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import ChartPage from "@/pages/chart";
import TradesPage from "@/pages/trades/index";
import TradeDetailPage from "@/pages/trades/[id]";
import StrategiesPage from "@/pages/strategies";
import IndicatorsPage from "@/pages/indicators";
import BacktestPage from "@/pages/backtest";
import TradeChartPage from "@/pages/trade-chart";
import NewsPage from "@/pages/news";
import SettingsPage from "@/pages/settings";
import AutoTradePage from "@/pages/autotrade";
import BacktestReplayPage from "@/pages/backtest-replay";
import AutoTradeChartPage from "@/pages/autotrade-chart";
import AIBuilderPage from "@/pages/ai-builder";

import MT5AccountsPage from "@/pages/mt5-accounts";
import CopyTradingPage from "@/pages/copy-trading";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_dummy_key";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(151, 100%, 45%)",
    colorForeground: "hsl(210, 40%, 98%)",
    colorMutedForeground: "hsl(215, 16%, 65%)",
    colorDanger: "hsl(348, 83%, 60%)",
    colorBackground: "hsl(222, 35%, 10%)",
    colorInput: "hsl(222, 30%, 16%)",
    colorInputForeground: "hsl(210, 40%, 98%)",
    colorNeutral: "hsl(222, 30%, 16%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0rem",
  },
  elements: {
    rootBox: "w-100 d-flex justify-content-center",
    cardBox: "card border overflow-hidden shadow",
    card: "border-0 bg-transparent shadow-none",
    footer: "border-0 bg-transparent shadow-none border-top",
    headerTitle: "h4 fw-bold",
    headerSubtitle: "small text-secondary",
    socialButtonsBlockButtonText: "fw-medium",
    formFieldLabel: "small fw-medium",
    footerActionLink: "text-success fw-medium",
    footerActionText: "text-secondary",
    dividerText: "text-secondary text-uppercase letter-spacing-wider",
    identityPreviewEditButton: "text-success",
    formFieldSuccessText: "text-success",
    alertText: "small",
    logoBox: "d-flex align-items-center justify-content-center",
    logoImage: "",
    socialButtonsBlockButton: "",
    formButtonPrimary: "btn btn-primary fw-semibold",
    formFieldInput: "form-control",
    footerAction: "py-3",
    dividerLine: "",
    alert: "",
    otpCodeFieldInput: "form-control",
    formFieldRow: "mb-3",
    main: "p-4",
  },
};

function SignInPage() {
  return (
    <div className="d-flex min-vh-100 align-items-center justify-content-center px-3 py-5" data-bs-theme="dark" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="d-flex min-vh-100 align-items-center justify-content-center px-3 py-5" data-bs-theme="dark" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

import { useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

function AuthConfigurator({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, userId } = useAuth();
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    if (!isLoaded) return; // Wait for Clerk to load

    setAuthTokenGetter(getToken);

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let [resource, config] = args;
      
      const url = typeof resource === 'string' 
        ? resource 
        : (resource instanceof Request ? resource.url : resource.toString());
      
      if (url.startsWith('/api') || url.includes('/api/')) {
        try {
          const token = await getToken();
          console.log(`[Fetch Interceptor] Request to ${url} - UserID: ${userId} - Token Present: ${!!token}`);
          
          if (token) {
            if (resource instanceof Request) {
              resource.headers.set('Authorization', `Bearer ${token}`);
            } else {
              config = config || {};
              const headers = new Headers(config.headers);
              if (!headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${token}`);
                config.headers = Object.fromEntries(headers.entries());
              }
              args[1] = config;
            }
          }
        } catch (err) {
          console.error("Error getting Clerk token for fetch:", err);
        }
      }
      return originalFetch(...args);
    };

    setReady(true);

    return () => {
      window.fetch = originalFetch;
      setAuthTokenGetter(null);
    };
  }, [getToken, isLoaded, userId]);

  if (!ready) return null;

  return <>{children}</>;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/dashboard`}
      localization={{
        signIn: {
          start: {
            title: "Access Terminal",
            subtitle: "Enter your credentials to connect",
          },
        },
        signUp: {
          start: {
            title: "Initialize Account",
            subtitle: "Create your trading profile",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <AuthConfigurator>
          <TooltipProvider>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              
              {/* Protected Routes */}
              <Route path="/dashboard">
                <ProtectedRoute component={Dashboard} />
              </Route>
              <Route path="/chart">
                <ProtectedRoute component={ChartPage} />
              </Route>
              <Route path="/trades">
                <ProtectedRoute component={TradesPage} />
              </Route>
              <Route path="/trades/:id">
                <ProtectedRoute component={TradeDetailPage} />
              </Route>
              <Route path="/strategies">
                <ProtectedRoute component={StrategiesPage} />
              </Route>
              <Route path="/ai-builder">
                <ProtectedRoute component={AIBuilderPage} />
              </Route>
              <Route path="/indicators">
                <ProtectedRoute component={IndicatorsPage} />
              </Route>
              <Route path="/backtest">
                <ProtectedRoute component={BacktestPage} />
              </Route>
              <Route path="/backtest/:id/replay">
                <ProtectedRoute component={BacktestReplayPage} />
              </Route>
              <Route path="/backtest/chart">
                <ProtectedRoute component={TradeChartPage} />
              </Route>
              <Route path="/news">
                <ProtectedRoute component={NewsPage} />
              </Route>
              <Route path="/autotrade">
                <ProtectedRoute component={AutoTradePage} />
              </Route>
              <Route path="/autotrade/chart">
                <ProtectedRoute component={AutoTradeChartPage} />
              </Route>
              <Route path="/mt5-accounts">
                <ProtectedRoute component={MT5AccountsPage} />
              </Route>
              <Route path="/copy-trading">
                <ProtectedRoute component={CopyTradingPage} />
              </Route>
              <Route path="/settings">
                <ProtectedRoute component={SettingsPage} />
              </Route>
              
              <Route component={NotFound} />
            </Switch>
            <Toaster />
          </TooltipProvider>
        </AuthConfigurator>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
