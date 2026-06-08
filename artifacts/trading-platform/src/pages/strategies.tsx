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
import { swalSuccess, swalError, swalWarning, swalConfirm } from "@/lib/swal";
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
type TradingSession = "asian" | "london" | "newyork" | "overlap_london_ny";

type HTFConfig = {
  enabled: boolean;
  timeframe: number;
  marketFilters: Condition[];
  confirmations: Condition[];
};

export type RangingFilterConfig = {
  enabled: boolean;
  threshold: number;
  adx: { enabled: boolean; weight: number; period: number; value: number; };
  bb: { enabled: boolean; weight: number; period: number; percentile: number; };
  atr: { enabled: boolean; weight: number; period: number; smaPeriod: number; ratio: number; };
  rsi: { enabled: boolean; weight: number; period: number; min: number; max: number; };
};

type Leg = {
  enabled: boolean;
  logic: LogicOp;
  exit: ExitRule;
  marketFilters: Condition[];
  triggers: Condition[];
  confirmations: Condition[];
  minConfidence: number;
  useAIConfirmation: boolean;
  sessions: TradingSession[];
  htf: HTFConfig;
  rangingFilter?: RangingFilterConfig;
  
  // Legacy
  conditions: Condition[];
};

const IND_OPTIONS = ["EMA(3)", "EMA(7)", "EMA(14)", "EMA(21)", "EMA(50)", "EMA(200)", "SMA(20)", "SMA(50)", "RSI", "MACD", "MACD_SIGNAL", "CCI", "BB_UPPER", "BB_LOWER", "BB_MIDDLE", "ATR", "STOCH_K", "STOCH_D", "CURRENT PRICE", "HIGH", "LOW", "OPEN", "CLOSE", "VOLUME"];
const OP_OPTIONS = ["crosses above", "crosses below", "is above", "is below", "is rising", "is declining", "is positive and rising", "is negative and declining", "==", ">", "<", ">=", "<="];
// Common numeric thresholds traders compare indicators against.
const VALUE_OPTIONS = ["0", "20", "25", "30", "40", "50", "60", "70", "75", "80", "100"];
const CUSTOM_VALUE = "__custom__";

const defaultRangingFilter = (): RangingFilterConfig => ({
  enabled: false,
  threshold: 70,
  adx: { enabled: true, weight: 35, period: 14, value: 22 },
  bb: { enabled: true, weight: 25, period: 20, percentile: 25 },
  atr: { enabled: true, weight: 20, period: 14, smaPeriod: 50, ratio: 0.8 },
  rsi: { enabled: true, weight: 10, period: 14, min: 42, max: 58 },
});

const newId = () => Math.random().toString(36).substring(2, 9);

const seedBuy = (): Leg => ({
  enabled: true,
  logic: "AND",
  exit: "opposite",
  marketFilters: [],
  triggers: [
    { id: newId(), indicatorA: "EMA(7)", operator: "crosses above", indicatorB: "EMA(14)" },
  ],
  confirmations: [
    { id: newId(), indicatorA: "CCI", operator: ">", indicatorB: "0" },
  ],
  minConfidence: 100,
  useAIConfirmation: false,
  sessions: [],
  htf: { enabled: false, timeframe: 900, marketFilters: [], confirmations: [] },
  rangingFilter: defaultRangingFilter(),
  conditions: [],
});

const seedSell = (): Leg => ({
  enabled: false,
  logic: "AND",
  exit: "opposite",
  marketFilters: [],
  triggers: [
    { id: newId(), indicatorA: "EMA(7)", operator: "crosses below", indicatorB: "EMA(14)" },
  ],
  confirmations: [
    { id: newId(), indicatorA: "CCI", operator: "<", indicatorB: "0" },
  ],
  minConfidence: 100,
  useAIConfirmation: false,
  sessions: [],
  htf: { enabled: false, timeframe: 900, marketFilters: [], confirmations: [] },
  rangingFilter: defaultRangingFilter(),
  conditions: [],
});

const emptyLeg = (enabled: boolean): Leg => ({ enabled, logic: "AND", exit: "opposite", marketFilters: [], triggers: [], confirmations: [], conditions: [], minConfidence: 50, useAIConfirmation: false, sessions: [], htf: { enabled: false, timeframe: 900, marketFilters: [], confirmations: [] }, rangingFilter: defaultRangingFilter() });

