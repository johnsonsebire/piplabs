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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

type Condition = { id: string; indicatorA: string; operator: string; indicatorB: string };
type ExitRule = "opposite" | "target" | "manual";
type LogicOp = "AND" | "OR";

type Leg = {
  enabled: boolean;
  logic: LogicOp;
  exit: ExitRule;
  conditions: Condition[];
};

const IND_OPTIONS = ["EMA(3)", "EMA(7)", "EMA(14)", "EMA(21)", "EMA(50)", "EMA(200)", "SMA(20)", "SMA(50)", "RSI", "MACD", "MACD_SIGNAL", "CCI", "BB_UPPER", "BB_LOWER", "BB_MIDDLE", "ATR", "STOCH_K", "STOCH_D", "PRICE", "HIGH", "LOW", "OPEN", "CLOSE", "VOLUME"];
const OP_OPTIONS = ["crosses above", "crosses below", "is above", "is below", "==", ">", "<", ">=", "<="];
// Common numeric thresholds traders compare indicators against.
const VALUE_OPTIONS = ["0", "20", "25", "30", "40", "50", "60", "70", "75", "80", "100"];
const CUSTOM_VALUE = "__custom__";

const newId = () => Math.random().toString(36).substring(2, 9);

const seedBuy = (): Leg => ({
  enabled: true,
  logic: "AND",
  exit: "opposite",
  conditions: [
    { id: newId(), indicatorA: "EMA(7)", operator: "crosses above", indicatorB: "EMA(14)" },
    { id: newId(), indicatorA: "CCI", operator: ">", indicatorB: "0" },
  ],
});

const seedSell = (): Leg => ({
  enabled: false,
  logic: "AND",
  exit: "opposite",
  conditions: [
    { id: newId(), indicatorA: "EMA(7)", operator: "crosses below", indicatorB: "EMA(14)" },
    { id: newId(), indicatorA: "CCI", operator: "<", indicatorB: "0" },
  ],
});

const emptyLeg = (enabled: boolean): Leg => ({ enabled, logic: "AND", exit: "opposite", conditions: [] });

// Parse stored strategy code into the v2 dual-leg shape, with full backward
// compatibility for v1 (single `action`/`conditions`/`exit`).
function parseStrategyCode(raw: string | null | undefined): { buy: Leg; sell: Leg } {
  if (!raw) return { buy: seedBuy(), sell: emptyLeg(false) };
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return { buy: seedBuy(), sell: emptyLeg(false) }; }

  const toLeg = (src: any, enabledDefault: boolean): Leg => {
    if (!src) return emptyLeg(enabledDefault);
    return {
      enabled: src.enabled !== false,
      logic: (src.logic === "OR" ? "OR" : "AND") as LogicOp,
      exit: (["opposite", "target", "manual"].includes(src.exit) ? src.exit : "opposite") as ExitRule,
      conditions: Array.isArray(src.conditions)
        ? src.conditions.map((c: any) => ({
            id: newId(),
            indicatorA: String(c.indicatorA ?? ""),
            operator: String(c.operator ?? "=="),
            indicatorB: String(c.indicatorB ?? ""),
          }))
        : [],
    };
  };

  // v2 shape
  if (parsed?.buy || parsed?.sell) {
    return {
      buy: parsed?.buy ? toLeg(parsed.buy, true) : emptyLeg(false),
      sell: parsed?.sell ? toLeg(parsed.sell, true) : emptyLeg(false),
    };
  }

  // v1 migration: single direction + conditions → put under the matching leg
  if (Array.isArray(parsed?.conditions)) {
    const dir = parsed.action === "sell" ? "sell" : "buy";
    const migrated = toLeg(parsed, true);
    return dir === "buy"
      ? { buy: migrated, sell: emptyLeg(false) }
      : { buy: emptyLeg(false), sell: migrated };
  }

  return { buy: seedBuy(), sell: emptyLeg(false) };
}

function serializeCode(buy: Leg, sell: Leg): string {
  const stripIds = (l: Leg) => ({
    enabled: l.enabled,
    logic: l.logic,
    exit: l.exit,
    conditions: l.conditions.map(({ indicatorA, operator, indicatorB }) => ({ indicatorA, operator, indicatorB })),
  });
  return JSON.stringify({ version: 2, buy: stripIds(buy), sell: stripIds(sell) });
}

interface IndicatorOrValuePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  showValues: boolean;
}

