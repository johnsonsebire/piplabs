import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActiveIndicator } from "./TradingChart";
import { Settings2 } from "lucide-react";

interface IndicatorSettingsDialogProps {
  indicator: ActiveIndicator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (instanceId: string, newConfig: any) => void;
}

export function IndicatorSettingsDialog({ indicator, open, onOpenChange, onSave }: IndicatorSettingsDialogProps) {
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    if (indicator) {
      // Initialize with existing config or empty
      setConfig(indicator.config || {});
    }
  }, [indicator]);

  if (!indicator) return null;

  const handleSave = () => {
    onSave(indicator.instanceId, config);
    onOpenChange(false);
  };

  const updateConfig = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  // Determine what fields to show based on baseId (e.g. "MA", "RSI")
  const baseId = indicator.baseId;
  const isCustom = typeof baseId === "number" || (typeof baseId === "string" && !["MA", "EMA", "RSI", "MACD", "BB", "STOCH", "CCI", "ATR", "ADX"].includes(baseId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#0f1318] border-border text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            {indicator.name} Settings
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Moving Average Types */}
          {(baseId === "MA" || baseId === "EMA") && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Type</Label>
              <Select value={config.subtype || (baseId === "EMA" ? "EMA" : "SMA")} onValueChange={(v) => updateConfig("subtype", v)}>
                <SelectTrigger className="col-span-3 font-mono text-sm bg-[#151a21] border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f1318] border-border">
                  <SelectItem value="SMA">Simple (SMA)</SelectItem>
                  <SelectItem value="EMA">Exponential (EMA)</SelectItem>
                  <SelectItem value="WMA">Weighted (WMA)</SelectItem>
                  <SelectItem value="TMA">Triangular (TMA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Period (for many indicators) */}
          {["MA", "EMA", "RSI", "BB", "CCI", "ATR", "ADX"].includes(baseId as string) && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Period</Label>
              <Input 
                type="number" 
                value={config.period || 14} 
                onChange={(e) => updateConfig("period", parseInt(e.target.value))}
                className="col-span-3 font-mono text-sm bg-[#151a21] border-border"
              />
            </div>
          )}

          {/* MACD specific */}
          {baseId === "MACD" && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Fast Length</Label>
                <Input type="number" value={config.fast || 12} onChange={(e) => updateConfig("fast", parseInt(e.target.value))} className="col-span-3 font-mono text-sm bg-[#151a21] border-border" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Slow Length</Label>
                <Input type="number" value={config.slow || 26} onChange={(e) => updateConfig("slow", parseInt(e.target.value))} className="col-span-3 font-mono text-sm bg-[#151a21] border-border" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Signal Length</Label>
                <Input type="number" value={config.signal || 9} onChange={(e) => updateConfig("signal", parseInt(e.target.value))} className="col-span-3 font-mono text-sm bg-[#151a21] border-border" />
              </div>
            </>
          )}

          {/* Common Style settings: Color and Thickness */}
          <div className="grid grid-cols-4 items-center gap-4 mt-4 pt-4 border-t border-border">
            <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Color</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Input 
                type="color" 
                value={config.color || "#00ff88"} 
                onChange={(e) => updateConfig("color", e.target.value)}
                className="w-12 h-8 p-1 cursor-pointer bg-transparent border-border"
              />
              <Input 
                type="text" 
                value={config.color || "#00ff88"} 
                onChange={(e) => updateConfig("color", e.target.value)}
                className="font-mono text-xs bg-[#151a21] border-border flex-1 uppercase"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-mono text-xs text-muted-foreground uppercase">Thickness</Label>
            <Input 
              type="range" 
              min="1" max="4" step="1"
              value={config.thickness || 1} 
              onChange={(e) => updateConfig("thickness", parseInt(e.target.value))}
              className="col-span-3 cursor-pointer"
            />
          </div>
          
          {isCustom && (
            <div className="text-xs text-muted-foreground font-mono mt-2 col-span-4 p-2 bg-[#151a21] rounded">
              Note: This is a custom indicator. The color and thickness options will override the default line settings if applicable.
            </div>
          )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono text-xs">Cancel</Button>
          <Button onClick={handleSave} className="font-mono text-xs">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
