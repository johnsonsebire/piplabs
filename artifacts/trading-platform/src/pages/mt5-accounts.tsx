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
import { swalSuccess, swalError } from "@/lib/swal";
import { Loader2, Plus, Server, Activity } from "lucide-react";

export default function MT5AccountsPage() {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [type, setType] = useState("demo");
  const queryClient = useQueryClient();

  const { data: accounts, isLoading, isError, error } = useQuery({
    queryKey: ["mt5-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/mt5-accounts");
      if (!res.ok) throw new Error("Failed to fetch MT5 accounts");
      return res.json();
    }
  });

  const addAccountMutation = useMutation({
    mutationFn: async (accountData: any) => {
      const res = await fetch("/api/mt5-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountData)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      swalSuccess("Account Connected", "Your MT5 Account was connected successfully.");
      setIsAdding(false);
      setName("");
      setLogin("");
      setPassword("");
      setServer("");
      queryClient.invalidateQueries({ queryKey: ["mt5-accounts"] });
    },
    onError: (error: Error) => {
      let msg = error.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      swalError("Connection Failed", msg);
    }
  });

  const setProviderMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch(`/api/mt5-accounts/${accountId}/provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      swalSuccess("Provider Configured", "This account is now broadcasting trades as a CopyFactory Provider.");
      queryClient.invalidateQueries({ queryKey: ["mt5-accounts"] });
    },
    onError: (error: Error) => {
      let msg = error.message;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      swalError("Configuration Failed", msg);
    }
  });

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    addAccountMutation.mutate({ name, login, password, server, type });
  };

  return (
    <AppLayout>
      <div className="d-flex flex-column w-100 overflow-hidden p-4 gap-4 mx-auto">
        <div className="d-flex justify-content-between align-items-center flex-shrink-0 mt-4">
          <h1 className="h4 fw-bold font-mono text-uppercase tracking-tight">MT5 Accounts</h1>
          {!isAdding && (
            <Button
              className="rounded-none fw-bold text-uppercase letter-spacing-wider font-mono"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="me-2 h-4 w-4" /> Add Account
            </Button>
          )}
        </div>

        <div className="d-flex flex-grow-1 gap-4 overflow-hidden w-100">
          <div className="flex-grow-1 overflow-auto d-flex flex-column gap-4 pb-4 w-100">
            {isAdding && (
              <div className="border border-success p-4 d-flex flex-column gap-3" style={{ backgroundColor: 'var(--background)' }}>
                <div className="d-flex align-items-center justify-content-between border-bottom border-secondary pb-3">
                  <div>
                    <h2 className="small fw-bold font-mono text-uppercase m-0">Connect New MT5 Account</h2>
                    <p className="font-mono text-secondary mt-1" style={{ fontSize: '10px', margin: 0 }}>Enter your MetaTrader 5 credentials. Your password will be securely stored by MetaAPI.</p>
                  </div>
                </div>
                
                <form id="add-account-form" onSubmit={handleAddAccount} className="d-flex flex-column gap-3">
                  <div className="row g-3">
                    <div className="col-12 col-md-6 d-flex flex-column gap-2">
                      <Label className="small text-uppercase font-mono text-secondary">Account Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Demo Account" required className="rounded-none font-mono border-secondary" />
                    </div>
                    <div className="col-12 col-md-6 d-flex flex-column gap-2">
                      <Label className="small text-uppercase font-mono text-secondary">Account Type</Label>
                      <Select value={type} onValueChange={setType}>
                        <SelectTrigger className="border-secondary rounded-none font-mono small">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border-secondary">
                          <SelectItem value="demo" className="font-mono small text-uppercase">Demo</SelectItem>
                          <SelectItem value="live" className="font-mono small text-uppercase">Live</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-12 col-md-6 d-flex flex-column gap-2">
                      <Label className="small text-uppercase font-mono text-secondary">MT5 Login</Label>
                      <Input value={login} onChange={(e) => setLogin(e.target.value)} required className="rounded-none font-mono border-secondary" />
                    </div>
                    <div className="col-12 col-md-6 d-flex flex-column gap-2">
                      <Label className="small text-uppercase font-mono text-secondary">MT5 Password</Label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-none font-mono border-secondary" />
                    </div>
                    <div className="col-12 d-flex flex-column gap-2">
                      <Label className="small text-uppercase font-mono text-secondary">Broker Server Name</Label>
                      <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="e.g. MetaQuotes-Demo" required className="rounded-none font-mono border-secondary" />
                    </div>
                  </div>
                  
                  <div className="pt-3 mt-2 border-top border-secondary d-flex justify-content-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsAdding(false)} className="rounded-none font-mono text-uppercase">Cancel</Button>
                    <Button type="submit" disabled={addAccountMutation.isPending} className="rounded-none fw-bold text-uppercase font-mono letter-spacing-wider">
                      {addAccountMutation.isPending ? "Connecting..." : "Connect"}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {isLoading ? (
              <div className="p-4 text-center text-secondary text-uppercase font-mono">Loading accounts...</div>
            ) : isError ? (
              <div className="border border-danger p-4 text-center text-danger font-mono small">
                <strong>Error loading accounts:</strong> {error instanceof Error ? error.message : "Please check the server."}
              </div>
            ) : accounts?.length === 0 ? (
              <div className="border border-secondary p-5 d-flex flex-column align-items-center text-center">
                <Server className="text-secondary mb-3 opacity-50" style={{ width: 48, height: 48 }} />
                <h3 className="h6 font-mono text-uppercase mb-2">No accounts connected</h3>
                <p className="font-mono text-secondary small">You haven't connected any MT5 accounts yet. Connect an account to start executing trades via MetaAPI.</p>
                {!isAdding && (
                  <Button onClick={() => setIsAdding(true)} className="rounded-none fw-bold text-uppercase font-mono mt-3" variant="outline">
                    Connect MT5 Account
                  </Button>
                )}
              </div>
            ) : (
              <div className="row g-4 m-0 w-100">
                {accounts?.map((account: any) => (
                  <div className="col-12 col-xl-6" key={account.id}>
                    <div className="border border-secondary p-4 d-flex flex-column h-100 position-relative" style={{ backgroundColor: 'var(--background)' }}>
                      <div className="d-flex justify-content-between align-items-start mb-4">
                        <div className="pe-2 overflow-hidden flex-grow-1">
                          <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                            <span className="font-mono fw-bold text-uppercase text-truncate" title={account.name}>{account.name}</span>
                            <span className={`px-2 py-1 rounded-sm text-uppercase font-mono fw-bold ${account.type === 'live' ? 'bg-danger text-white' : 'bg-success text-white'}`} style={{ fontSize: '10px' }}>
                              {account.type}
                            </span>
                            {account.isProvider && (
                              <span className="px-2 py-1 rounded-sm text-uppercase font-mono fw-bold bg-primary text-white" style={{ fontSize: '10px' }}>
                                PROVIDER
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-secondary" style={{ fontSize: '12px' }}>{account.login}</div>
                        </div>
                        <Activity className={account.connectionStatus === 'connected' ? 'text-success flex-shrink-0' : 'text-secondary flex-shrink-0'} style={{ width: 18, height: 18, marginTop: '2px' }} />
                      </div>
                      
                      <div className="d-flex flex-column gap-3 mb-4 flex-grow-1">
                        <div className="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2">
                          <span className="font-mono text-secondary text-uppercase flex-shrink-0" style={{ fontSize: '11px' }}>Server</span>
                          <span className="font-mono text-truncate text-end ps-3" style={{ fontSize: '12px' }} title={account.server}>{account.server}</span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2">
                          <span className="font-mono text-secondary text-uppercase flex-shrink-0" style={{ fontSize: '11px' }}>State</span>
                          <span className="font-mono text-uppercase text-end" style={{ fontSize: '12px' }}>{account.state}</span>
                        </div>
                      </div>
                      
                      <div className="pt-3 mt-auto">
                        {!account.isProvider ? (
                          <Button 
                            variant="outline" 
                            className="w-100 rounded-none text-uppercase font-mono small border-primary text-primary hover:bg-primary hover:text-white fw-bold py-3"
                            onClick={() => setProviderMutation.mutate(account.id)}
                            disabled={setProviderMutation.isPending}
                          >
                            {setProviderMutation.isPending && setProviderMutation.variables === account.id ? "Configuring..." : "Set as Provider"}
                          </Button>
                        ) : (
                          <Button variant="ghost" disabled className="w-100 rounded-none text-uppercase font-mono small text-success fw-bold py-3">
                            Active Provider
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
