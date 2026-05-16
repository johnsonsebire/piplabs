import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListStrategies, useCreateStrategy, StrategyInputType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, X } from "lucide-react";

interface Condition {
  id: string;
  indicatorA: string;
  operator: string;
  indicatorB: string;
}

export default function StrategiesPage() {
  const { data: strategies, isLoading } = useListStrategies({});
  const createStrategy = useCreateStrategy();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<StrategyInputType>(StrategyInputType.vanilla_options);
  const [logicOp, setLogicOp] = useState<"AND" | "OR">("AND");
  
  const [conditions, setConditions] = useState<Condition[]>([]);

  // Pre-load example
  useEffect(() => {
    if (showForm && conditions.length === 0 && !name) {
      setConditions([
        { id: "1", indicatorA: "EMA(7)", operator: "crosses above", indicatorB: "EMA(3)" },
        { id: "2", indicatorA: "CCI", operator: ">", indicatorB: "0" }
      ]);
    }
  }, [showForm]);

  const addCondition = () => {
    setConditions([...conditions, { id: Math.random().toString(36).substring(7), indicatorA: "", operator: "==", indicatorB: "" }]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, field: keyof Condition, value: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct JSON payload
    const payload = {
      logic: logicOp,
      conditions: conditions.map(({ indicatorA, operator, indicatorB }) => ({ indicatorA, operator, indicatorB }))
    };

    createStrategy.mutate({
      data: {
        name,
        description,
        type,
        code: JSON.stringify(payload),
        parameters: "{}"
      }
    }, {
      onSuccess: () => {
        toast({ title: "Strategy created" });
        setShowForm(false);
        queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      }
    });
  };

  const IND_OPTIONS = ["EMA(3)", "EMA(7)", "EMA(14)", "SMA(20)", "RSI", "MACD", "CCI", "BB_UPPER", "BB_LOWER", "PRICE"];
  const OP_OPTIONS = ["crosses above", "crosses below", "is above", "is below", "==", ">", "<", ">=", "<="];

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
            <div className="w-full md:w-[500px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">Visual Strategy Builder</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Name</Label>
                  <Input 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Target Market</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
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

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase font-mono text-primary font-bold">Execution Conditions</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">ALL</span>
                      <Switch 
                        checked={logicOp === "OR"} 
                        onCheckedChange={c => setLogicOp(c ? "OR" : "AND")}
                        className="data-[state=checked]:bg-muted-foreground data-[state=unchecked]:bg-primary"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">ANY</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {conditions.map((c, i) => (
                      <div key={c.id} className="flex flex-col gap-2 p-3 border border-border bg-muted/10 relative group">
                        {i > 0 && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background px-2 text-[10px] font-mono text-muted-foreground font-bold border border-border">
                            {logicOp}
                          </div>
                        )}
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeCondition(c.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                          <Input 
                            value={c.indicatorA}
                            onChange={(e) => updateCondition(c.id, "indicatorA", e.target.value)}
                            placeholder="EMA(14) / RSI"
                            className="rounded-none h-8 font-mono text-xs border-border"
                          />
                          <Select value={c.operator} onValueChange={(v) => updateCondition(c.id, "operator", v)}>
                            <SelectTrigger className="w-[120px] h-8 rounded-none border-border bg-background font-mono text-[10px] uppercase">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none border-border">
                              {OP_OPTIONS.map(op => (
                                <SelectItem key={op} value={op} className="font-mono text-[10px] uppercase">{op}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input 
                            value={c.indicatorB}
                            onChange={(e) => updateCondition(c.id, "indicatorB", e.target.value)}
                            placeholder="Value / Ind"
                            className="rounded-none h-8 font-mono text-xs border-border"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full rounded-none border-dashed border-border text-muted-foreground uppercase text-[10px] font-mono hover:text-primary hover:border-primary"
                    onClick={addCondition}
                  >
                    <Plus className="h-3 w-3 mr-2" /> Add Condition
                  </Button>
                </div>

                <div className="pt-6 mt-auto border-t border-border flex justify-end">
                  <Button type="submit" disabled={createStrategy.isPending || conditions.length === 0} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
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
