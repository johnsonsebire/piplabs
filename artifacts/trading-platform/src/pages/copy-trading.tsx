import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Copy, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CopyTradingPage() {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscriberAccountId, setSubscriberAccountId] = useState("");
  const [providerAccountId, setProviderAccountId] = useState("");
  const [riskMultiplier, setRiskMultiplier] = useState("1.0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      toast({ title: "Success", description: "Successfully subscribed to strategy." });
      setIsSubscribing(false);
      queryClient.invalidateQueries({ queryKey: ["copy-trading-subscriptions"] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    subscribeMutation.mutate({ 
      subscriberAccountId, 
      providerAccountId, 
      riskMultiplier: parseFloat(riskMultiplier) 
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

        <div className="d-flex flex-1 gap-4 overflow-hidden">
          <div className="flex-1 overflow-auto d-flex flex-column gap-4 pb-4">
            {isSubscribing && (
              <div className="border border-success p-4 d-flex flex-column gap-3" style={{ backgroundColor: 'var(--background)' }}>
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
                        <Label className="small text-uppercase font-mono text-secondary">Provider Account ID</Label>
                        <Input 
                          value={providerAccountId} 
                          onChange={(e) => setProviderAccountId(e.target.value)} 
                          placeholder="e.g. metaapi_account_id_here" 
                          required 
                          className="rounded-none font-mono border-secondary"
                        />
                      </div>

                      <div className="col-12 col-md-6 d-flex flex-column gap-2">
                        <Label className="small text-uppercase font-mono text-secondary">Risk Multiplier</Label>
                        <Input 
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={riskMultiplier} 
                          onChange={(e) => setRiskMultiplier(e.target.value)} 
                          required 
                          className="rounded-none font-mono border-secondary"
                        />
                        <p className="font-mono text-secondary m-0" style={{ fontSize: '9px' }}>1.0 means copy trades with exact same lot size. 0.5 means half.</p>
                      </div>
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
              <div className="border border-secondary p-5 d-flex flex-column align-items-center text-center">
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
              <div className="row g-4 m-0 w-100">
                {subscriptions?.map((sub: any) => {
                  const myAccount = accounts?.find((a: any) => a.id === sub.subscriberAccountId);
                  return (
                    <div className="col-12 col-lg-6 p-0 pe-4 pb-4" key={sub.id}>
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
                            <span className="font-mono text-secondary text-uppercase flex-shrink-0" style={{ fontSize: '11px' }}>Risk Multiplier</span>
                            <span className="font-mono fw-bold text-end" style={{ fontSize: '12px' }}>{sub.riskMultiplier}x</span>
                          </div>
                        </div>
                        
                        <div className="pt-3 mt-auto">
                          <Button variant="outline" className="w-100 rounded-none text-uppercase font-mono small border-danger text-danger hover:bg-danger hover:text-white fw-bold py-3">
                            Pause Copying
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
    </AppLayout>
  );
}
