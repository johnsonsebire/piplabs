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
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-secondary">MA Type</Label>
              <Select value={maSub} onValueChange={(v: any) => setMaSub(v)}>
                <SelectTrigger className="rounded-none font-mono"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="SMA">Simple (SMA)</SelectItem>
                  <SelectItem value="EMA">Exponential (EMA)</SelectItem>
                  <SelectItem value="WMA">Weighted (WMA)</SelectItem>
                  <SelectItem value="TMA">Triangular (TMA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="d-flex flex-column gap-2">
              <Label className="text-xs uppercase font-mono text-secondary">Period</Label>
              <Input type="number" value={maPeriod} onChange={e => setMaPeriod(e.target.value)} className="rounded-none font-mono" />
            </div>
          </>
        );
      case "BB":
        return (
          <>
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Period</Label>
              <Input type="number" value={bbPeriod} onChange={e => setBbPeriod(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Std Deviations</Label>
              <Input type="number" step="0.1" value={bbDev} onChange={e => setBbDev(e.target.value)} className="rounded-none font-mono" /></div>
          </>
        );
      case "RSI":
        return (
          <>
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Period</Label>
              <Input type="number" value={rsiPeriod} onChange={e => setRsiPeriod(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="row g-2">
              <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Overbought</Label>
                <Input type="number" value={rsiOverbought} onChange={e => setRsiOverbought(e.target.value)} className="rounded-none font-mono" /></div>
              <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Oversold</Label>
                <Input type="number" value={rsiOversold} onChange={e => setRsiOversold(e.target.value)} className="rounded-none font-mono" /></div>
            </div>
          </>
        );
      case "MACD":
        return (
          <div className="row g-2">
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Fast</Label>
              <Input type="number" value={macdFast} onChange={e => setMacdFast(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Slow</Label>
              <Input type="number" value={macdSlow} onChange={e => setMacdSlow(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Signal</Label>
              <Input type="number" value={macdSignal} onChange={e => setMacdSignal(e.target.value)} className="rounded-none font-mono" /></div>
          </div>
        );
      case "STOCH":
        return (
          <div className="row g-2">
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">%K Period</Label>
              <Input type="number" value={stochK} onChange={e => setStochK(e.target.value)} className="rounded-none font-mono" /></div>
            <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">%D Period</Label>
              <Input type="number" value={stochD} onChange={e => setStochD(e.target.value)} className="rounded-none font-mono" /></div>
          </div>
        );
      case "CCI":
      case "ATR":
        return (
          <div className="d-flex flex-column gap-2"><Label className="text-xs uppercase font-mono text-secondary">Period</Label>
            <Input type="number" value={oscPeriod} onChange={e => setOscPeriod(e.target.value)} className="rounded-none font-mono" /></div>
        );
      case "CUSTOM":
        return (
          <div className="d-flex flex-column gap-2">
            <Label className="text-xs uppercase font-mono text-secondary">Formula / Code</Label>
            <Textarea
              value={customCode}
              onChange={e => setCustomCode(e.target.value)}
              placeholder="e.g. (close - sma(close, 20)) / stddev(close, 20)"
              className="rounded-none font-mono text-xs"
            />
            <p className=" font-mono text-secondary">Stored for reference; rendering of custom formulas is not yet computed on chart.</p>
          </div>
        );
    }
  };

  const groups = ["Overlay", "Oscillator", "Custom"] as const;

  return (
    <AppLayout>
      <div className="d-flex flex-column overflow-hidden p-4 gap-4 mx-auto" style={{ height: 'calc(100vh - 3.5rem)', maxWidth: '1200px' }}>
        <div className="d-flex justify-content-between align-items-center flex-shrink-0">
          <div>
            <h1 className="h4 fw-bold font-mono text-uppercase tracking-tight">Indicator Library</h1>
            <p className="small font-mono text-secondary mt-1">Saved indicators auto-render on the chart page.</p>
          </div>
          <Button className="fw-bold text-uppercase letter-spacing-wider font-mono" onClick={() => setShowForm(!showForm)} data-testid="button-new-indicator">
            {showForm ? "Cancel" : "Add Indicator"}
          </Button>
        </div>

        <div className="d-flex flex-1 gap-4" style={{ minHeight: 0 }}>
          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3 flex-1 overflow-y-auto align-content-start mb-0">
            {isLoading ? (
              <div className="col-12 p-4 text-center text-secondary font-mono text-uppercase">Loading...</div>
            ) : !Array.isArray(indicators) || indicators.length === 0 ? (
              <div className="col-12 p-4 text-center text-secondary font-mono text-uppercase">No indicators. Click Add Indicator to start.</div>
            ) : (
              indicators.map(ind => {
                let parsed: any = {};
                try { parsed = JSON.parse(ind.parameters || "{}"); } catch {}
                return (
                  <div key={ind.id} className="col">
                    <div className="card p-4 d-flex flex-column position-relative overflow-hidden0" style={{ minHeight: '12rem', transition: 'border-color 0.2s' }}>
                      <div className="position-absolute top-0 end-00 opacity-50" style={{ width: '0.5rem', backgroundColor: parsed.color || 'transparent' }} />
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <h3 className="fw-bold font-mono text-uppercase text-success text-truncate mb-0" style={{ fontSize: '1.1rem' }}>{ind.name}</h3>
                        <span className="font-mono text-uppercase text-secondary border px-2 py-1 badge" style={{ fontSize: '0.5625rem' }}>{parsed.type || ind.code}</span>
                      </div>
                      <p className="small font-mono text-secondary mb-3 flex-1" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ind.description || "No description."}</p>
                      <div className="mt-auto">
                        <p className="font-mono text-secondary text-uppercase mb-1" style={{ fontSize: '0.625rem' }}>Config</p>
                        <code className="font-mono px-2 py-1 d-block text-truncate border" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>{ind.parameters || "{}"}</code>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showForm && (
            <div className="border d-flex flex-column flex-shrink-0 overflow-hidden" style={{ width: '400px', backgroundColor: 'var(--bs-card-bg)' }}>
              <div className="p-3 border-bottom flex-shrink-0" style={{ backgroundColor: 'rgba(30,41,59,0.2)' }}>
                <h2 className="small fw-bold font-mono text-uppercase mb-0">Indicator Builder</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-4 overflow-y-auto d-flex flex-column gap-4">
                <div className="d-flex flex-column gap-2">
                  <Label className="text-uppercase font-mono text-secondary letter-spacing-wider" style={{ fontSize: '0.75rem' }}>Indicator Type</Label>
                  <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                    <SelectTrigger className="font-mono" style={{ fontSize: '0.8125rem' }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groups.map(g => (
                        <div key={g}>
                          <div className="font-mono text-uppercase text-secondary px-2 py-1" style={{ fontSize: '0.625rem', backgroundColor: 'rgba(30,41,59,0.3)' }}>{g}</div>
                          {KINDS.filter(k => k.group === g).map(k => (
                            <SelectItem key={k.value} value={k.value} className="font-mono small">{k.label}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {renderParamsForm()}

                <div className="row g-2">
                  <div className="d-flex flex-column gap-2">
                    <Label className="text-xs uppercase font-mono text-secondary">Color</Label>
                    <div className="d-flex gap-1">
                      <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="rounded-none p-1 cursor-pointer" />
                      <Input value={color} onChange={e => setColor(e.target.value)} className="rounded-none font-mono flex-1" />
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    <Label className="text-xs uppercase font-mono text-secondary">Thickness</Label>
                    <Select value={thickness} onValueChange={setThickness}>
                      <SelectTrigger className="rounded-none font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="1">1px</SelectItem>
                        <SelectItem value="2">2px</SelectItem>
                        <SelectItem value="3">3px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="d-flex flex-column gap-2">
                  <Label className="text-xs uppercase font-mono text-secondary">Description (Optional)</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} className="rounded-none font-mono" />
                </div>

                <div className="pt-3 border-top">
                  <Button type="submit" disabled={createIndicator.isPending} className="w-100 fw-bold text-uppercase font-mono tracking-wider">
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