// Parse stored strategy code into the v2 dual-leg shape, with full backward
// compatibility for v1 (single `action`/`conditions`/`exit`).
function parseStrategyCode(raw: string | null | undefined): { buy: Leg; sell: Leg; riskManagement?: any } {
 if (!raw) return { buy: seedBuy(), sell: emptyLeg(false) };
 let parsed: any;
 try { parsed = JSON.parse(raw); } catch { return { buy: seedBuy(), sell: emptyLeg(false) }; }

  const parseConds = (arr: any) => Array.isArray(arr) ? arr.map((c: any) => ({
    id: newId(),
    indicatorA: String(c.indicatorA ?? ""),
    operator: String(c.operator ?? "=="),
    indicatorB: String(c.indicatorB ?? ""),
  })) : [];

  const toLeg = (src: any, enabledDefault: boolean): Leg => {
    if (!src) return emptyLeg(enabledDefault);
    const logic = (src.logic === "OR" ? "OR" : "AND") as LogicOp;
    
    // Migration: if conditions exist but new fields don't, map them.
    let conditions = parseConds(src.conditions);
    let marketFilters = parseConds(src.marketFilters);
    let triggers = parseConds(src.triggers);
    let confirmations = parseConds(src.confirmations);
    
    if (conditions.length > 0 && marketFilters.length === 0 && triggers.length === 0 && confirmations.length === 0) {
      if (logic === "OR") triggers = conditions;
      else marketFilters = conditions;
      conditions = []; // Clear them out once migrated
    }

    let htf: HTFConfig = { enabled: false, timeframe: 900, marketFilters: [], confirmations: [] };
    if (src.htf) {
      htf = {
        enabled: !!src.htf.enabled,
        timeframe: typeof src.htf.timeframe === "number" ? src.htf.timeframe : 900,
        marketFilters: parseConds(src.htf.marketFilters),
        confirmations: parseConds(src.htf.confirmations),
      };
    }

    let rangingFilter: RangingFilterConfig | undefined = undefined;
    if (src.rangingFilter) {
      const rf = src.rangingFilter;
      rangingFilter = {
        enabled: rf.enabled === true || rf.enabled === "true",
        threshold: !isNaN(Number(rf.threshold)) ? Number(rf.threshold) : 70,
        adx: {
          enabled: rf.adx?.enabled !== false && rf.adx?.enabled !== "false",
          weight: !isNaN(Number(rf.adx?.weight)) ? Number(rf.adx.weight) : 35,
          period: !isNaN(Number(rf.adx?.period)) ? Number(rf.adx.period) : 14,
          value: !isNaN(Number(rf.adx?.value)) ? Number(rf.adx.value) : 22,
        },
        bb: {
          enabled: rf.bb?.enabled !== false,
          weight: typeof rf.bb?.weight === "number" ? rf.bb.weight : 25,
          period: typeof rf.bb?.period === "number" ? rf.bb.period : 20,
          percentile: typeof rf.bb?.percentile === "number" ? rf.bb.percentile : 25,
        },
        atr: {
          enabled: rf.atr?.enabled !== false,
          weight: typeof rf.atr?.weight === "number" ? rf.atr.weight : 20,
          period: typeof rf.atr?.period === "number" ? rf.atr.period : 14,
          smaPeriod: typeof rf.atr?.smaPeriod === "number" ? rf.atr.smaPeriod : 50,
          ratio: typeof rf.atr?.ratio === "number" ? rf.atr.ratio : 0.8,
        },
        rsi: {
          enabled: rf.rsi?.enabled !== false,
          weight: typeof rf.rsi?.weight === "number" ? rf.rsi.weight : 10,
          period: typeof rf.rsi?.period === "number" ? rf.rsi.period : 14,
          min: typeof rf.rsi?.min === "number" ? rf.rsi.min : 42,
          max: typeof rf.rsi?.max === "number" ? rf.rsi.max : 58,
        },
      };
    } else {
      rangingFilter = defaultRangingFilter();
    }

    return {
      enabled: src.enabled !== false,
      logic,
      exit: (["opposite", "target", "manual"].includes(src.exit) ? src.exit : "opposite") as ExitRule,
      conditions,
      marketFilters,
      triggers,
      confirmations,
      minConfidence: typeof src.minConfidence === "number" ? src.minConfidence : 50,
      useAIConfirmation: !!src.useAIConfirmation,
      sessions: Array.isArray(src.sessions) ? src.sessions : [],
      htf,
      rangingFilter,
    };
  };

 // v2 shape
 if (parsed?.buy || parsed?.sell) {
 return {
 buy: parsed?.buy ? toLeg(parsed.buy, true) : emptyLeg(false),
 sell: parsed?.sell ? toLeg(parsed.sell, true) : emptyLeg(false),
 riskManagement: parsed?.riskManagement,
 };
 }

 // v1 migration: single direction + conditions → put under the matching leg
 if (Array.isArray(parsed?.conditions)) {
 const action = typeof parsed.action === "string" ? parsed.action.toLowerCase() : "";
 const dir = action === "sell" ? "sell" : "buy";
 const migrated = toLeg(parsed, true);
 return dir === "buy"
 ? { buy: migrated, sell: emptyLeg(false), riskManagement: parsed?.riskManagement }
 : { buy: emptyLeg(false), sell: migrated, riskManagement: parsed?.riskManagement };
 }

 return { buy: seedBuy(), sell: emptyLeg(false), riskManagement: parsed?.riskManagement };
}

