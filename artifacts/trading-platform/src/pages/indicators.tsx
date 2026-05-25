import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListIndicators,
  useCreateIndicator,
  useUpdateIndicator,
  useDeleteIndicator,
  useGetMe,
  type Indicator,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";

type Kind = "MA" | "RSI" | "MACD" | "STOCH" | "BB" | "CCI" | "ATR" | "CUSTOM";

const KINDS: { value: Kind; label: string; group: "Overlay" | "Oscillator" | "Custom" }[] = [
  { value: "MA", label: "Moving Average (SMA/EMA/WMA/TMA)", group: "Overlay" },
  { value: "BB", label: "Bollinger Bands", group: "Overlay" },
  { value: "RSI", label: "RSI — Relative Strength Index", group: "Oscillator" },
  { value: "MACD", label: "MACD", group: "Oscillator" },
  { value: "STOCH", label: "Stochastic Oscillator", group: "Oscillator" },
  { value: "CCI", label: "CCI — Commodity Channel Index", group: "Oscillator" },
  { value: "ATR", label: "ATR — Average True Range", group: "Oscillator" },
  { value: "CUSTOM", label: "Custom Indicator (paste formula)", group: "Custom" },
];

const GROUPS = ["Overlay", "Oscillator", "Custom"] as const;

type ParsedParams = Record<string, unknown>;

function parseParams(raw: string | null | undefined): ParsedParams {
  try {
    return JSON.parse(raw || "{}") as ParsedParams;
  } catch {
    return {};
  }
}

function paramSummary(parsed: ParsedParams, code: string): string {
  const t = (parsed.type as string) || code;
  switch (t) {
    case "MA":
      return `${parsed.subtype ?? "EMA"} · period ${parsed.period ?? "—"}`;
    case "BB":
      return `period ${parsed.period ?? "—"} · σ ${parsed.deviations ?? "—"}`;
    case "RSI":
      return `period ${parsed.period ?? "—"} · OB/OS ${parsed.overbought ?? 70}/${parsed.oversold ?? 30}`;
    case "MACD":
      return `${parsed.fast ?? 12}/${parsed.slow ?? 26}/${parsed.signal ?? 9}`;
    case "STOCH":
      return `%K ${parsed.kPeriod ?? "—"} · %D ${parsed.dPeriod ?? "—"}`;
    case "CCI":
    case "ATR":
      return `period ${parsed.period ?? "—"}`;
    case "CUSTOM":
      return String(parsed.code ?? "custom formula").slice(0, 40);
    default:
      return t;
  }
}

