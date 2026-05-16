import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListIndicators, useCreateIndicator } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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

export default function IndicatorsPage() {
  const { data: indicators, isLoading } = useListIndicators({});
  const createIndicator = useCreateIndicator();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<Kind>("MA");

  // Shared
  const [color, setColor] = useState("#00ff88");
  const [thickness, setThickness] = useState("2");
  const [description, setDescription] = useState("");

  // MA
  const [maSub, setMaSub] = useState<"SMA" | "EMA" | "WMA" | "TMA">("EMA");
  const [maPeriod, setMaPeriod] = useState("21");

  // RSI
  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [rsiOverbought, setRsiOverbought] = useState("70");
  const [rsiOversold, setRsiOversold] = useState("30");

  // MACD
  const [macdFast, setMacdFast] = useState("12");
  const [macdSlow, setMacdSlow] = useState("26");
  const [macdSignal, setMacdSignal] = useState("9");

  // Stochastic
  const [stochK, setStochK] = useState("14");
  const [stochD, setStochD] = useState("3");

  // BB
  const [bbPeriod, setBbPeriod] = useState("20");
  const [bbDev, setBbDev] = useState("2");

  // CCI / ATR
  const [oscPeriod, setOscPeriod] = useState("20");

  // Custom
  const [customCode, setCustomCode] = useState("");

  const resetForm = () => {
    setDescription("");
    setColor("#00ff88");
    setThickness("2");
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
    createIndicator.mutate({
      data: {
        name: p.name,
        description,
        code: p.code,
        parameters: JSON.stringify(p.parameters),
        isPublic: true,
      },
    }, {
      onSuccess: () => {
        toast({ title: "INDICATOR SAVED", description: `${p.name} added to library. It will appear on the chart.` });
        setShowForm(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["/api/indicators"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      },
    });
  };

  const renderParamsForm = () => {
    switch (kind) {
      case "MA":
        return (
          <>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">MA Type</Label>
              <Select value={maSub} onValueChange={(v: any) => setMaSub(v)}>
                <SelectTrigger className="rounded-none h-10 font-mono"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="SMA">Simple (SMA)</SelectItem>
                  <SelectItem value="EMA">Exponential (EMA)</SelectItem>
                  <SelectItem value="WMA">Weighted (WMA)</SelectItem>
                  <SelectItem value="TMA">Triangular (TMA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
              <Input type="number" value={maPeriod} onChange={e => setMaPeriod(e.target.value)} className="rounded-none font-mono" />
            </div>
          </>
        );
      case "BB":
        return (
          <>
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
              <Input type="number" value={bbPeriod} onChange={e => setBbPeriod(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Std Deviations</Label>
              <Input type="number" step="0.1" value={bbDev} onChange={e => setBbDev(e.target.value)} className="rounded-none font-mono" /></div>
          </>
        );
      case "RSI":
        return (
          <>
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
              <Input type="number" value={rsiPeriod} onChange={e => setRsiPeriod(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Overbought</Label>
                <Input type="number" value={rsiOverbought} onChange={e => setRsiOverbought(e.target.value)} className="rounded-none font-mono" /></div>
              <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Oversold</Label>
                <Input type="number" value={rsiOversold} onChange={e => setRsiOversold(e.target.value)} className="rounded-none font-mono" /></div>
            </div>
          </>
        );
      case "MACD":
        return (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Fast</Label>
              <Input type="number" value={macdFast} onChange={e => setMacdFast(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Slow</Label>
              <Input type="number" value={macdSlow} onChange={e => setMacdSlow(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Signal</Label>
              <Input type="number" value={macdSignal} onChange={e => setMacdSignal(e.target.value)} className="rounded-none font-mono" /></div>
          </div>
        );
      case "STOCH":
        return (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">%K Period</Label>
              <Input type="number" value={stochK} onChange={e => setStochK(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">%D Period</Label>
              <Input type="number" value={stochD} onChange={e => setStochD(e.target.value)} className="rounded-none font-mono" /></div>
          </div>
        );
      case "CCI":
      case "ATR":
        return (
          <div className="space-y-2"><Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
            <Input type="number" value={oscPeriod} onChange={e => setOscPeriod(e.target.value)} className="rounded-none font-mono" /></div>
        );
      case "CUSTOM":
        return (
          <div className="space-y-2">
            <Label className="text-xs uppercase font-mono text-muted-foreground">Formula / Code</Label>
            <Textarea
              value={customCode}
              onChange={e => setCustomCode(e.target.value)}
              placeholder="e.g. (close - sma(close, 20)) / stddev(close, 20)"
              className="rounded-none font-mono text-xs h-24"
            />
            <p className="text-[10px] font-mono text-muted-foreground">Stored for reference; rendering of custom formulas is not yet computed on chart.</p>
          </div>
        );
    }
  };

  const groups = ["Overlay", "Oscillator", "Custom"] as const;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Indicator Library</h1>
            <p className="text-xs font-mono text-muted-foreground mt-1">Saved indicators auto-render on the chart page.</p>
          </div>
          <Button className="rounded-none font-bold uppercase tracking-wider font-mono" onClick={() => setShowForm(!showForm)} data-testid="button-new-indicator">
            {showForm ? "Cancel" : "Add Indicator"}
          </Button>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto content-start">
            {isLoading ? (
              <div className="col-span-full p-8 text-center text-muted-foreground font-mono uppercase">Loading...</div>
            ) : indicators?.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground font-mono uppercase">No indicators. Click Add Indicator to start.</div>
            ) : (
              indicators?.map(ind => {
                let parsed: any = {};
                try { parsed = JSON.parse(ind.parameters || "{}"); } catch {}
                return (
                  <div key={ind.id} className="border border-border bg-card p-5 flex flex-col h-48 hover:border-primary/50 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full opacity-50" style={{ backgroundColor: parsed.color || "transparent" }} />
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold font-mono uppercase text-primary text-lg truncate">{ind.name}</h3>
                      <span className="text-[9px] font-mono uppercase text-muted-foreground border border-border px-1.5 py-0.5">{parsed.type || ind.code}</span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mb-4 line-clamp-2 flex-1">{ind.description || "No description."}</p>
                    <div className="mt-auto">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Config</p>
                      <code className="text-[10px] text-foreground bg-muted/30 px-2 py-1 block truncate border border-border">{ind.parameters || "{}"}</code>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showForm && (
            <div className="w-full md:w-[400px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">Indicator Builder</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Indicator Type</Label>
                  <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                    <SelectTrigger className="rounded-none h-10 font-mono text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      {groups.map(g => (
                        <div key={g}>
                          <div className="text-[10px] font-mono uppercase text-muted-foreground px-2 py-1 bg-muted/30">{g}</div>
                          {KINDS.filter(k => k.group === g).map(k => (
                            <SelectItem key={k.value} value={k.value} className="font-mono text-xs">{k.label}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {renderParamsForm()}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Color</Label>
                    <div className="flex gap-1">
                      <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="rounded-none h-10 w-14 p-1 cursor-pointer" />
                      <Input value={color} onChange={e => setColor(e.target.value)} className="rounded-none font-mono flex-1" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-mono text-muted-foreground">Thickness</Label>
                    <Select value={thickness} onValueChange={setThickness}>
                      <SelectTrigger className="rounded-none h-10 font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="1">1px</SelectItem>
                        <SelectItem value="2">2px</SelectItem>
                        <SelectItem value="3">3px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Description (Optional)</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} className="rounded-none font-mono" />
                </div>

                <div className="pt-4 border-t border-border">
                  <Button type="submit" disabled={createIndicator.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {createIndicator.isPending ? "Saving..." : "Save Indicator"}
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