// Dropdown that lists indicators (and optionally common numeric thresholds)
// and falls back to a free-text input when the user picks "Custom value...".
function IndicatorOrValuePicker({ value, onChange, placeholder, showValues }: IndicatorOrValuePickerProps) {
  const isKnownIndicator = IND_OPTIONS.includes(value);
  const isKnownValue = showValues && VALUE_OPTIONS.includes(value);
  const isKnown = isKnownIndicator || isKnownValue;
  // If the current value is non-empty but not in any preset, treat as custom.
  const [customMode, setCustomMode] = useState<boolean>(!!value && !isKnown);

  if (customMode) {
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter value..."
          className="rounded-none h-8 font-mono text-xs border-border flex-1"
        />
        <Button
          type="button" size="icon" variant="ghost"
          className="h-8 w-8 rounded-none shrink-0"
          onClick={() => { onChange(""); setCustomMode(false); }}
          title="Back to dropdown"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => {
        if (v === CUSTOM_VALUE) { setCustomMode(true); onChange(""); return; }
        onChange(v);
      }}
    >
      <SelectTrigger className="rounded-none h-8 font-mono text-xs border-border bg-background">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-none border-border max-h-72">
        <div className="px-2 py-1 text-[9px] uppercase font-mono text-muted-foreground tracking-wider">Indicators</div>
        {IND_OPTIONS.map(o => (
          <SelectItem key={o} value={o} className="font-mono text-xs">{o}</SelectItem>
        ))}
        {showValues && (
          <>
            <div className="px-2 py-1 mt-1 text-[9px] uppercase font-mono text-muted-foreground tracking-wider border-t border-border">Common Values</div>
            {VALUE_OPTIONS.map(v => (
              <SelectItem key={v} value={v} className="font-mono text-xs">{v}</SelectItem>
            ))}
          </>
        )}
        <div className="border-t border-border mt-1">
          <SelectItem value={CUSTOM_VALUE} className="font-mono text-xs italic text-muted-foreground">Custom value…</SelectItem>
        </div>
      </SelectContent>
    </Select>
  );
}

interface LegEditorProps {
  side: "buy" | "sell";
  leg: Leg;
  onChange: (leg: Leg) => void;
}