export default function IndicatorsPage() {
  const { data: me } = useGetMe();
  const { data: indicators, isLoading } = useListIndicators({});
  const createIndicator = useCreateIndicator();
  const updateIndicator = useUpdateIndicator();
  const deleteIndicator = useDeleteIndicator();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>("MA");
  const [isPublic, setIsPublic] = useState(true);

  const [color, setColor] = useState("#00ff88");
  const [thickness, setThickness] = useState("2");
  const [description, setDescription] = useState("");

  const [maSub, setMaSub] = useState<"SMA" | "EMA" | "WMA" | "TMA">("EMA");
  const [maPeriod, setMaPeriod] = useState("21");

  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [rsiOverbought, setRsiOverbought] = useState("70");
  const [rsiOversold, setRsiOversold] = useState("30");

  const [macdFast, setMacdFast] = useState("12");
  const [macdSlow, setMacdSlow] = useState("26");
  const [macdSignal, setMacdSignal] = useState("9");

  const [stochK, setStochK] = useState("14");
  const [stochD, setStochD] = useState("3");

  const [bbPeriod, setBbPeriod] = useState("20");
  const [bbDev, setBbDev] = useState("2");

  const [oscPeriod, setOscPeriod] = useState("20");
  const [customCode, setCustomCode] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/indicators"] });

  const resetFormFields = () => {
    setDescription("");
    setColor("#00ff88");
    setThickness("2");
    setIsPublic(true);
    setKind("MA");
    setMaSub("EMA");
    setMaPeriod("21");
    setRsiPeriod("14");
    setRsiOverbought("70");
    setRsiOversold("30");
    setMacdFast("12");
    setMacdSlow("26");
    setMacdSignal("9");
    setStochK("14");
    setStochD("3");
    setBbPeriod("20");
    setBbDev("2");
    setOscPeriod("20");
    setCustomCode("");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    resetFormFields();
  };

  const openCreate = () => {
    resetFormFields();
    setEditingId(null);
    setShowForm(true);
  };

  const loadIndicatorIntoForm = (ind: Indicator) => {
    const parsed = parseParams(ind.parameters);
    const type = ((parsed.type as string) || ind.code) as Kind;

    setDescription(ind.description ?? "");
    setColor(typeof parsed.color === "string" ? parsed.color : "#00ff88");
    setThickness(String(parsed.thickness ?? 2));
    setIsPublic(ind.isPublic);
    setKind(type);

    switch (type) {
      case "MA":
        setMaSub((parsed.subtype as typeof maSub) || "EMA");
        setMaPeriod(String(parsed.period ?? 21));
        break;
      case "BB":
        setBbPeriod(String(parsed.period ?? 20));
        setBbDev(String(parsed.deviations ?? 2));
        break;
      case "RSI":
        setRsiPeriod(String(parsed.period ?? 14));
        setRsiOverbought(String(parsed.overbought ?? 70));
        setRsiOversold(String(parsed.oversold ?? 30));
        break;
      case "MACD":
        setMacdFast(String(parsed.fast ?? 12));
        setMacdSlow(String(parsed.slow ?? 26));
        setMacdSignal(String(parsed.signal ?? 9));
        break;
      case "STOCH":
        setStochK(String(parsed.kPeriod ?? 14));
        setStochD(String(parsed.dPeriod ?? 3));
        break;
      case "CCI":
      case "ATR":
        setOscPeriod(String(parsed.period ?? 20));
        break;
      case "CUSTOM":
        setCustomCode(String(parsed.code ?? ""));
        break;
      default:
        break;
    }
  };

  const openEdit = (ind: Indicator) => {
    loadIndicatorIntoForm(ind);
    setEditingId(ind.id);
    setShowForm(true);
  };

  const buildPayload = () => {
    switch (kind) {
      case "MA":
        return {
          name: `${maSub}(${maPeriod})`,
          code: maSub,
          parameters: { type: "MA", subtype: maSub, period: parseInt(maPeriod), color, thickness: parseInt(thickness) },
        };
      case "BB":
        return {
          name: `BB(${bbPeriod},${bbDev})`,
          code: "BB",
          parameters: { type: "BB", period: parseInt(bbPeriod), deviations: parseFloat(bbDev), color, thickness: parseInt(thickness) },
        };
      case "RSI":
        return {
          name: `RSI(${rsiPeriod})`,
          code: "RSI",
          parameters: { type: "RSI", period: parseInt(rsiPeriod), overbought: parseInt(rsiOverbought), oversold: parseInt(rsiOversold), color, thickness: parseInt(thickness) },
        };
      case "MACD":
        return {
          name: `MACD(${macdFast},${macdSlow},${macdSignal})`,
          code: "MACD",
          parameters: { type: "MACD", fast: parseInt(macdFast), slow: parseInt(macdSlow), signal: parseInt(macdSignal), color, thickness: parseInt(thickness) },
        };
      case "STOCH":
        return {
          name: `Stoch(${stochK},${stochD})`,
          code: "STOCH",
          parameters: { type: "STOCH", kPeriod: parseInt(stochK), dPeriod: parseInt(stochD), color, thickness: parseInt(thickness) },
        };
      case "CCI":
        return {
          name: `CCI(${oscPeriod})`,
          code: "CCI",
          parameters: { type: "CCI", period: parseInt(oscPeriod), color, thickness: parseInt(thickness) },
        };
      case "ATR":
        return {
          name: `ATR(${oscPeriod})`,
          code: "ATR",
          parameters: { type: "ATR", period: parseInt(oscPeriod), color, thickness: parseInt(thickness) },
        };
      case "CUSTOM":
        return {
          name: `Custom(${(customCode || "expr").slice(0, 12)})`,
          code: "CUSTOM",
          parameters: { type: "CUSTOM", code: customCode, color, thickness: parseInt(thickness) },
        };
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = buildPayload();
    const body = {
      name: p.name,
      description: description || null,
      code: p.code,
      parameters: JSON.stringify(p.parameters),
      isPublic,
    };

    if (editingId === null) {
      createIndicator.mutate(
        { data: body },
        {
          onSuccess: () => {
            toast({ title: "Indicator created", description: `${p.name} is available on the chart.` });
            closeForm();
            invalidate();
          },
          onError: (err: unknown) => {
            toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to save" });
          },
        },
      );
    } else {
      updateIndicator.mutate(
        { id: editingId, data: body },
        {
          onSuccess: () => {
            toast({ title: "Indicator updated", description: p.name });
            closeForm();
            invalidate();
          },
          onError: (err: unknown) => {
            toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to update" });
          },
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteIndicator.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Indicator deleted" });
          setConfirmDeleteId(null);
          if (editingId === id) closeForm();
          invalidate();
        },
        onError: (err: unknown) => {
          toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to delete" });
        },
      },
    );
  };

  const isSaving = createIndicator.isPending || updateIndicator.isPending;
  const canManage = (ind: Indicator) => ind.userId === me?.id;
  const list = Array.isArray(indicators) ? indicators : [];
  const mine = list.filter((i) => canManage(i));
  const community = list.filter((i) => !canManage(i));

  const renderParamsForm = () => {
    switch (kind) {
      case "MA":
        return (
          <>
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">MA Type</Label>
              <Select value={maSub} onValueChange={(v: typeof maSub) => setMaSub(v)}>
                <SelectTrigger className="rounded-none font-mono border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="SMA">Simple (SMA)</SelectItem>
                  <SelectItem value="EMA">Exponential (EMA)</SelectItem>
                  <SelectItem value="WMA">Weighted (WMA)</SelectItem>
                  <SelectItem value="TMA">Triangular (TMA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
              <Input type="number" value={maPeriod} onChange={(e) => setMaPeriod(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
          </>
        );
      case "BB":
        return (
          <>
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
              <Input type="number" value={bbPeriod} onChange={(e) => setBbPeriod(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Std Deviations</Label>
              <Input type="number" step="0.1" value={bbDev} onChange={(e) => setBbDev(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
          </>
        );
      case "RSI":
        return (
          <>
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
              <Input type="number" value={rsiPeriod} onChange={(e) => setRsiPeriod(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
            <div className="row g-2">
              <div className="col-6 d-flex flex-column gap-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Overbought</Label>
                <Input type="number" value={rsiOverbought} onChange={(e) => setRsiOverbought(e.target.value)} className="rounded-none font-mono border-border" />
              </div>
              <div className="col-6 d-flex flex-column gap-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Oversold</Label>
                <Input type="number" value={rsiOversold} onChange={(e) => setRsiOversold(e.target.value)} className="rounded-none font-mono border-border" />
              </div>
            </div>
          </>
        );
      case "MACD":
        return (
          <div className="row g-2">
            <div className="col-4 d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Fast</Label>
              <Input type="number" value={macdFast} onChange={(e) => setMacdFast(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
            <div className="col-4 d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Slow</Label>
              <Input type="number" value={macdSlow} onChange={(e) => setMacdSlow(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
            <div className="col-4 d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Signal</Label>
              <Input type="number" value={macdSignal} onChange={(e) => setMacdSignal(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
          </div>
        );
      case "STOCH":
        return (
          <div className="row g-2">
            <div className="col-6 d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">%K Period</Label>
              <Input type="number" value={stochK} onChange={(e) => setStochK(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
            <div className="col-6 d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">%D Period</Label>
              <Input type="number" value={stochD} onChange={(e) => setStochD(e.target.value)} className="rounded-none font-mono border-border" />
            </div>
          </div>
        );
      case "CCI":
      case "ATR":
        return (
          <div className="d-flex flex-column gap-2">
            <Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
            <Input type="number" value={oscPeriod} onChange={(e) => setOscPeriod(e.target.value)} className="rounded-none font-mono border-border" />
          </div>
        );
      case "CUSTOM":
        return (
          <div className="d-flex flex-column gap-2">
            <Label className="text-xs uppercase font-mono text-muted-foreground">Formula / Code</Label>
            <Textarea
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder="e.g. (close - sma(close, 20)) / stddev(close, 20)"
              className="rounded-none font-mono text-xs border-border"
              rows={4}
            />
            <p className="font-mono text-muted-foreground mb-0" style={{ fontSize: "0.65rem" }}>
              Stored for reference; custom formulas are not yet computed on the chart.
            </p>
          </div>
        );
    }
  };

  const renderRow = (ind: Indicator, owned: boolean) => {
    const parsed = parseParams(ind.parameters);
    const accent = typeof parsed.color === "string" ? parsed.color : "#64748b";
    const typeLabel = (parsed.type as string) || ind.code;

    return (
      <tr key={ind.id} className="border-bottom border-border">
        <td className="p-3 align-middle">
          <span
            className="d-inline-block border border-border"
            style={{ width: 20, height: 20, backgroundColor: accent }}
            title={accent}
          />
        </td>
        <td className="p-3 align-middle">
          <div className="fw-bold font-mono text-primary text-truncate" style={{ maxWidth: 180 }}>
            {ind.name}
          </div>
          {!owned && (
            <Badge variant="outline" className="rounded-none font-mono text-uppercase mt-1" style={{ fontSize: "0.55rem" }}>
              Community
            </Badge>
          )}
        </td>
        <td className="p-3 align-middle">
          <Badge variant="secondary" className="rounded-none font-mono text-uppercase">
            {typeLabel}
          </Badge>
        </td>
        <td className="p-3 align-middle font-mono text-muted-foreground small d-none d-lg-table-cell">
          {paramSummary(parsed, ind.code)}
        </td>
        <td className="p-3 align-middle text-muted-foreground small d-none d-md-table-cell text-truncate" style={{ maxWidth: 200 }}>
          {ind.description || "—"}
        </td>
        <td className="p-3 align-middle font-mono text-muted-foreground small d-none d-xl-table-cell">
          {format(new Date(ind.updatedAt), "yyyy-MM-dd")}
        </td>
        <td className="p-3 align-middle text-end">
          {owned ? (
            <div className="d-inline-flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => openEdit(ind)}
                title="Edit indicator"
                data-testid={`button-edit-indicator-${ind.id}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirmDeleteId(ind.id)}
                title="Delete indicator"
                data-testid={`button-delete-indicator-${ind.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span className="font-mono text-muted-foreground text-uppercase" style={{ fontSize: "0.6rem" }}>
              Read-only
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <AppLayout>
      <div
        className="d-flex flex-column w-100 overflow-hidden p-4 gap-4 mx-auto"
        style={{ height: "calc(100vh - 3.5rem)", maxWidth: 1400 }}
      >
        <div className="d-flex justify-content-between align-items-center flex-shrink-0">
          <div>
            <h1 className="h4 fw-bold font-mono text-uppercase tracking-tight mb-1">Indicator Library</h1>
            <p className="small font-mono text-muted-foreground mb-0">
              Saved indicators render on the chart. Edit or delete your own; community indicators are read-only.
            </p>
          </div>
          <Button
            className="rounded-none fw-bold text-uppercase font-mono"
            onClick={() => (showForm ? closeForm() : openCreate())}
            data-testid="button-new-indicator"
          >
            {showForm ? "Cancel" : "Add Indicator"}
          </Button>
        </div>

        <div className="d-flex flex-1 gap-4 overflow-hidden" style={{ minHeight: 0 }}>
          <div className={`flex-1 border border-border bg-card overflow-auto ${showForm ? "d-none d-lg-block" : ""}`}>
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground font-mono text-uppercase">Loading...</div>
            ) : list.length === 0 ? (
              <div className="p-5 text-center text-muted-foreground font-mono">
                <p className="text-uppercase mb-2">No indicators yet</p>
                <p className="small mb-3">Create moving averages, oscillators, and more for the chart.</p>
                <Button className="rounded-none font-mono text-uppercase" onClick={openCreate}>
                  Add Indicator
                </Button>
              </div>
            ) : (
              <table className="w-100 small font-mono align-middle mb-0">
                <thead className="sticky-top border-bottom border-border bg-card">
                  <tr>
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase" style={{ width: 40 }} />
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase">Name</th>
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase">Type</th>
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase d-none d-lg-table-cell">Parameters</th>
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase d-none d-md-table-cell">Description</th>
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase d-none d-xl-table-cell">Updated</th>
                    <th className="p-3 fw-normal text-muted-foreground text-uppercase text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.length > 0 && (
                    <>
                      <tr className="bg-muted/10">
                        <td colSpan={7} className="p-2 ps-3 text-uppercase text-muted-foreground" style={{ fontSize: "0.65rem" }}>
                          Your indicators ({mine.length})
                        </td>
                      </tr>
                      {mine.map((ind) => renderRow(ind, true))}
                    </>
                  )}
                  {community.length > 0 && (
                    <>
                      <tr className="bg-muted/10">
                        <td colSpan={7} className="p-2 ps-3 text-uppercase text-muted-foreground" style={{ fontSize: "0.65rem" }}>
                          Community ({community.length})
                        </td>
                      </tr>
                      {community.map((ind) => renderRow(ind, false))}
                    </>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {showForm && (
            <div
              className="border border-border bg-card d-flex flex-column flex-shrink-0 overflow-hidden w-100"
              style={{ maxWidth: 420 }}
            >
              <div className="p-3 border-bottom border-border bg-muted/10 flex-shrink-0">
                <h2 className="small fw-bold font-mono text-uppercase text-primary mb-0">
                  {editingId === null ? "New Indicator" : `Edit #${editingId}`}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="p-4 overflow-y-auto d-flex flex-column gap-4 flex-1">
                <div className="d-flex flex-column gap-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Indicator Type</Label>
                  <Select value={kind} onValueChange={(v: Kind) => setKind(v)}>
                    <SelectTrigger className="rounded-none font-mono border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {GROUPS.map((g) => (
                        <div key={g}>
                          <div className="font-mono text-uppercase text-muted-foreground px-2 py-1 bg-muted/20" style={{ fontSize: "0.625rem" }}>
                            {g}
                          </div>
                          {KINDS.filter((k) => k.group === g).map((k) => (
                            <SelectItem key={k.value} value={k.value} className="font-mono small">
                              {k.label}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {renderParamsForm()}

                <div className="row g-2">
                  <div className="col-7 d-flex flex-column gap-2">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Color</Label>
                    <div className="d-flex gap-1">
                      <Input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="rounded-none p-1 border-border"
                        style={{ width: 44 }}
                      />
                      <Input value={color} onChange={(e) => setColor(e.target.value)} className="rounded-none font-mono border-border flex-1" />
                    </div>
                  </div>
                  <div className="col-5 d-flex flex-column gap-2">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Thickness</Label>
                    <Select value={thickness} onValueChange={setThickness}>
                      <SelectTrigger className="rounded-none font-mono border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="1">1px</SelectItem>
                        <SelectItem value="2">2px</SelectItem>
                        <SelectItem value="3">3px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="d-flex flex-column gap-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Description (optional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-none font-mono border-border" />
                </div>

                <div className="d-flex align-items-center justify-content-between border border-border p-3">
                  <div>
                    <Label className="text-xs uppercase font-mono text-muted-foreground mb-0">Share publicly</Label>
                    <p className="font-mono text-muted-foreground mb-0" style={{ fontSize: "0.65rem" }}>
                      Others can use but not edit
                    </p>
                  </div>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>

                <div className="pt-2 border-top border-border">
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="w-100 rounded-none fw-bold text-uppercase font-mono"
                  >
                    {isSaving ? "Saving..." : editingId === null ? "Create Indicator" : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent className="rounded-none border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-uppercase">Delete indicator?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono small">
              This removes the indicator from your library and the chart. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none font-mono text-uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none font-mono text-uppercase bg-danger"
              onClick={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
              disabled={deleteIndicator.isPending}
            >
              {deleteIndicator.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
