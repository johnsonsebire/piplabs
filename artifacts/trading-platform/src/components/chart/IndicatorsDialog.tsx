import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Star, Activity, Plus } from "lucide-react";
import { ActiveIndicator } from "./TradingChart";

export const BUILT_IN_INDICATORS = [
  { id: "MA", name: "Moving Average", category: "Technicals", type: "overlay" },
  { id: "EMA", name: "Exponential Moving Average", category: "Technicals", type: "overlay" },
  { id: "RSI", name: "Relative Strength Index", category: "Technicals", type: "oscillator" },
  { id: "MACD", name: "MACD", category: "Technicals", type: "oscillator" },
  { id: "BB", name: "Bollinger Bands", category: "Technicals", type: "overlay" },
  { id: "STOCH", name: "Stochastic Oscillator", category: "Technicals", type: "oscillator" },
  { id: "CCI", name: "Commodity Channel Index", category: "Technicals", type: "oscillator" },
  { id: "ATR", name: "Average True Range", category: "Technicals", type: "oscillator" },
  { id: "ADX", name: "Average Directional Index", category: "Technicals", type: "oscillator" },
  { id: "SUPERT", name: "Supertrend", category: "Technicals", type: "overlay" },
  { id: "PSAR", name: "Parabolic SAR", category: "Technicals", type: "overlay" },
  { id: "DONCH", name: "Donchian Channels", category: "Technicals", type: "overlay" },
  { id: "KELT", name: "Keltner Channels", category: "Technicals", type: "overlay" },
  { id: "VWAP", name: "Volume-Weighted Average Price", category: "Technicals", type: "overlay" },
  { id: "OBV", name: "On-Balance Volume (OBV)", category: "Technicals", type: "oscillator" },
  { id: "CMF", name: "Chaikin Money Flow (CMF)", category: "Technicals", type: "oscillator" },
  { id: "ICH", name: "Ichimoku Cloud", category: "Technicals", type: "overlay" },
  { id: "WILLFRAC", name: "Williams Fractal", category: "Technicals", type: "overlay" },
];

interface IndicatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customIndicators: any[];
  onAddIndicator: (indicator: ActiveIndicator) => void;
}

