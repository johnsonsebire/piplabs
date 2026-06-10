import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Copy, AlertCircle, Check, ChevronsUpDown, Activity, Wifi } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { swalSuccess, swalError, swalConfirm } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function CopyTradingPage() {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscriberAccountId, setSubscriberAccountId] = useState("");
  const [providerAccountId, setProviderAccountId] = useState("");
  const [riskMultiplier, setRiskMultiplier] = useState("1.0");
  const [riskType, setRiskType] = useState("fixed");
  const [openProviderCombo, setOpenProviderCombo] = useState(false);
  const queryClient = useQueryClient();

  const [activeStreamAccountId, setActiveStreamAccountId] = useState<string | null>(null);
  const [streamedTransactions, setStreamedTransactions] = useState<any[]>([]);
  const [streamedLogs, setStreamedLogs] = useState<any[]>([]);
  const [streamedStopouts, setStreamedStopouts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"transactions" | "logs" | "stopouts">("transactions");
  const [streamStatus, setStreamStatus] = useState<string>("Disconnected");
  const [logStatus, setLogStatus] = useState<string>("Disconnected");
  const [isResettingStopouts, setIsResettingStopouts] = useState(false);

  const handleResetStopouts = async (type: string = 'equity') => {
    if (!activeStreamAccountId) return;
    setIsResettingStopouts(true);
    try {
      const res = await fetch("/api/copy-trading/stopouts/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberAccountId: activeStreamAccountId, type })
      });
      const data = await res.json();
      if (res.ok) {
        swalSuccess("Stopouts Reset", data.message || "Successfully reset subscriber stopouts.");
        // Refetch stopouts
        const stopoutsRes = await fetch(`/api/copy-trading/stopouts?subscriberAccountId=${activeStreamAccountId}`);
        const stopoutsData = await stopoutsRes.json();
        setStreamedStopouts(Array.isArray(stopoutsData) ? stopoutsData : stopoutsData ? [stopoutsData] : []);
      } else {
        swalError("Reset Failed", data.error || "Failed to reset stopouts.");
      }
    } catch (err: any) {
      swalError("Reset Failed", err.message || "Failed to reset stopouts.");
    } finally {
      setIsResettingStopouts(false);
    }
  };

  useEffect(() => {
    if (!activeStreamAccountId) return;
    
    setStreamedTransactions([]);
    setStreamedLogs([]);
    setStreamedStopouts([]);
    setStreamStatus("Connecting...");
    setLogStatus("Connecting...");
    
    // Fetch historical transactions
    fetch(`/api/copy-trading/transactions?subscriberAccountId=${activeStreamAccountId}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setStreamedTransactions(data);
      })
      .catch(err => console.error("Error fetching transactions history:", err));
      
    // Fetch historical logs
    fetch(`/api/copy-trading/logs?subscriberAccountId=${activeStreamAccountId}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setStreamedLogs(data);
      })
      .catch(err => console.error("Error fetching logs history:", err));
      
    // Fetch historical stopouts
    fetch(`/api/copy-trading/stopouts?subscriberAccountId=${activeStreamAccountId}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setStreamedStopouts(Array.isArray(data) ? data : data ? [data] : []);
      })
      .catch(err => console.error("Error fetching stopouts:", err));

    // Connect to transactions stream
    const txSource = new EventSource(`/api/copy-trading/transactions/stream?subscriberAccountId=${activeStreamAccountId}`);
    
    txSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setStreamStatus("Streaming Realtime");
        } else if (data.type === 'transaction') {
          setStreamedTransactions(prev => {
            if (prev.some(t => t.id === data.transaction.id)) return prev;
            return [data.transaction, ...prev];
          });
        } else if (data.type === 'error') {
          setStreamStatus(`Error: ${data.error}`);
        }
      } catch (e) {
        console.error("Failed to parse event", e);
      }
    };
    
    txSource.onerror = () => {
      setStreamStatus("Tx disconnected");
      txSource.close();
    };
    
    // Connect to logs stream
    const logSource = new EventSource(`/api/copy-trading/logs/stream?subscriberAccountId=${activeStreamAccountId}`);
    
    logSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setLogStatus("Streaming Realtime");
        } else if (data.type === 'log') {
          setStreamedLogs(prev => {
            if (prev.some(l => l.message === data.log.message && l.time === data.log.time)) return prev;
            return [data.log, ...prev];
          });
        } else if (data.type === 'error') {
          setLogStatus(`Error: ${data.error}`);
        }
      } catch (e) {
        console.error("Failed to parse event", e);
      }
    };
    
    logSource.onerror = () => {
      setLogStatus("Log disconnected");
      logSource.close();
    };
    
    return () => {
      txSource.close();
      logSource.close();
      setStreamStatus("Disconnected");
      setLogStatus("Disconnected");
    };
  }, [activeStreamAccountId]);

  const { data: providers, isLoading: providersLoading, isError: providersError } = useQuery({
    queryKey: ["copy-trading-providers"],
    queryFn: async () => {
      const res = await fetch("/api/copy-trading/providers");
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    }
  });

  const { data: accounts, isError: isAccountsError, error: accountsError } = useQuery({
    queryKey: ["mt5-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/mt5-accounts");
      if (!res.ok) throw new Error("Failed to fetch MT5 accounts");
      return res.json();
    }
  });

  const { data: subscriptions, isLoading, isError: isSubsError, error: subsError } = useQuery({
    queryKey: ["copy-trading-subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/copy-trading");
      if (!res.ok) throw new Error("Failed to fetch subscriptions");
      return res.json();
    }
  });

  const subscribeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/copy-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      swalSuccess("Subscribed Successfully", "You are now copying trades from the provider.");
      setIsSubscribing(false);
      setProviderAccountId("");
      queryClient.invalidateQueries({ queryKey: ["copy-trading-subscriptions"] });
    },
    onError: (error: Error) => {
      let msg = error.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      swalError("Subscription Failed", msg);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const res = await fetch(`/api/copy-trading/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      swalSuccess("Updated", "Subscription status has been updated.");
      queryClient.invalidateQueries({ queryKey: ["copy-trading-subscriptions"] });
    },
    onError: (error: Error) => {
      let msg = error.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      swalError("Update Failed", msg);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/copy-trading/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    },
    onSuccess: () => {
      swalSuccess("Deleted", "Subscription has been permanently removed.");
      queryClient.invalidateQueries({ queryKey: ["copy-trading-subscriptions"] });
    },
    onError: (error: Error) => {
      let msg = error.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      swalError("Delete Failed", msg);
    }
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    subscribeMutation.mutate({ 
      subscriberAccountId, 
      providerAccountId, 
      riskMultiplier: parseFloat(riskMultiplier),
      riskType
    });
  };

  return (
    <AppLayout>
      <div className="d-flex flex-column w-100 overflow-hidden p-4 gap-4 mx-auto">
        <div className="d-flex justify-content-between align-items-center flex-shrink-0 mt-4">
          <div>
            <h1 className="h4 fw-bold font-mono text-uppercase tracking-tight">Copy Trading</h1>
            <p className="font-mono text-secondary small mt-1 mb-0">Subscribe to strategy providers or offer your own signals.</p>
          </div>
          {!isSubscribing && (
            <Button
              className="rounded-none fw-bold text-uppercase letter-spacing-wider font-mono"
              onClick={() => setIsSubscribing(true)}
            >
              <Plus className="me-2 h-4 w-4" /> New Subscription
            </Button>
          )}
        </div>

        <div className="d-flex flex-grow-1 gap-4 overflow-hidden w-100">
          <div className="flex-grow-1 overflow-auto d-flex flex-column gap-4 pb-4 w-100">
            {isSubscribing && (
              <div className="border border-success p-4 d-flex flex-column gap-3 w-100" style={{ backgroundColor: 'var(--background)', maxWidth: '50%', minWidth: '320px', alignSelf: 'center' }}>
                <div className="d-flex align-items-center justify-content-between border-bottom border-secondary pb-3">
                  <div>
                    <h2 className="small fw-bold font-mono text-uppercase m-0">Configure Subscription</h2>
                    <p className="font-mono text-secondary mt-1" style={{ fontSize: '10px', margin: 0 }}>Select an account to copy trades from a provider.</p>
                  </div>
                </div>
                
                {isAccountsError ? (
                  <Alert variant="destructive" className="rounded-none">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="font-mono text-uppercase">Error loading accounts</AlertTitle>
                    <AlertDescription className="font-mono small">
                      {accountsError instanceof Error ? accountsError.message : "Failed to load accounts. Please check server logs."}
                    </AlertDescription>
                  </Alert>
                ) : accounts?.length === 0 ? (
                  <Alert variant="destructive" className="rounded-none">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="font-mono text-uppercase">No MT5 Accounts</AlertTitle>
                    <AlertDescription className="font-mono small">
                      You need to connect an MT5 account first before you can subscribe to a strategy.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <form id="subscribe-form" onSubmit={handleSubscribe} className="d-flex flex-column gap-3">
                    <div className="row g-3">
                      <div className="col-12 d-flex flex-column gap-2">
                        <Label className="small text-uppercase font-mono text-secondary">Your Account (Subscriber)</Label>
                        <Select value={subscriberAccountId} onValueChange={setSubscriberAccountId}>
                          <SelectTrigger className="border-secondary rounded-none font-mono small">
                            <SelectValue placeholder="Select your account" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none border-secondary">
                            {accounts?.map((acc: any) => (
                              <SelectItem key={acc.id} value={acc.id} className="font-mono small text-uppercase">{acc.name} ({acc.login})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="col-12 col-md-6 d-flex flex-column gap-2">
                        <Label className="small text-uppercase font-mono text-secondary">Provider Account</Label>
                        <Popover open={openProviderCombo} onOpenChange={setOpenProviderCombo}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openProviderCombo}
                              className="w-100 justify-content-between rounded-none font-mono border-secondary text-truncate"
                            >
                              <span className="text-truncate">
                                {providerAccountId
                                  ? providers?.find((p: any) => p.id === providerAccountId)?.name || providerAccountId
                                  : "Select provider..."}
                              </span>
                              <ChevronsUpDown className="ms-2 h-4 w-4 flex-shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 rounded-none border-secondary" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                            <Command filter={(value, search, keywords) => {
                              const extendValue = value + " " + (keywords || []).join(" ");
                              if (extendValue.toLowerCase().includes(search.toLowerCase())) return 1;
                              return 0;
                            }}>
                              <CommandInput placeholder="Search providers..." className="font-mono small border-none" />
                              <CommandList>
                                <CommandEmpty className="font-mono small p-3 text-center text-secondary">
                                  {providersLoading ? "Loading providers..." : providersError ? "Failed to fetch providers (Did you restart the server?)" : "No provider found."}
                                </CommandEmpty>
                                <CommandGroup className="max-h-[200px] overflow-auto">
                                  {providers?.map((provider: any) => (
                                    <CommandItem
                                      key={provider.id}
                                      value={provider.id}
                                      keywords={[provider.name, provider.server]}
                                      onSelect={(currentValue) => {
                                        setProviderAccountId(currentValue);
                                        setOpenProviderCombo(false);
                                      }}
                                      className="font-mono small cursor-pointer"
                                    >
                                      <Check
                                        className={cn(
                                          "me-2 h-4 w-4",
                                          providerAccountId === provider.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {provider.name} <span className="text-secondary ms-1">({provider.server})</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="col-12 d-flex flex-column gap-3 mt-2">
                        <Label className="small text-uppercase font-mono text-secondary">Risk Strategy</Label>
                        <div className="d-flex gap-2">
                          <Button 
                            type="button"
                            variant={riskType === 'fixed' ? 'default' : 'outline'}
                            className={`flex-grow-1 rounded-none font-mono small text-uppercase ${riskType === 'fixed' ? 'border-primary' : 'border-secondary opacity-75'}`}
                            onClick={() => setRiskType('fixed')}
                          >
                            <Check className={cn("me-2 h-4 w-4", riskType === 'fixed' ? "opacity-100" : "opacity-0")} />
                            Fixed Multiplier
                          </Button>
                          <Button 
                            type="button"
                            variant={riskType === 'proportional' ? 'default' : 'outline'}
                            className={`flex-grow-1 rounded-none font-mono small text-uppercase ${riskType === 'proportional' ? 'border-primary' : 'border-secondary opacity-75'}`}
                            onClick={() => setRiskType('proportional')}
                          >
                            <Check className={cn("me-2 h-4 w-4", riskType === 'proportional' ? "opacity-100" : "opacity-0")} />
                            Proportional
                          </Button>
                        </div>
                      </div>

                      {riskType === 'fixed' && (
                        <div className="col-12 col-md-6 d-flex flex-column gap-2 mt-2">
                          <Label className="small text-uppercase font-mono text-secondary">Risk Multiplier</Label>
                          <Input 
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={riskMultiplier} 
                            onChange={(e) => setRiskMultiplier(e.target.value)} 
                            required={riskType === 'fixed'} 
                            className="rounded-none font-mono border-secondary"
                          />
                          <p className="font-mono text-secondary m-0" style={{ fontSize: '9px' }}>
                            1.0 means copy trades with exact same lot size. 0.5 means half.
                          </p>
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-3 mt-2 border-top border-secondary d-flex justify-content-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsSubscribing(false)} className="rounded-none font-mono text-uppercase">Cancel</Button>
                      <Button type="submit" disabled={subscribeMutation.isPending || !accounts || accounts.length === 0} className="rounded-none fw-bold text-uppercase font-mono letter-spacing-wider">
                        {subscribeMutation.isPending ? "Subscribing..." : "Subscribe"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="p-4 text-center text-secondary text-uppercase font-mono">Loading subscriptions...</div>
            ) : isSubsError ? (
              <div className="border border-danger p-4 text-center text-danger font-mono small">
                <strong>Error loading subscriptions:</strong> {subsError instanceof Error ? subsError.message : "Please check the server."}
              </div>
            ) : subscriptions?.length === 0 ? (
              <div className="border border-secondary p-5 d-flex flex-column align-items-center text-center w-100" style={{ maxWidth: '50%', minWidth: '320px', alignSelf: 'center' }}>
                <Copy className="text-secondary mb-3 opacity-50" style={{ width: 48, height: 48 }} />
                <h3 className="h6 font-mono text-uppercase mb-2">No active subscriptions</h3>
                <p className="font-mono text-secondary small">You are not copying trades from any strategy providers. Subscribe to a provider to automatically execute their trades.</p>
                {!isSubscribing && (
                  <Button onClick={() => setIsSubscribing(true)} className="rounded-none fw-bold text-uppercase font-mono mt-3" variant="outline">
                    Find a Provider
                  </Button>
                )}
              </div>
            ) : (
              <div className="row g-4 m-0 w-100 justify-content-center">
                {subscriptions?.map((sub: any) => {
                  const myAccount = accounts?.find((a: any) => a.id === sub.subscriberAccountId);
                  return (
                    <div className="col-12 col-md-6 col-lg-4" key={sub.id}>
                      <div className="border border-secondary p-4 d-flex flex-column h-100 position-relative" style={{ backgroundColor: 'var(--background)' }}>
                        <div className="d-flex justify-content-between align-items-start mb-4">
                          <div className="pe-2 overflow-hidden flex-grow-1">
                            <div className="font-mono fw-bold text-uppercase">Subscription</div>
                            <div className="font-mono text-secondary mt-1 text-truncate" style={{ fontSize: '11px' }} title={`Provider: ${sub.providerAccountId}`}>Provider: {sub.providerAccountId?.substring(0,8)}...</div>
                          </div>
                          <span className={`px-2 py-1 rounded-sm text-uppercase font-mono fw-bold flex-shrink-0 ${sub.status === 'active' ? 'bg-success text-white' : 'bg-danger text-white'}`} style={{ fontSize: '10px' }}>
                            {sub.status}
                          </span>
                        </div>
                        
                        <div className="d-flex flex-column gap-3 mb-4 flex-grow-1">
                          <div className="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2">
                            <span className="font-mono text-secondary text-uppercase flex-shrink-0" style={{ fontSize: '11px' }}>My Account</span>
                            <span className="font-mono text-truncate text-end ps-3" style={{ fontSize: '12px' }} title={myAccount?.name || 'Unknown'}>{myAccount?.name || 'Unknown'}</span>
                          </div>
                          <div className="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2">
                            <span className="font-mono text-secondary text-uppercase flex-shrink-0" style={{ fontSize: '11px' }}>Risk Strategy</span>
                            <span className="font-mono fw-bold text-end" style={{ fontSize: '12px' }}>
                              {sub.riskType === 'proportional' ? 'PROPORTIONAL' : 'FIXED'} ({sub.riskMultiplier}x)
                            </span>
                          </div>
                        </div>
                        
                        <div className="pt-3 mt-auto d-flex gap-2 flex-column">
                          <Button 
                            variant="outline" 
                            className="w-100 rounded-none text-uppercase font-mono small fw-bold py-3 border-success text-success hover:bg-success hover:text-white"
                            onClick={() => setActiveStreamAccountId(sub.subscriberAccountId)}
                          >
                            <Activity className="me-2 h-4 w-4" /> Live Transactions
                          </Button>
                          <Button 
                            variant="outline" 
                            className={`w-100 rounded-none text-uppercase font-mono small fw-bold py-3 ${sub.status === 'active' ? 'border-danger text-danger hover:bg-danger hover:text-white' : 'border-success text-success hover:bg-success hover:text-white'}`}
                            onClick={() => updateMutation.mutate({ id: sub.id, status: sub.status === 'active' ? 'paused' : 'active' })}
                            disabled={updateMutation.isPending}
                          >
                            {updateMutation.isPending ? "Updating..." : sub.status === 'active' ? "Pause Copying" : "Resume Copying"}
                          </Button>
                          <Button 
                            variant="ghost" 
                            className="w-100 rounded-none text-uppercase font-mono small text-secondary hover:text-danger hover:bg-danger/10"
                            onClick={async () => {
                              const confirmed = await swalConfirm("Delete Subscription?", "Are you sure you want to permanently delete this subscription and stop copying trades?");
                              if(confirmed) {
                                deleteMutation.mutate(sub.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Delete Subscription
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Transactions Dialog (using Portal & Bootstrap classes) */}
      {activeStreamAccountId && typeof document !== 'undefined' && createPortal(
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 500, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
          data-bs-theme="dark"
        >
          <div className="card shadow-lg d-flex flex-column border border-secondary" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh' }}>
            <div className="card-header p-3 border-bottom d-flex justify-content-between align-items-center" style={{ backgroundColor: 'var(--bs-secondary-bg-subtle)' }}>
              <h2 className="m-0 text-uppercase font-mono text-white d-flex align-items-center gap-2" style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                <Wifi className={cn("h-4 w-4 text-success", (streamStatus.includes("Error") || logStatus.includes("Error")) && "text-danger animate-pulse")} />
                Live Transactions Stream
                <span className="badge font-mono text-[9px] text-uppercase bg-secondary/20 border border-secondary text-secondary ms-2">
                  Tx: {streamStatus} | Log: {logStatus}
                </span>
              </h2>
              <Button 
                type="button" 
                variant="ghost" 
                className="h-6 w-6 p-0 rounded-none hover:bg-destructive hover:text-destructive-foreground transition-colors text-white" 
                onClick={() => setActiveStreamAccountId(null)}
              >
                &times;
              </Button>
            </div>
            
            <div className="card-body p-4 overflow-y-auto d-flex flex-column gap-3" style={{ backgroundColor: 'var(--bs-card-bg)' }}>
              <div className="font-mono small text-secondary border-bottom border-secondary pb-2">
                Subscriber ID: <span className="text-white">{activeStreamAccountId}</span>
              </div>

              {/* Tab Navigation */}
              <div className="d-flex mb-2 gap-2 border-bottom border-secondary pb-3 shrink-0">
                <Button
                  type="button"
                  variant={activeTab === 'transactions' ? 'default' : 'outline'}
                  className="rounded-none font-mono text-uppercase flex-grow-1 text-xs py-2"
                  onClick={() => setActiveTab('transactions')}
                >
                  Transactions ({streamedTransactions.length})
                </Button>
                <Button
                  type="button"
                  variant={activeTab === 'logs' ? 'default' : 'outline'}
                  className="rounded-none font-mono text-uppercase flex-grow-1 text-xs py-2"
                  onClick={() => setActiveTab('logs')}
                >
                  Event Logs ({streamedLogs.length})
                </Button>
                <Button
                  type="button"
                  variant={activeTab === 'stopouts' ? 'default' : 'outline'}
                  className="rounded-none font-mono text-uppercase flex-grow-1 text-xs py-2"
                  onClick={() => setActiveTab('stopouts')}
                >
                  Health & Stopouts ({streamedStopouts.length})
                </Button>
              </div>

              <div className="overflow-auto flex-grow-1 d-flex flex-column gap-2" style={{ minHeight: '350px' }}>
                {activeTab === 'transactions' ? (
                  streamedTransactions.length === 0 ? (
                    <div className="d-flex flex-column align-items-center justify-content-center text-center text-secondary gap-3 opacity-50 my-auto py-5 w-100">
                      <Activity className="animate-pulse h-8 w-8 text-primary" />
                      <p className="font-mono small text-uppercase">
                        No transactions found.<br/>
                        Trades will appear here in realtime as they are copied.
                      </p>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2 w-100">
                      {streamedTransactions.map((tx, idx) => (
                        <div key={idx} className="border border-secondary p-3 bg-secondary/5 font-mono small d-flex flex-column gap-2">
                          <div className="d-flex justify-content-between align-items-center">
                            <span className="fw-bold text-success text-uppercase">Transaction {tx.type || tx.actionType}</span>
                            <span className="text-secondary" style={{ fontSize: '10px' }}>
                              {tx.time ? new Date(tx.time).toLocaleTimeString() : new Date().toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="row g-2">
                            <div className="col-6">
                              <span className="text-secondary uppercase text-[10px]">Symbol:</span> <span className="text-white">{tx.symbol || '-'}</span>
                            </div>
                            <div className="col-6">
                              <span className="text-secondary uppercase text-[10px]">Volume:</span> <span className="text-white">{tx.quantity || tx.volume || '-'}</span>
                            </div>
                            <div className="col-6">
                              <span className="text-secondary uppercase text-[10px]">P&L:</span> <span className={cn("fw-bold", (tx.pnl || tx.profit || 0) >= 0 ? "text-success" : "text-danger")}>
                                ${(tx.pnl || tx.profit || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="col-6">
                              <span className="text-secondary uppercase text-[10px]">Strategy ID:</span> <span className="text-white text-truncate">{tx.strategy?.id || tx.strategyId?.substring(0,8)}...</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : activeTab === 'logs' ? (
                  streamedLogs.length === 0 ? (
                    <div className="d-flex flex-column align-items-center justify-content-center text-center text-secondary gap-3 opacity-50 my-auto py-5 w-100">
                      <Activity className="animate-pulse h-8 w-8 text-primary" />
                      <p className="font-mono small text-uppercase">
                        No event logs found.<br/>
                        System logs and warnings will appear here in realtime.
                      </p>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2 w-100">
                      {streamedLogs.map((log, idx) => {
                        const isError = log.level === 'ERROR' || log.level === 'WARN' || log.message?.toLowerCase().includes('error') || log.message?.toLowerCase().includes('fail');
                        return (
                          <div key={idx} className={cn("border p-3 bg-secondary/5 font-mono small d-flex flex-column gap-2", isError ? "border-danger/50" : "border-secondary")}>
                            <div className="d-flex justify-content-between align-items-center">
                              <span className={cn("fw-bold text-uppercase", isError ? "text-danger" : "text-secondary")} style={{ fontSize: '10px' }}>
                                [{log.level || 'INFO'}]
                              </span>
                              <span className="text-secondary" style={{ fontSize: '10px' }}>
                                {log.time ? new Date(log.time).toLocaleTimeString() : new Date().toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-white break-all" style={{ fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {log.message}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  streamedStopouts.length === 0 ? (
                    <div className="d-flex flex-column align-items-center justify-content-center text-center text-secondary gap-3 opacity-50 my-auto py-5 w-100">
                      <Check className="h-8 w-8 text-success" />
                      <p className="font-mono small text-uppercase">
                        System Health is OK.<br/>
                        No active CopyFactory stopouts (equity/balance limits) detected.
                      </p>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-3 w-100">
                      <div className="alert alert-warning rounded-none font-mono small d-flex flex-column gap-2 mb-0 border-warning/50 bg-warning/5 text-warning" style={{ border: '1px solid var(--bs-warning-border-subtle)', backgroundColor: 'var(--bs-warning-bg-subtle)' }}>
                        <span className="fw-bold text-uppercase">Active Stopout Detected!</span>
                        <span>Copying has been temporarily suspended by CopyFactory because a stopout threshold was hit.</span>
                      </div>
                      <div className="d-flex flex-column gap-2">
                        {streamedStopouts.map((stopout, idx) => (
                          <div key={idx} className="border border-danger p-3 bg-secondary/5 font-mono small d-flex flex-column gap-2">
                            <div className="d-flex justify-content-between align-items-center">
                              <span className="fw-bold text-danger text-uppercase">{stopout.type || 'STOPOUT'} LIMIT HIT</span>
                              <span className="text-secondary" style={{ fontSize: '10px' }}>
                                {stopout.time ? new Date(stopout.time).toLocaleTimeString() : new Date().toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="row g-2">
                              {stopout.strategyId && (
                                <div className="col-12">
                                  <span className="text-secondary uppercase text-[10px]">Strategy ID:</span> <span className="text-white">{stopout.strategyId}</span>
                                </div>
                              )}
                              {stopout.value !== undefined && (
                                <div className="col-6">
                                  <span className="text-secondary uppercase text-[10px]">Value:</span> <span className="text-white">${stopout.value.toFixed(2)}</span>
                                </div>
                              )}
                              {stopout.limit !== undefined && (
                                <div className="col-6">
                                  <span className="text-secondary uppercase text-[10px]">Limit:</span> <span className="text-white">${stopout.limit.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="d-flex gap-2">
                        <Button 
                          type="button" 
                          variant="destructive" 
                          className="rounded-none font-mono text-uppercase w-100 py-3"
                          onClick={() => handleResetStopouts('equity')}
                          disabled={isResettingStopouts}
                        >
                          {isResettingStopouts ? "Resetting..." : "Reset Equity Stopouts"}
                        </Button>
                        <Button 
                          type="button" 
                          variant="destructive" 
                          className="rounded-none font-mono text-uppercase w-100 py-3"
                          onClick={() => handleResetStopouts('balance')}
                          disabled={isResettingStopouts}
                        >
                          {isResettingStopouts ? "Resetting..." : "Reset Balance Stopouts"}
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AppLayout>
  );
}
