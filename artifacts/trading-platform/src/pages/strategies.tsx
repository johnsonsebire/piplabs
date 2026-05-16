import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListStrategies,
  useCreateStrategy,
  useUpdateStrategy,
  useDeleteStrategy,
  useTestStrategyWebhook,
  StrategyInputType,
  type Strategy,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, X, Pencil, Trash2, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Condition {
  id: string;
  indicatorA: string;
  operator: string;
  indicatorB: string;
}

type Direction = "buy" | "sell";

const DEFAULT_CONDITIONS: Condition[] = [
  { id: "1", indicatorA: "EMA(7)", operator: "crosses above", indicatorB: "EMA(3)" },
  { id: "2", indicatorA: "CCI", operator: ">", indicatorB: "0" },
];

export default function StrategiesPage() {
  const { data: strategies, isLoading } = useListStrategies({});
  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const deleteStrategy = useDeleteStrategy();
  const testWebhook = useTestStrategyWebhook();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<StrategyInputType>(StrategyInputType.vanilla_options);
  const [logicOp, setLogicOp] = useState<"AND" | "OR">("AND");
  const [direction, setDirection] = useState<Direction>("buy");
  const [exitDirection, setExitDirection] = useState<"opposite" | "manual" | "target">("opposite");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);

  // Seed example when opening fresh (not editing)
  useEffect(() => {
    if (showForm && editingId === null && conditions.length === 0 && !name) {
      setConditions(DEFAULT_CONDITIONS);
    }
  }, [showForm, editingId, conditions.length, name]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setType(StrategyInputType.vanilla_options);
    setLogicOp("AND");
    setDirection("buy");
    setExitDirection("opposite");
    setWebhookUrl("");
    setConditions([]);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (s: Strategy) => {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description ?? "");
    setType(s.type as StrategyInputType);
    setWebhookUrl(s.webhookUrl ?? "");
    try {
      const parsed = JSON.parse(s.code);
      setDirection((parsed.action ?? "buy") as Direction);
      setExitDirection((parsed.exit ?? "opposite") as any);
      setLogicOp((parsed.logic ?? "AND") as any);
      setConditions(
        Array.isArray(parsed.conditions) && parsed.conditions.length > 0
          ? parsed.conditions.map((c: any, i: number) => ({
              id: String(i + 1),
              indicatorA: c.indicatorA ?? "",
              operator: c.operator ?? "==",
              indicatorB: c.indicatorB ?? "",
            }))
          : [...DEFAULT_CONDITIONS],
      );
    } catch {
      setConditions([...DEFAULT_CONDITIONS]);
      setDirection("buy");
      setExitDirection("opposite");
      setLogicOp("AND");
    }
    setShowForm(true);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

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

    const payload = {
      action: direction,
      exit: exitDirection,
      logic: logicOp,
      conditions: conditions.map(({ indicatorA, operator, indicatorB }) => ({ indicatorA, operator, indicatorB }))
    };
    const body = {
      name,
      description,
      type,
      code: JSON.stringify(payload),
      parameters: "{}",
      webhookUrl: webhookUrl.trim() || null,
    };

    if (editingId === null) {
      createStrategy.mutate({ data: body }, {
        onSuccess: () => {
          toast({ title: "Strategy created" });
          closeForm();
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
      });
    } else {
      updateStrategy.mutate({ id: editingId, data: body }, {
        onSuccess: () => {
          toast({ title: "Strategy updated" });
          closeForm();
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteStrategy.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Strategy deleted" });
        setConfirmDeleteId(null);
        if (editingId === id) closeForm();
        queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
    });
  };

  const handleTestWebhook = () => {
    if (editingId === null) {
      toast({ variant: "destructive", title: "Save the strategy first to send a test signal" });
      return;
    }
    if (!webhookUrl.trim()) {
      toast({ variant: "destructive", title: "Add a webhook URL first" });
      return;
    }
    testWebhook.mutate({ id: editingId }, {
      onSuccess: (data: any) => {
        if (data?.ok) toast({ title: "Webhook delivered", description: `HTTP ${data.status}` });
        else toast({ variant: "destructive", title: "Webhook failed", description: data?.error ?? "Unknown error" });
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
    });
  };

  const IND_OPTIONS = ["EMA(3)", "EMA(7)", "EMA(14)", "SMA(20)", "RSI", "MACD", "CCI", "BB_UPPER", "BB_LOWER", "PRICE"];
  const OP_OPTIONS = ["crosses above", "crosses below", "is above", "is below", "==", ">", "<", ">=", "<="];

  const isSaving = createStrategy.isPending || updateStrategy.isPending;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center shrink-0">
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Algorithmic Strategies</h1>
          <Button
            className="rounded-none font-bold uppercase tracking-wider font-mono"
            onClick={() => (showForm ? closeForm() : openCreate())}
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
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground uppercase">Loading...</td></tr>
                ) : strategies?.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground uppercase">No strategies found</td></tr>
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
                      <td className="p-4 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            type="button" size="icon" variant="ghost"
                            className="h-8 w-8 rounded-none hover:bg-primary/20 hover:text-primary"
                            onClick={() => openEdit(s)}
                            data-testid={`button-edit-strategy-${s.id}`}
                            title="Edit / rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button" size="icon" variant="ghost"
                            className="h-8 w-8 rounded-none hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => setConfirmDeleteId(s.id)}
                            data-testid={`button-delete-strategy-${s.id}`}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Form Panel */}
          {showForm && (
            <div className="w-full md:w-[500px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0 flex items-center justify-between">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">
                  {editingId === null ? "Visual Strategy Builder" : `Edit Strategy #${editingId}`}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Name</Label>
                  <Input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="rounded-none font-mono border-border bg-background"
                    data-testid="input-strategy-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Description</Label>
                  <Input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
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

                <div className="space-y-2 pt-2">
                  <Label className="text-xs uppercase font-mono text-primary font-bold">Trade Direction</Label>
                  <p className="text-[10px] font-mono text-muted-foreground -mt-1">When the conditions below match, place this order:</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setDirection("buy")}
                      className={`h-12 border rounded-none font-mono text-sm uppercase tracking-wider transition-colors ${
                        direction === "buy"
                          ? "border-primary bg-primary/20 text-primary font-bold"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      ▲ BUY / CALL
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection("sell")}
                      className={`h-12 border rounded-none font-mono text-sm uppercase tracking-wider transition-colors ${
                        direction === "sell"
                          ? "border-destructive bg-destructive/20 text-destructive font-bold"
                          : "border-border bg-background text-muted-foreground hover:border-destructive/50"
                      }`}
                    >
                      ▼ SELL / PUT
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Exit Rule</Label>
                  <Select value={exitDirection} onValueChange={(v: any) => setExitDirection(v)}>
                    <SelectTrigger className="rounded-none h-10 font-mono text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="opposite" className="font-mono text-xs">Exit on opposite signal</SelectItem>
                      <SelectItem value="target" className="font-mono text-xs">Exit on target profit / contract expiry</SelectItem>
                      <SelectItem value="manual" className="font-mono text-xs">Manual close only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase font-mono text-primary font-bold">Entry Conditions</Label>
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
                          type="button" variant="ghost" size="icon"
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
                            list={`ind-${c.id}`}
                            className="rounded-none h-8 font-mono text-xs border-border"
                          />
                          <datalist id={`ind-${c.id}`}>{IND_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
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
                    type="button" variant="outline"
                    className="w-full rounded-none border-dashed border-border text-muted-foreground uppercase text-[10px] font-mono hover:text-primary hover:border-primary"
                    onClick={addCondition}
                  >
                    <Plus className="h-3 w-3 mr-2" /> Add Condition
                  </Button>
                </div>

                {/* Webhook section */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs uppercase font-mono text-primary font-bold">Signal Webhook (Optional)</Label>
                  <p className="text-[10px] font-mono text-muted-foreground -mt-1">
                    POST a JSON payload to this URL whenever this strategy triggers a signal.
                  </p>
                  <Input
                    type="url"
                    placeholder="https://example.com/hooks/derivterminal"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    className="rounded-none font-mono text-xs border-border bg-background"
                    data-testid="input-webhook-url"
                  />
                  <div className="text-[10px] font-mono text-muted-foreground bg-muted/20 p-2 border border-border">
                    Payload: {`{ strategy, symbol, direction, duration, analysis, time }`}
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={handleTestWebhook}
                    disabled={testWebhook.isPending || editingId === null || !webhookUrl.trim()}
                    className="w-full rounded-none uppercase text-[10px] font-mono"
                    data-testid="button-test-webhook"
                  >
                    <Send className="h-3 w-3 mr-2" />
                    {testWebhook.isPending ? "Sending..." : "Send Test Signal"}
                  </Button>
                  {editingId === null && (
                    <p className="text-[10px] font-mono text-muted-foreground italic">Save the strategy first to test the webhook.</p>
                  )}
                </div>

                <div className="pt-6 mt-auto border-t border-border flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeForm} className="rounded-none font-mono uppercase">Cancel</Button>
                  <Button type="submit" disabled={isSaving || conditions.length === 0} className="rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {isSaving ? "Saving..." : editingId === null ? "Deploy Strategy" : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase">Delete strategy?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              This will permanently delete the strategy and all its backtests. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none font-mono uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none font-mono uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
              disabled={deleteStrategy.isPending}
            >
              {deleteStrategy.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