export function IndicatorsDialog({ open, onOpenChange, customIndicators, onAddIndicator }: IndicatorsDialogProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<"Favorites" | "Technicals" | "My Scripts" | "SMC">("Technicals");

  // Filter SMC from custom indicators
  const smcIndicators = customIndicators.filter(ind => 
    ind.name?.toLowerCase().includes("smc") || 
    ind.name?.toLowerCase().includes("smart money") ||
    ind.code?.toLowerCase().includes("smc")
  );

  const myScripts = customIndicators.filter(ind => 
    !ind.name?.toLowerCase().includes("smc") && 
    !ind.name?.toLowerCase().includes("smart money")
  );

  let displayedIndicators: any[] = [];
  if (activeCategory === "Technicals") displayedIndicators = BUILT_IN_INDICATORS;
  else if (activeCategory === "My Scripts") displayedIndicators = myScripts;
  else if (activeCategory === "SMC") displayedIndicators = smcIndicators;
  else if (activeCategory === "Favorites") displayedIndicators = []; // TODO: implement favorites

  if (search) {
    const s = search.toLowerCase();
    displayedIndicators = displayedIndicators.filter(ind => ind.name.toLowerCase().includes(s));
  }

  const handleAdd = (ind: any) => {
    const instanceId = `${ind.id}_${Date.now()}`;
    const newInd: ActiveIndicator = {
      instanceId,
      baseId: ind.id,
      name: ind.name,
      config: {} // Default config
    };
    onAddIndicator(newInd);
    onOpenChange(false); // Close dialog immediately after adding
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl p-0 bg-[#0f1318] border-border text-foreground shadow-2xl d-flex flex-column overflow-hidden"
        style={{ maxWidth: '850px', height: '500px', maxHeight: '90vh', padding: 0 }}
      >
        <DialogHeader className="p-4 border-b border-border bg-[#151a21] flex-shrink-0">
          <DialogTitle className="font-mono text-sm d-flex align-items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Indicators, metrics and strategies
          </DialogTitle>
        </DialogHeader>

        <div className="d-flex flex-row flex-1 overflow-hidden w-100" style={{ minHeight: 0 }}>
          {/* Sidebar */}
          <div className="border-r border-border bg-[#0f1318] p-4 d-flex flex-column gap-1 flex-shrink-0" style={{ width: '250px', overflowY: 'auto' }}>
            <div className="position-relative mb-4 flex-shrink-0">
              <Search className="position-absolute text-muted-foreground" style={{ left: '10px', top: '10px', width: '16px', height: '16px' }} />
              <Input 
                placeholder="Search" 
                className="bg-[#151a21] border-border text-sm font-mono"
                style={{ paddingLeft: '32px' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="text-xs font-mono text-muted-foreground text-uppercase tracking-wider mb-2 mt-2 flex-shrink-0" style={{ letterSpacing: '0.1em' }}>Personal</div>
            <Button 
              variant="ghost" 
              className={`w-100 justify-content-start text-sm font-mono flex-shrink-0 ${activeCategory === "Favorites" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveCategory("Favorites")}
            >
              <Star className="w-4 h-4 me-2" /> Favorites
            </Button>
            <Button 
              variant="ghost" 
              className={`w-100 justify-content-start text-sm font-mono flex-shrink-0 ${activeCategory === "My Scripts" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveCategory("My Scripts")}
            >
              <Activity className="w-4 h-4 me-2" /> My scripts
            </Button>

            <div className="text-xs font-mono text-muted-foreground text-uppercase tracking-wider mb-2 mt-4 flex-shrink-0" style={{ letterSpacing: '0.1em' }}>Built-in</div>
            <Button 
              variant="ghost" 
              className={`w-100 justify-content-start text-sm font-mono flex-shrink-0 ${activeCategory === "Technicals" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveCategory("Technicals")}
            >
              <Activity className="w-4 h-4 me-2" /> Technicals
            </Button>

            <div className="text-xs font-mono text-muted-foreground text-uppercase tracking-wider mb-2 mt-4 flex-shrink-0" style={{ letterSpacing: '0.1em' }}>Community</div>
            <Button 
              variant="ghost" 
              className={`w-100 justify-content-start text-sm font-mono flex-shrink-0 ${activeCategory === "SMC" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveCategory("SMC")}
            >
              <Activity className="w-4 h-4 me-2" /> Smart Money Concepts
            </Button>
          </div>

          {/* Main Content */}
          <div className="flex-grow-1 bg-[#0a0d11] w-100" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="p-4 d-flex flex-column gap-1 w-100">
              {displayedIndicators.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-mono text-sm">
                  No indicators found in this category.
                </div>
              ) : (
                displayedIndicators.map((ind) => (
                  <div 
                    key={ind.id} 
                    className="group d-flex align-items-center justify-content-between p-3 rounded cursor-pointer border border-transparent transition-colors w-100"
                    style={{ backgroundColor: 'rgba(21, 26, 33, 0.5)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#151a21'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(21, 26, 33, 0.5)'}
                    onClick={() => handleAdd(ind)}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <button className="text-muted-foreground transition-colors" style={{ border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fbbf24'} onMouseLeave={(e) => e.currentTarget.style.color = ''} onClick={(e) => { e.stopPropagation(); /* toggle fav */ }}>
                        <Star className="w-4 h-4" />
                      </button>
                      <div>
                        <div className="font-mono text-sm text-foreground">{ind.name}</div>
                        {ind.category && <div className="text-xs text-muted-foreground" style={{ fontSize: '11px' }}>{ind.category}</div>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" style={{ opacity: 0.8 }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
