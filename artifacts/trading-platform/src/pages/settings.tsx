import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetMe, useUpdateMe, useGetDerivStatus, useConnectDeriv, useDisconnectDeriv, UserProfileUpdatePreferredTradeMode } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const { data: user } = useGetMe();
  const { data: derivStatus } = useGetDerivStatus();
  
  const updateMe = useUpdateMe();
  const connectDeriv = useConnectDeriv();
  const disconnectDeriv = useDisconnectDeriv();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [preferredTradeMode, setPreferredTradeMode] = useState<UserProfileUpdatePreferredTradeMode>(UserProfileUpdatePreferredTradeMode.demo);

  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
    if (user?.preferredTradeMode) setPreferredTradeMode(user.preferredTradeMode as UserProfileUpdatePreferredTradeMode);
  }, [user]);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateMe.mutate({ 
      data: { 
        displayName,
        preferredTradeMode,
        openAiApiKey: openAiApiKey ? openAiApiKey : undefined
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        setOpenAiApiKey(""); // Clear it after saving
        queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      }
    });
  };

  const handleConnectDeriv = (e: React.FormEvent) => {
    e.preventDefault();
    connectDeriv.mutate({ data: { apiToken, accountId: accountId || null } }, {
      onSuccess: () => {
        toast({ title: "API Connected successfully" });
        setApiToken("");
        setAccountId("");
        queryClient.invalidateQueries({ queryKey: ["/api/deriv/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Connection failed", description: err?.message });
      }
    });
  };

  const handleDisconnectDeriv = () => {
    disconnectDeriv.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "API Disconnected" });
        queryClient.invalidateQueries({ queryKey: ["/api/deriv/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">System Configuration</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Manage connection keys and identity</p>
        </div>

        {/* Deriv Connection Section */}
        <section className="border border-border bg-card">
          <div className="p-4 border-b border-border bg-muted/10 flex justify-between items-center">
            <h2 className="text-sm font-bold font-mono uppercase text-primary">Deriv API Connection</h2>
            <div className={`px-2 py-1 text-[10px] font-mono uppercase ${derivStatus?.connected ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
              {derivStatus?.connected ? 'AUTHENTICATED' : 'DISCONNECTED'}
            </div>
          </div>
          
          <div className="p-6">
            {derivStatus?.connected ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1 border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Account ID</p>
                    <p className="font-mono font-bold">{derivStatus.accountId || '---'}</p>
                  </div>
                  <div className="space-y-1 border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Type</p>
                    <p className="font-mono font-bold">{derivStatus.loginId?.startsWith('VRTC') || derivStatus.loginId?.startsWith('VRT') ? 'DEMO' : 'REAL'}</p>
                  </div>
                  <div className="space-y-1 border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Currency</p>
                    <p className="font-mono font-bold">{derivStatus.currency || 'USD'}</p>
                  </div>
                  <div className="space-y-1 border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Balance</p>
                    <p className="font-mono font-bold text-primary">${derivStatus.balance?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleDisconnectDeriv}
                  disabled={disconnectDeriv.isPending}
                  className="rounded-none font-mono uppercase font-bold tracking-wider"
                >
                  {disconnectDeriv.isPending ? "Disconnecting..." : "Sever Connection"}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleConnectDeriv} className="space-y-5 max-w-lg">
                {/* Setup guide */}
                <div className="border border-primary/30 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs font-mono font-bold text-primary uppercase tracking-wider">Deriv API v2 — Setup Required</p>
                  <ol className="text-[11px] font-mono text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Go to <span className="text-foreground">developers.deriv.com</span> → Dashboard → Register a new <span className="text-primary font-bold">PAT-type</span> app → copy your <span className="text-foreground">App ID</span>.</li>
                    <li>In the same dashboard → API Tokens → create a token with <span className="text-primary font-bold">trade</span> + <span className="text-primary font-bold">account_manage</span> scopes → copy your <span className="text-foreground">PAT</span>.</li>
                    <li>Set <span className="text-primary font-mono">DERIV_APP_ID</span> as an environment variable in this project with your App ID value.</li>
                    <li>Paste your PAT below and click <span className="text-foreground">Establish Connection</span>.</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Personal Access Token (PAT)</Label>
                  <Input
                    type="password"
                    required
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    placeholder="pat_••••••••••••••••••••••••"
                    className="rounded-none font-mono border-border bg-background"
                  />
                  <p className="text-[10px] font-mono text-muted-foreground">Generated from your registered app at developers.deriv.com. Requires <code>trade</code> scope.</p>
                </div>

                <Button
                  type="submit"
                  disabled={connectDeriv.isPending}
                  className="w-full rounded-none font-mono uppercase font-bold tracking-wider mt-2"
                >
                  {connectDeriv.isPending ? "Authenticating..." : "Establish Connection"}
                </Button>
              </form>
            )}
          </div>
        </section>

        {/* User Profile Section */}
        <section className="border border-border bg-card">
          <div className="p-4 border-b border-border bg-muted/10">
            <h2 className="text-sm font-bold font-mono uppercase text-foreground">Operator Profile</h2>
          </div>
          
          <div className="p-6">
            <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-md">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">System Identifier (Email)</Label>
                <Input 
                  disabled 
                  value={user?.email || ""}
                  className="rounded-none font-mono border-border bg-muted/50 text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Display Name</Label>
                <Input 
                  value={displayName} 
                  onChange={e => setDisplayName(e.target.value)}
                  className="rounded-none font-mono border-border bg-background"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">OpenAI API Key</Label>
                <Input 
                  type="password"
                  value={openAiApiKey}
                  placeholder={user?.openAiApiKey ? "••••••••••••••••" : "sk-..."}
                  onChange={e => setOpenAiApiKey(e.target.value)}
                  className="rounded-none font-mono border-border bg-background"
                />
                <p className="text-[10px] font-mono text-muted-foreground">Provide an OpenAI API Key for AI trading analysis.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Default Trade Mode</Label>
                <Select value={preferredTradeMode} onValueChange={(val) => setPreferredTradeMode(val as UserProfileUpdatePreferredTradeMode)}>
                  <SelectTrigger className="w-full rounded-none border-border font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border">
                    <SelectItem value={UserProfileUpdatePreferredTradeMode.demo} className="font-mono text-xs uppercase">Demo Mode</SelectItem>
                    <SelectItem value={UserProfileUpdatePreferredTradeMode.live} className="font-mono text-xs uppercase">Live Mode</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Clearance Level</Label>
                <div className="font-mono text-sm uppercase px-3 py-2 bg-muted/30 border border-border inline-block">
                  {user?.role || 'UNKNOWN'}
                </div>
              </div>

              <Button 
                type="submit" 
                variant="outline"
                disabled={updateMe.isPending}
                className="w-full rounded-none font-mono uppercase font-bold tracking-wider mt-4 hover:bg-primary hover:text-primary-foreground border-primary text-primary"
              >
                {updateMe.isPending ? "Updating..." : "Update Identity"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
