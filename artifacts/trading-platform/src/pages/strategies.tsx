import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListStrategies, useCreateStrategy, StrategyInputType, Strategy } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function StrategiesPage() {
  const { data: strategies, isLoading } = useListStrategies({});
  const createStrategy = useCreateStrategy();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: StrategyInputType.vanilla_options,
    code: "def evaluate(ticks, indicators):\n    return 'wait'",
    parameters: "{}",
    isActive: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createStrategy.mutate({
      data: {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        code: formData.code,
        parameters: formData.parameters
      }
    }, {
      onSuccess: () => {
        toast({ title: "Strategy created" });
        setShowForm(false);
        queryClient.invalidateQueries({ queryKey: ["/api/strategies"] }); // Simplified since we don't have the exact helper imported here, standard format
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center shrink-0">
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Algorithmic Strategies</h1>
          <Button 
            className="rounded-none font-bold uppercase tracking-wider font-mono"
            onClick={() => setShowForm(!showForm)}
            data-testid="button-new-strategy"
          >
            {showForm ? "Cancel" : "New Strategy"}
          </Button>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          {/* List Panel */}
          <div className={`flex-1 border border-border bg-card overflow-auto ${showForm ? 'hidden md:block' : ''}`}>
            <table className="w-full text-sm font-mono text-left whitespace-nowrap">
              <thead className="bg-muted/30 sticky top-0 border-b border-border">
                <tr>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Name</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Type</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Win Rate</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground uppercase">Loading...</td></tr>
                ) : strategies?.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground uppercase">No strategies found</td></tr>
                ) : (
                  strategies?.map(s => (
                    <tr key={s.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-bold text-primary">{s.name}</td>
                      <td className="p-4 text-muted-foreground uppercase text-xs">{s.type}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 text-xs ${s.isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="p-4 text-foreground">{s.winRate ? `${s.winRate.toFixed(1)}%` : '---'}</td>
                      <td className="p-4 text-muted-foreground text-xs">{format(new Date(s.updatedAt), "yyyy-MM-dd")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Form Panel */}
          {showForm && (
            <div className="w-full md:w-[450px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">Strategy Configuration</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Name</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Description</Label>
                  <Input 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Target Market</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                    <SelectTrigger className="w-full h-10 rounded-none border-border bg-background font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value={StrategyInputType.vanilla_options} className="font-mono text-xs uppercase">Options</SelectItem>
                      <SelectItem value={StrategyInputType.forex} className="font-mono text-xs uppercase">Forex</SelectItem>
                      <SelectItem value={StrategyInputType.multiplier} className="font-mono text-xs uppercase">Multiplier</SelectItem>
                      <SelectItem value={StrategyInputType.universal} className="font-mono text-xs uppercase">Universal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Parameters (JSON)</Label>
                  <Textarea 
                    value={formData.parameters} 
                    onChange={e => setFormData({...formData, parameters: e.target.value})}
                    className="rounded-none font-mono border-border bg-background h-24 font-mono text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Logic (Python/Pseudo)</Label>
                  <Textarea 
                    required
                    value={formData.code} 
                    onChange={e => setFormData({...formData, code: e.target.value})}
                    className="rounded-none font-mono border-border bg-background h-40 font-mono text-xs text-primary"
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button type="submit" disabled={createStrategy.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {createStrategy.isPending ? "Deploying..." : "Deploy Strategy"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}