function LegEditor({ side, leg, onChange }: LegEditorProps) {
  const tone = side === "buy" ? "primary" : "destructive";
  const label = side === "buy" ? "BUY / CALL" : "SELL / PUT";
  const symbol = side === "buy" ? "▲" : "▼";

  const updateCondition = (id: string, field: keyof Condition, value: string) => {
    onChange({ ...leg, conditions: leg.conditions.map(c => c.id === id ? { ...c, [field]: value } : c) });
  };
  const removeCondition = (id: string) => {
    onChange({ ...leg, conditions: leg.conditions.filter(c => c.id !== id) });
  };
  const addCondition = () => {
    onChange({ ...leg, conditions: [...leg.conditions, { id: newId(), indicatorA: "", operator: "==", indicatorB: "" }] });
  };

  return (
    <div className={`border ${leg.enabled ? `border-${tone}/40` : "border-border"} bg-card p-4 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-${tone} font-mono font-bold text-base`}>{symbol} {label}</span>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">leg</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[10px] font-mono text-muted-foreground uppercase">Enabled</Label>
          <Switch
            checked={leg.enabled}
            onCheckedChange={(c) => onChange({ ...leg, enabled: c })}
            data-testid={`switch-leg-enabled-${side}`}
          />
        </div>
      </div>

      <div className={leg.enabled ? "" : "opacity-50 pointer-events-none"}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase font-mono text-muted-foreground">Entry Conditions</Label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">ALL</span>
              <Switch
                checked={leg.logic === "OR"}
                onCheckedChange={c => onChange({ ...leg, logic: c ? "OR" : "AND" })}
                className="data-[state=checked]:bg-muted-foreground data-[state=unchecked]:bg-primary"
              />
              <span className="text-[10px] font-mono text-muted-foreground uppercase">ANY</span>
            </div>
          </div>

          <div className="space-y-3">
            {leg.conditions.length === 0 && (
              <p className="text-[10px] font-mono text-muted-foreground italic text-center py-2">
                No conditions yet — this leg will not fire.
              </p>
            )}
            {leg.conditions.map((c, i) => (
              <div key={c.id} className="flex flex-col gap-2 p-3 border border-border bg-muted/10 relative group">
                {i > 0 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background px-2 text-[10px] font-mono text-muted-foreground font-bold border border-border">
                    {leg.logic}
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
                  <IndicatorOrValuePicker
                    value={c.indicatorA}
                    onChange={(v) => updateCondition(c.id, "indicatorA", v)}
                    placeholder="Pick indicator"
                    showValues={false}
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
                  <IndicatorOrValuePicker
                    value={c.indicatorB}
                    onChange={(v) => updateCondition(c.id, "indicatorB", v)}
                    placeholder="Pick value / indicator"
                    showValues={true}
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

        <div className="space-y-2 pt-3">
          <Label className="text-[10px] uppercase font-mono text-muted-foreground">Exit Rule for this leg</Label>
          <Select value={leg.exit} onValueChange={(v: any) => onChange({ ...leg, exit: v })}>
            <SelectTrigger className="rounded-none h-9 font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="opposite" className="font-mono text-xs">Exit on opposite signal</SelectItem>
              <SelectItem value="target" className="font-mono text-xs">Exit on target profit / contract expiry</SelectItem>
              <SelectItem value="manual" className="font-mono text-xs">Manual close only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

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
  const [webhookUrl, setWebhookUrl] = useState("");
  const [buyLeg, setBuyLeg] = useState<Leg>(seedBuy());
  const [sellLeg, setSellLeg] = useState<Leg>(emptyLeg(false));
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");

  // Seed example when opening fresh (not editing) — keep behaviour from before
  useEffect(() => {
    if (showForm && editingId === null && !name) {
      setBuyLeg(seedBuy());
      setSellLeg(emptyLeg(false));
      setActiveTab("buy");
    }
  }, [showForm, editingId, name]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setType(StrategyInputType.vanilla_options);
    setWebhookUrl("");
    setBuyLeg(seedBuy());
    setSellLeg(emptyLeg(false));
    setActiveTab("buy");
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
    const { buy, sell } = parseStrategyCode(s.code);
    setBuyLeg(buy);
    setSellLeg(sell);
    setActiveTab(buy.enabled ? "buy" : sell.enabled ? "sell" : "buy");
    setShowForm(true);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const buyValid = buyLeg.enabled && buyLeg.conditions.length > 0;
    const sellValid = sellLeg.enabled && sellLeg.conditions.length > 0;
    if (!buyValid && !sellValid) {
      toast({ variant: "destructive", title: "Strategy needs at least one leg", description: "Enable BUY or SELL and add at least one condition." });
      return;
    }

    const body = {
      name,
      description,
      type,
      code: serializeCode(buyLeg, sellLeg),
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

  const isSaving = createStrategy.isPending || updateStrategy.isPending;

  // Summarise leg state for the row table
  const legSummary = (s: Strategy): string => {
    const { buy, sell } = parseStrategyCode(s.code);
    const parts: string[] = [];
    if (buy.enabled && buy.conditions.length > 0) parts.push(`BUY (${buy.conditions.length})`);
    if (sell.enabled && sell.conditions.length > 0) parts.push(`SELL (${sell.conditions.length})`);
    return parts.length > 0 ? parts.join(" + ") : "—";
  };

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
          <div className={`flex-1 border border-border bg-card overflow-auto ${showForm ? "hidden md:block" : ""}`}>
            <table className="w-full text-sm font-mono text-left whitespace-nowrap">
              <thead className="bg-muted/30 sticky top-0 border-b border-border">
                <tr>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Name</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Type</th>
                  <th className="p-4 font-normal text-muted-foreground uppercase tracking-wider text-xs">Legs</th>
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
                      <td className="p-4 text-foreground text-xs">{legSummary(s)}</td>
                      <td className="p-4 text-foreground">{s.winRate ? `${s.winRate.toFixed(1)}%` : "---"}</td>
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
            <div className="w-full md:w-[560px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
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

                {/* Dual-leg editor */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs uppercase font-mono text-primary font-bold">Trade Legs</Label>
                  <p className="text-[10px] font-mono text-muted-foreground -mt-1">
                    Configure when the strategy should BUY and/or SELL. Each leg has its own conditions and exit rule. Enable one or both.
                  </p>

                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "buy" | "sell")} className="w-full pt-2">
                    <TabsList className="grid w-full grid-cols-2 rounded-none h-9 p-0 bg-background border border-border">
                      <TabsTrigger
                        value="buy"
                        className="rounded-none text-[11px] uppercase font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                        data-testid="tab-buy-leg"
                      >
                        ▲ BUY / CALL {buyLeg.enabled && buyLeg.conditions.length > 0 ? `(${buyLeg.conditions.length})` : "(off)"}
                      </TabsTrigger>
                      <TabsTrigger
                        value="sell"
                        className="rounded-none text-[11px] uppercase font-mono data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground"
                        data-testid="tab-sell-leg"
                      >
                        ▼ SELL / PUT {sellLeg.enabled && sellLeg.conditions.length > 0 ? `(${sellLeg.conditions.length})` : "(off)"}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="buy" className="mt-3">
                      <LegEditor side="buy" leg={buyLeg} onChange={setBuyLeg} />
                    </TabsContent>
                    <TabsContent value="sell" className="mt-3">
                      <LegEditor side="sell" leg={sellLeg} onChange={setSellLeg} />
                    </TabsContent>
                  </Tabs>
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
                  <Button type="submit" disabled={isSaving} className="rounded-none font-bold uppercase font-mono tracking-wider h-10">
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