function serializeCode(buy: Leg, sell: Leg, riskManagement?: any): string {
  const stripConds = (conds: Condition[]) => conds.map(({ indicatorA, operator, indicatorB }) => ({ indicatorA, operator, indicatorB }));
  const stripIds = (l: Leg) => ({
    enabled: l.enabled,
    logic: l.logic,
    exit: l.exit,
    conditions: stripConds(l.conditions),
    marketFilters: stripConds(l.marketFilters),
    triggers: stripConds(l.triggers),
    confirmations: stripConds(l.confirmations),
    minConfidence: l.minConfidence,
    useAIConfirmation: l.useAIConfirmation,
    sessions: l.sessions,
    htf: {
      enabled: l.htf.enabled,
      timeframe: l.htf.timeframe,
      marketFilters: stripConds(l.htf.marketFilters),
      confirmations: stripConds(l.htf.confirmations),
    },
    rangingFilter: l.rangingFilter,
  });
  return JSON.stringify({ version: 2, buy: stripIds(buy), sell: stripIds(sell), riskManagement });
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
 <div className="d-flex gap-1">
 <Input
 autoFocus
 value={value}
 onChange={(e) => onChange(e.target.value)}
 placeholder="Enter value..."
 className="rounded-none font-mono small border-secondary flex-1"
 />
 <Button
 type="button" size="icon" variant="ghost"
 className=" flex-shrink-0"
 onClick={() => { onChange(""); setCustomMode(false); }}
 title="Back to dropdown"
 >
 <X />
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
 <SelectTrigger className="rounded-none font-mono small border-secondary ">
 <SelectValue placeholder={placeholder} />
 </SelectTrigger>
 <SelectContent className="rounded-none border-secondary" style={{ maxHeight: '18rem' }}>
 <div className="px-2 py-1 text-uppercase font-mono text-secondary letter-spacing-wider">Indicators</div>
 {IND_OPTIONS.map(o => (
 <SelectItem key={o} value={o} className="font-mono small">{o}</SelectItem>
 ))}
 {showValues && (
 <>
 <div className="px-2 py-1 mt-1 text-uppercase font-mono text-secondary letter-spacing-wider border-top border-secondary">Common Values</div>
 {VALUE_OPTIONS.map(v => (
 <SelectItem key={v} value={v} className="font-mono small">{v}</SelectItem>
 ))}
 </>
 )}
 <div className="border-top border-secondary mt-1">
 <SelectItem value={CUSTOM_VALUE} className="font-mono small fst-italic text-secondary">Custom value…</SelectItem>
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

const ConditionList = ({ title, desc, conditions, field, leg, onChange }: { title: string, desc: string, conditions: Condition[], field: 'marketFilters' | 'triggers' | 'confirmations', leg: Leg, onChange: (leg: Leg) => void }) => {
  const add = () => onChange({ ...leg, [field]: [...conditions, { id: newId(), indicatorA: "", operator: "==", indicatorB: "" }] });
  const remove = (id: string) => onChange({ ...leg, [field]: conditions.filter(c => c.id !== id) });
  const update = (id: string, prop: keyof Condition, val: string) => onChange({ ...leg, [field]: conditions.map(c => c.id === id ? { ...c, [prop]: val } : c) });

  return (
    <div className="d-flex flex-column gap-3 mb-2 p-3 border border-secondary/30" style={{ backgroundColor: 'var(--background)' }}>
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <Label className="text-uppercase font-mono text-secondary">{title}</Label>
          <p className="font-mono text-secondary mt-1" style={{ fontSize: '10px', margin: 0 }}>{desc}</p>
        </div>
      </div>
      
      <div className="d-flex flex-column gap-3">
        {conditions.length === 0 && (
          <p className="font-mono text-secondary fst-italic text-center py-2 m-0" style={{ fontSize: '11px' }}>No conditions added.</p>
        )}
        {conditions.map((c, i) => (
           <div key={c.id} className="d-flex flex-column gap-2 p-3 border border-secondary position-relative group">
             <div className="d-flex justify-content-between align-items-center w-100 mb-2">
               <div />
               <Button type="button" variant="ghost" size="icon" className="rounded-circle bg-danger" style={{ width: '28px', height: '28px' }} onClick={() => remove(c.id)}>
                 <X size={16} />
               </Button>
             </div>
             <div className="row g-2 gap-2 align-items-center">
               <IndicatorOrValuePicker value={c.indicatorA} onChange={(v) => update(c.id, "indicatorA", v)} placeholder="Pick indicator" showValues={false} />
               <Select value={c.operator} onValueChange={(v) => update(c.id, "operator", v)}>
                 <SelectTrigger className="border-secondary font-mono text-uppercase"><SelectValue /></SelectTrigger>
                 <SelectContent className="rounded-none border-secondary">
                   {OP_OPTIONS.map(op => <SelectItem key={op} value={op} className="font-mono text-uppercase">{op}</SelectItem>)}
                 </SelectContent>
               </Select>
               {!["is rising", "is declining"].includes(c.operator) && (
                 <IndicatorOrValuePicker value={c.indicatorB} onChange={(v) => update(c.id, "indicatorB", v)} placeholder="Pick value / indicator" showValues={true} />
               )}
             </div>
           </div>
        ))}
      </div>
      <Button type="button" variant="outline" className="w-100 border-dashed border-secondary text-secondary text-uppercase font-mono hover:border-success" onClick={add}>
        <Plus className="me-2" /> Add Condition
      </Button>
    </div>
  );
};

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
 <div className={`border ${leg.enabled ? `border-success` : "border-secondary"} p-4 d-flex flex-column gap-3`}>
 <div className="d-flex align-items-center justify-content-between">
 <div className="d-flex align-items-center gap-2">
 <span className={`font-mono fw-bold ${side === "buy" ? "text-success" : "text-danger"}`}>{symbol} {label}</span>
 <span className=" font-mono text-secondary text-uppercase">leg</span>
 </div>
 <div className="d-flex align-items-center gap-2">
 <Label className=" font-mono text-secondary text-uppercase">Enabled</Label>
 <Switch
 checked={leg.enabled}
 onCheckedChange={(c) => onChange({ ...leg, enabled: c })}
 data-testid={`switch-leg-enabled-${side}`}
 />
 </div>
 </div>

  <div className={leg.enabled ? "" : " d-none"}>
    <div className="d-flex flex-column gap-3">
      
      {/* 1. Market Filters */}
      <ConditionList 
        title="Market Regime Filters" 
        desc="Hard rules: ALL must be met. If any fail, trading halts." 
        conditions={leg.marketFilters} 
        field="marketFilters" 
        leg={leg} onChange={onChange} 
      />

      {/* 2. Triggers */}
      <ConditionList 
        title="Entry Triggers" 
        desc="Hard rules: AT LEAST ONE must be met." 
        conditions={leg.triggers} 
        field="triggers" 
        leg={leg} onChange={onChange} 
      />

      {/* 3. Confirmations */}
      <ConditionList 
        title="Confirmations" 
        desc="Soft rules: Each true condition adds to the Confidence Score." 
        conditions={leg.confirmations} 
        field="confirmations" 
        leg={leg} onChange={onChange} 
      />

      {/* Settings & Confidence */}
      <div className="d-flex flex-column gap-3 p-3 border border-secondary" style={{ backgroundColor: 'var(--background)' }}>
        <Label className="text-uppercase font-mono text-secondary">Settings & Confidence</Label>
        
        <div className="d-flex justify-content-between align-items-center gap-4">
          <div className="flex-grow-1">
            <Label className="font-mono" style={{ fontSize: '11px' }}>Minimum Confidence Score: {leg.minConfidence}%</Label>
            <input 
              type="range" className="w-100 mt-2" 
              min="0" max="100" step="5" 
              value={leg.minConfidence} 
              onChange={(e) => onChange({ ...leg, minConfidence: Number(e.target.value) })} 
            />
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 mt-2">
          <Switch checked={leg.useAIConfirmation} onCheckedChange={c => onChange({ ...leg, useAIConfirmation: c })} />
          <Label className="font-mono cursor-pointer" onClick={() => onChange({ ...leg, useAIConfirmation: !leg.useAIConfirmation })} style={{ fontSize: '11px' }}>
            Require AI Trade Validation (Auto-Trade Only)
          </Label>
        </div>

        <div className="d-flex flex-column gap-2 mt-2 border-top border-secondary pt-3">
          <Label className="font-mono text-secondary text-uppercase" style={{ fontSize: '10px' }}>Allowed Trading Sessions</Label>
          <div className="d-flex gap-3 flex-wrap">
            {["asian", "london", "newyork", "overlap_london_ny"].map(session => (
              <div key={session} className="d-flex align-items-center gap-1.5">
                <input 
                  type="checkbox" 
                  id={`${side}-${session}`} 
                  checked={leg.sessions.includes(session as any)} 
                  onChange={(e) => {
                    if (e.target.checked) onChange({ ...leg, sessions: [...leg.sessions, session as any] });
                    else onChange({ ...leg, sessions: leg.sessions.filter(s => s !== session) });
                  }} 
                />
                <Label htmlFor={`${side}-${session}`} className="font-mono text-uppercase cursor-pointer" style={{ fontSize: '10px' }}>
                  {session.replace(/_/g, " ")}
                </Label>
              </div>
            ))}
          </div>
          <p className="font-mono text-secondary m-0" style={{ fontSize: '9px' }}>If none selected, trades execute on all sessions.</p>
        </div>
      </div>

      {/* 4. Higher Timeframe (HTF) Confluence */}
      <div className="d-flex flex-column gap-3 p-3 border border-secondary" style={{ backgroundColor: 'var(--background)' }}>
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <Label className="text-uppercase font-mono text-secondary">Higher Timeframe (HTF) Confluence</Label>
            <p className="font-mono text-secondary mt-1" style={{ fontSize: '10px', margin: 0 }}>Require specific conditions on a higher timeframe before trading.</p>
          </div>
          <Switch checked={leg.htf?.enabled} onCheckedChange={(c) => onChange({ ...leg, htf: { ...(leg.htf || { timeframe: 900, marketFilters: [], confirmations: [] }), enabled: c } })} />
        </div>
        
        {leg.htf?.enabled && (
          <>
            <div className="d-flex flex-column gap-2 mt-2 pt-2 border-top border-secondary">
              <Label className="font-mono text-secondary text-uppercase" style={{ fontSize: '10px' }}>HTF Timeframe</Label>
              <Select value={leg.htf.timeframe.toString()} onValueChange={(v) => onChange({ ...leg, htf: { ...leg.htf, timeframe: parseInt(v, 10) } })}>
                <SelectTrigger className="border-secondary font-mono text-uppercase"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none border-secondary">
                  <SelectItem value="300" className="font-mono text-uppercase">5 Minutes (5m)</SelectItem>
                  <SelectItem value="900" className="font-mono text-uppercase">15 Minutes (15m)</SelectItem>
                  <SelectItem value="1800" className="font-mono text-uppercase">30 Minutes (30m)</SelectItem>
                  <SelectItem value="3600" className="font-mono text-uppercase">1 Hour (1h)</SelectItem>
                  <SelectItem value="14400" className="font-mono text-uppercase">4 Hours (4h)</SelectItem>
                  <SelectItem value="86400" className="font-mono text-uppercase">1 Day (1D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="mt-2">
              <ConditionList 
                title="HTF Market Filters" 
                desc="Hard rules: ALL HTF conditions must be met." 
                conditions={leg.htf.marketFilters || []} 
                field="marketFilters" 
                leg={{ ...leg, marketFilters: leg.htf.marketFilters || [] }} 
                onChange={(fakeLeg) => onChange({ ...leg, htf: { ...leg.htf, marketFilters: fakeLeg.marketFilters } })} 
              />
            </div>
            
            <div className="mt-2">
              <ConditionList 
                title="HTF Confirmations" 
                desc="Hard rules: ALL HTF Confirmations must be met." 
                conditions={leg.htf.confirmations || []} 
                field="confirmations" 
                leg={{ ...leg, confirmations: leg.htf.confirmations || [] }} 
                onChange={(fakeLeg) => onChange({ ...leg, htf: { ...leg.htf, confirmations: fakeLeg.confirmations } })} 
              />
            </div>
          </>
        )}
      </div>

      {/* 5. Ranging Market Filter */}
      <div className="d-flex flex-column gap-3 p-3 border border-secondary" style={{ backgroundColor: 'var(--background)' }}>
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <Label className="text-uppercase font-mono text-secondary">Ranging Market Filter (Anti-Chopper)</Label>
            <p className="font-mono text-secondary mt-1" style={{ fontSize: '10px', margin: 0 }}>Block trend-following entries during sideways, low-volatility markets.</p>
          </div>
          <Switch 
            checked={leg.rangingFilter?.enabled} 
            onCheckedChange={(c) => onChange({ ...leg, rangingFilter: { ...(leg.rangingFilter || defaultRangingFilter()), enabled: c } })} 
          />
        </div>

        {leg.rangingFilter?.enabled && (
          <>
            <div className="d-flex flex-column gap-3 mt-2 pt-2 border-top border-secondary">
              <div className="d-flex align-items-center justify-content-between">
                <Label className="font-mono text-uppercase" style={{ fontSize: '11px' }}>Total Activation Threshold</Label>
                <div className="d-flex align-items-center gap-2">
                  <Input 
                    type="number" className="w-24 border-secondary text-end font-mono" 
                    value={leg.rangingFilter.threshold} 
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, threshold: val } });
                    }} 
                  />
                </div>
              </div>
              <p className="font-mono text-secondary m-0" style={{ fontSize: '9px' }}>If the total score of enabled rules equals or exceeds this threshold, the market is ranging and trades are blocked.</p>
            </div>

            <div className="d-flex flex-column gap-2 mt-2">
              {/* ADX */}
              <div className="d-flex flex-column gap-2 p-2 border border-secondary">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <Switch checked={leg.rangingFilter.adx.enabled} onCheckedChange={(c) => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, adx: { ...leg.rangingFilter!.adx, enabled: c } } })} />
                    <Label className="font-mono text-uppercase" style={{ fontSize: '10px' }}>ADX (Trend Strength)</Label>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Weight</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.adx.weight} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, adx: { ...leg.rangingFilter!.adx, weight: parseInt(e.target.value, 10) || 0 } } })} />
                  </div>
                </div>
                {leg.rangingFilter.adx.enabled && (
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Rule: ADX</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.adx.period} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, adx: { ...leg.rangingFilter!.adx, period: parseInt(e.target.value, 10) || 14 } } })} />
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>&lt;</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.adx.value} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, adx: { ...leg.rangingFilter!.adx, value: parseInt(e.target.value, 10) || 22 } } })} />
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>and not rising</Label>
                  </div>
                )}
              </div>

              {/* BB */}
              <div className="d-flex flex-column gap-2 p-2 border border-secondary">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <Switch checked={leg.rangingFilter.bb.enabled} onCheckedChange={(c) => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, bb: { ...leg.rangingFilter!.bb, enabled: c } } })} />
                    <Label className="font-mono text-uppercase" style={{ fontSize: '10px' }}>Bollinger Bands (Contraction)</Label>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Weight</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.bb.weight} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, bb: { ...leg.rangingFilter!.bb, weight: parseInt(e.target.value, 10) || 0 } } })} />
                  </div>
                </div>
                {leg.rangingFilter.bb.enabled && (
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Rule: BB Width Percentile (50 bars) &lt;</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.bb.percentile} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, bb: { ...leg.rangingFilter!.bb, percentile: parseInt(e.target.value, 10) || 25 } } })} />
                  </div>
                )}
              </div>

              {/* ATR */}
              <div className="d-flex flex-column gap-2 p-2 border border-secondary">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <Switch checked={leg.rangingFilter.atr.enabled} onCheckedChange={(c) => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, atr: { ...leg.rangingFilter!.atr, enabled: c } } })} />
                    <Label className="font-mono text-uppercase" style={{ fontSize: '10px' }}>ATR (Relative Volatility)</Label>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Weight</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.atr.weight} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, atr: { ...leg.rangingFilter!.atr, weight: parseInt(e.target.value, 10) || 0 } } })} />
                  </div>
                </div>
                {leg.rangingFilter.atr.enabled && (
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Rule: ATR</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.atr.period} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, atr: { ...leg.rangingFilter!.atr, period: parseInt(e.target.value, 10) || 14 } } })} />
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>/ SMA(ATR, </Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.atr.smaPeriod} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, atr: { ...leg.rangingFilter!.atr, smaPeriod: parseInt(e.target.value, 10) || 50 } } })} />
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>) &lt;</Label>
                    <Input type="number" step="0.1" className="w-20 h-7 text-end font-mono" value={leg.rangingFilter.atr.ratio} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, atr: { ...leg.rangingFilter!.atr, ratio: parseFloat(e.target.value) || 0.8 } } })} />
                  </div>
                )}
              </div>

              {/* RSI */}
              <div className="d-flex flex-column gap-2 p-2 border border-secondary">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <Switch checked={leg.rangingFilter.rsi.enabled} onCheckedChange={(c) => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, rsi: { ...leg.rangingFilter!.rsi, enabled: c } } })} />
                    <Label className="font-mono text-uppercase" style={{ fontSize: '10px' }}>RSI (Momentum Neutrality)</Label>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Weight</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.rsi.weight} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, rsi: { ...leg.rangingFilter!.rsi, weight: parseInt(e.target.value, 10) || 0 } } })} />
                  </div>
                </div>
                {leg.rangingFilter.rsi.enabled && (
                  <div className="d-flex align-items-center gap-2">
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>Rule: RSI</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.rsi.period} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, rsi: { ...leg.rangingFilter!.rsi, period: parseInt(e.target.value, 10) || 14 } } })} />
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>is between</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.rsi.min} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, rsi: { ...leg.rangingFilter!.rsi, min: parseInt(e.target.value, 10) || 42 } } })} />
                    <Label className="font-mono text-secondary" style={{ fontSize: '9px' }}>and</Label>
                    <Input type="number" className="w-16 h-7 text-end font-mono" value={leg.rangingFilter.rsi.max} onChange={e => onChange({ ...leg, rangingFilter: { ...leg.rangingFilter!, rsi: { ...leg.rangingFilter!.rsi, max: parseInt(e.target.value, 10) || 58 } } })} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="d-flex flex-column gap-2 pt-3">
        <Label className=" text-uppercase font-mono text-secondary">Exit Rule for this leg</Label>
        <Select value={leg.exit} onValueChange={(v: any) => onChange({ ...leg, exit: v })}>
          <SelectTrigger className="rounded-none font-mono small border-secondary"><SelectValue /></SelectTrigger>
          <SelectContent className="rounded-none border-secondary">
            <SelectItem value="opposite" className="font-mono small">Exit on opposite signal</SelectItem>
            <SelectItem value="target" className="font-mono small">Exit on target profit / contract expiry</SelectItem>
            <SelectItem value="manual" className="font-mono small">Manual close only</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
 const queryClient = useQueryClient();

 const [showForm, setShowForm] = useState(false);
 const [editingId, setEditingId] = useState<number | null>(null);

 const [name, setName] = useState("");
 const [description, setDescription] = useState("");
 const [type, setType] = useState<StrategyInputType>(StrategyInputType.vanilla_options);
 const [webhookUrl, setWebhookUrl] = useState("");
 const [buyLeg, setBuyLeg] = useState<Leg>(seedBuy());
 const [sellLeg, setSellLeg] = useState<Leg>(emptyLeg(false));
 const [activeTab, setActiveTab] = useState<"buy" | "sell" | "risk">("buy");

 const [winCooldown, setWinCooldown] = useState<number | "">("");
 const [winConsecutive, setWinConsecutive] = useState<number | "">("");
 const [lossCooldown, setLossCooldown] = useState<number | "">("");
 const [lossConsecutive, setLossConsecutive] = useState<number | "">("");

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
 setWinCooldown("");
 setWinConsecutive("");
 setLossCooldown("");
 setLossConsecutive("");
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
 const { buy, sell, riskManagement } = parseStrategyCode(s.code);
 setBuyLeg(buy);
 setSellLeg(sell);
 setActiveTab(buy.enabled ? "buy" : sell.enabled ? "sell" : "buy");
 setWinCooldown(riskManagement?.winCooldown?.duration || "");
 setWinConsecutive(riskManagement?.winCooldown?.consecutive || "");
 setLossCooldown(riskManagement?.lossCooldown?.duration || "");
 setLossConsecutive(riskManagement?.lossCooldown?.consecutive || "");
 setShowForm(true);
 };

 const closeForm = () => {
 resetForm();
 setShowForm(false);
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();

 const hasRules = (l: Leg) => l.conditions.length > 0 || l.marketFilters.length > 0 || l.triggers.length > 0 || l.confirmations.length > 0;
 const buyValid = buyLeg.enabled && hasRules(buyLeg);
 const sellValid = sellLeg.enabled && hasRules(sellLeg);
 if (!buyValid && !sellValid) {
 swalWarning("Strategy needs at least one rule", "Enable BUY or SELL and add at least one condition, filter, trigger, or confirmation.");
 return;
 }

 const body = {
 name,
 description,
 type,
 code: serializeCode(buyLeg, sellLeg, {
   winCooldown: winCooldown && winConsecutive ? { duration: Number(winCooldown), consecutive: Number(winConsecutive) } : undefined,
   lossCooldown: lossCooldown && lossConsecutive ? { duration: Number(lossCooldown), consecutive: Number(lossConsecutive) } : undefined,
 }),
 parameters: "{}",
 webhookUrl: webhookUrl.trim() || null,
 };

 if (editingId === null) {
 createStrategy.mutate({ data: body }, {
 onSuccess: () => {
 swalSuccess("Strategy created!", `"${name}" is ready to use.`);
 closeForm();
 queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
 },
 onError: (err: any) => swalError("Error creating strategy", err?.message),
 });
 } else {
 updateStrategy.mutate({ id: editingId, data: body }, {
 onSuccess: () => {
 swalSuccess("Strategy updated!", `"${name}" has been saved.`);
 closeForm();
 queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
 },
 onError: (err: any) => swalError("Error updating strategy", err?.message),
 });
 }
 };

 const handleDeleteClick = async (id: number) => {
   const confirmed = await swalConfirm(
     "Delete strategy?",
     "This will permanently delete the strategy and all its backtests. This cannot be undone.",
     "Yes, delete it"
   );
   if (!confirmed) return;

   deleteStrategy.mutate({ id }, {
     onSuccess: () => {
       if (editingId === id) closeForm();
       queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
       swalSuccess("Strategy deleted", "The strategy has been permanently removed.");
     },
     onError: (err: any) => {
       swalError("Error deleting strategy", err?.message);
     },
   });
 };

 const handleTestWebhook = () => {
 if (editingId === null) {
 swalWarning("Save the strategy first", "Save the strategy before sending a test signal.");
 return;
 }
 if (!webhookUrl.trim()) {
 swalWarning("No webhook URL", "Add a webhook URL first.");
 return;
 }
 testWebhook.mutate({ id: editingId }, {
 onSuccess: (data: any) => {
 if (data?.ok) swalSuccess("Webhook delivered", `HTTP ${data.status}`);
 else swalError("Webhook failed", data?.error ?? "Unknown error");
 },
 onError: (err: any) => swalError("Webhook error", err?.message),
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
 <div className="d-flex flex-column w-100 overflow-hidden p-4 gap-4 mx-auto">
 <div className="d-flex justify-content-between align-items-center flex-shrink-0 mt-4">
 <h1 className="h4 fw-bold font-mono text-uppercase tracking-tight ">Algorithmic Strategies</h1>
 <Button
 className="rounded-none fw-bold text-uppercase letter-spacing-wider font-mono"
 onClick={() => (showForm ? closeForm() : openCreate())}
 data-testid="button-new-strategy"
 >
 {showForm ? "Cancel" : "New Strategy"}
 </Button>
 </div>

 <div className="d-flex flex-1 gap-4">
 {/* List Panel */}
 <div className={`flex-1 border border-secondary overflow-auto ${showForm ? "d-none d-md-block" : ""}`}>
 <table className="w-100 small font-mono text-start text-nowrap">
 <thead className=" sticky-top border-bottom border-secondary">
 <tr>
  <th className="p-4 font-normal text-secondary text-uppercase letter-spacing-wider small">Name</th>
  <th className="p-4 font-normal text-secondary text-uppercase letter-spacing-wider small">Type</th>
  <th className="p-4 font-normal text-secondary text-uppercase letter-spacing-wider small">Legs</th>
  <th className="p-4 font-normal text-secondary text-uppercase letter-spacing-wider small">Win Rate</th>
  <th className="p-4 font-normal text-secondary text-uppercase letter-spacing-wider small">Updated</th>
  <th className="p-4 font-normal text-secondary text-uppercase letter-spacing-wider small text-end">Actions</th>
 </tr>
 </thead>
 <tbody >
 {isLoading ? (
  <tr><td colSpan={6} className="p-4 text-center text-secondary text-uppercase">Loading...</td></tr>
 ) : !Array.isArray(strategies) || strategies.length === 0 ? (
  <tr><td colSpan={6} className="p-4 text-center text-secondary text-uppercase">No strategies found</td></tr>
 ) : (
  strategies.map(s => (
  <tr key={s.id} >
  <td className="p-4 fw-bold text-success">{s.name}</td>
  <td className="p-4 text-secondary text-uppercase small">{s.type}</td>
  <td className="p-4 small">{legSummary(s)}</td>
  <td className="p-4 ">{s.winRate ? `${s.winRate.toFixed(1)}%` : "---"}</td>
  <td className="p-4 text-secondary small">{format(new Date(s.updatedAt), "yyyy-MM-dd")}</td>
  <td className="p-4 text-end">
  <div className="d-inline-flex gap-1">
  <Button
  type="button" size="icon" variant="ghost"
  
  onClick={() => openEdit(s)}
  data-testid={`button-edit-strategy-${s.id}`}
  title="Edit / rename"
  >
  <Pencil />
  </Button>
  <Button
  type="button" size="icon" variant="ghost"
  
  onClick={() => handleDeleteClick(s.id)}
  data-testid={`button-delete-strategy-${s.id}`}
  title="Delete"
  >
  <Trash2 />
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
 <div className="w-100 border border-secondary flex-shrink-0 d-flex flex-column overflow-hidden">
 <div className="p-4 border-bottom border-secondary flex-shrink-0 d-flex align-items-center justify-content-between">
 <h2 className="small fw-bold font-mono text-uppercase ">
  {editingId === null ? "Visual Strategy Builder" : `Edit Strategy #${editingId}`}
 </h2>
 </div>
 <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 d-flex flex-column gap-4">
 <div className="d-flex flex-column gap-2">
  <Label className="small text-uppercase font-mono text-secondary">Name</Label>
  <Input
  required
  value={name}
  onChange={e => setName(e.target.value)}
  className="rounded-none font-mono border-secondary "
  data-testid="input-strategy-name"
  />
 </div>

 <div className="d-flex flex-column gap-2">
  <Label className="small text-uppercase font-mono text-secondary">Description</Label>
  <Input
  value={description}
  onChange={e => setDescription(e.target.value)}
  className="rounded-none font-mono border-secondary "
  />
 </div>

 <div className="d-flex flex-column gap-2">
  <Label className="small text-uppercase font-mono text-secondary">Target Market</Label>
  <Select value={type} onValueChange={(v: any) => setType(v)}>
  <SelectTrigger className="w-100 border-secondary font-mono small">
  <SelectValue />
  </SelectTrigger>
  <SelectContent className="rounded-none border-secondary">
  <SelectItem value={StrategyInputType.vanilla_options} className="font-mono small text-uppercase">Options</SelectItem>
  <SelectItem value={StrategyInputType.forex} className="font-mono small text-uppercase">Forex</SelectItem>
  <SelectItem value={StrategyInputType.multiplier} className="font-mono small text-uppercase">Multiplier</SelectItem>
  <SelectItem value={StrategyInputType.universal} className="font-mono small text-uppercase">Universal</SelectItem>
  </SelectContent>
  </Select>
 </div>

 {/* Dual-leg editor */}
 <div className="d-flex flex-column gap-2 pt-2">
  <Label className="small text-uppercase font-mono text-success fw-bold">Trade Legs</Label>
  <p className=" font-mono text-secondary ">
  Configure when the strategy should BUY and/or SELL. Each leg has its own conditions and exit rule. Enable one or both.
  </p>

  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "buy" | "sell" | "risk")} className="w-100 pt-2">
  <TabsList className="d-grid w-100 p-0 border border-secondary" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
  <TabsTrigger
  value="buy"
  className="rounded-none text-uppercase font-mono "
  data-testid="tab-buy-leg"
  >
  ▲ BUY {buyLeg.enabled && buyLeg.conditions.length > 0 ? `(${buyLeg.conditions.length})` : ""}
  </TabsTrigger>
  <TabsTrigger
  value="sell"
  className="rounded-none text-uppercase font-mono bg-danger "
  data-testid="tab-sell-leg"
  >
  ▼ SELL {sellLeg.enabled && sellLeg.conditions.length > 0 ? `(${sellLeg.conditions.length})` : ""}
  </TabsTrigger>
  <TabsTrigger
  value="risk"
  className="rounded-none text-uppercase font-mono "
  data-testid="tab-risk"
  >
  🛡 RISK
  </TabsTrigger>
  </TabsList>
  <TabsContent value="buy" className="mt-3">
  <LegEditor side="buy" leg={buyLeg} onChange={setBuyLeg} />
  </TabsContent>
  <TabsContent value="sell" className="mt-3">
  <LegEditor side="sell" leg={sellLeg} onChange={setSellLeg} />
  </TabsContent>
  <TabsContent value="risk" className="mt-3 d-flex flex-column gap-3 border border-secondary p-3 bg-card/50">
    <div>
      <Label className="small text-uppercase font-mono text-warning fw-bold">Win Cooldown (Per Pair)</Label>
      <p className="text-muted font-mono" style={{ fontSize: "0.8rem" }}>Pause trading after consecutive wins.</p>
      <div className="d-flex gap-2 mt-2">
        <div className="flex-grow-1">
          <Label className="small font-mono text-secondary">Consecutive Wins</Label>
          <Input type="number" min="1" value={winConsecutive} onChange={(e) => setWinConsecutive(e.target.value)} placeholder="e.g. 1" className="font-mono bg-background border-secondary rounded-none" />
        </div>
        <div className="flex-grow-1">
          <Label className="small font-mono text-secondary">Cooldown (Minutes)</Label>
          <Input type="number" min="1" value={winCooldown} onChange={(e) => setWinCooldown(e.target.value)} placeholder="e.g. 30" className="font-mono bg-background border-secondary rounded-none" />
        </div>
      </div>
    </div>
    <div className="border-top border-secondary pt-3">
      <Label className="small text-uppercase font-mono text-warning fw-bold">Loss Cooldown (Per Pair)</Label>
      <p className="text-muted font-mono" style={{ fontSize: "0.8rem" }}>Pause trading after consecutive losses.</p>
      <div className="d-flex gap-2 mt-2">
        <div className="flex-grow-1">
          <Label className="small font-mono text-secondary">Consecutive Losses</Label>
          <Input type="number" min="1" value={lossConsecutive} onChange={(e) => setLossConsecutive(e.target.value)} placeholder="e.g. 2" className="font-mono bg-background border-secondary rounded-none" />
        </div>
        <div className="flex-grow-1">
          <Label className="small font-mono text-secondary">Cooldown (Minutes)</Label>
          <Input type="number" min="1" value={lossCooldown} onChange={(e) => setLossCooldown(e.target.value)} placeholder="e.g. 60" className="font-mono bg-background border-secondary rounded-none" />
        </div>
      </div>
    </div>
  </TabsContent>
  </Tabs>
 </div>

 {/* Webhook section */}
 <div className="d-flex flex-column gap-2 pt-2 border-top border-secondary">
  <Label className="small text-uppercase font-mono text-success fw-bold">Signal Webhook (Optional)</Label>
  <p className=" font-mono text-secondary ">
  POST a JSON payload to this URL whenever this strategy triggers a signal.
  </p>
  <Input
  type="url"
  placeholder="https://example.com/hooks/derivterminal"
  value={webhookUrl}
  onChange={e => setWebhookUrl(e.target.value)}
  className="rounded-none font-mono small border-secondary "
  data-testid="input-webhook-url"
  />
  <Button
  type="button" variant="outline" size="sm"
  onClick={handleTestWebhook}
  disabled={testWebhook.isPending || editingId === null || !webhookUrl.trim()}
  className="w-100 text-uppercase font-mono"
  data-testid="button-test-webhook"
  >
  <Send className=" me-2" />
  {testWebhook.isPending ? "Sending..." : "Send Test Signal"}
  </Button>
  {editingId === null && (
  <p className=" font-mono text-secondary fst-italic">Save the strategy first to test the webhook.</p>
  )}
 </div>

 <div className="pt-4 mt-auto border-top border-secondary d-flex justify-content-end gap-2">
  <Button type="button" variant="outline" onClick={closeForm} className="rounded-none font-mono text-uppercase">Cancel</Button>
  <Button type="submit" disabled={isSaving} className="rounded-none fw-bold text-uppercase font-mono letter-spacing-wider ">
  {isSaving ? "Saving..." : editingId === null ? "Deploy Strategy" : "Save Changes"}
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
