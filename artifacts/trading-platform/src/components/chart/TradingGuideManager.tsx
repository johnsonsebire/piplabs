import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, X, CheckCircle2, Circle } from "lucide-react";
import { useTradingGuides, TradingGuide, TradingRule } from "@/hooks/useTradingGuides";

interface TradingGuideManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradingGuideManager({ open, onOpenChange }: TradingGuideManagerProps) {
  const { guides, saveGuide, deleteGuide, activateGuide, activeGuide } = useTradingGuides();
  const [editingGuide, setEditingGuide] = useState<TradingGuide | null>(null);

  useEffect(() => {
    if (open && !editingGuide && guides.length > 0) {
      setEditingGuide(guides[0]);
    }
  }, [open, guides, editingGuide]);

  const handleCreateNew = () => {
    const newGuide: TradingGuide = {
      id: Date.now().toString(),
      name: "New Trading Guide",
      buyRules: [{ id: Date.now().toString() + "_b", text: "", checked: false }],
      sellRules: [{ id: Date.now().toString() + "_s", text: "", checked: false }],
      isActive: false,
      userId: "temp",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingGuide(newGuide);
  };

  const handleSave = () => {
    if (editingGuide) {
      saveGuide(editingGuide);
      // Optional: show a toast here
    }
  };

  const addRule = (type: 'buyRules' | 'sellRules') => {
    if (!editingGuide) return;
    setEditingGuide({
      ...editingGuide,
      [type]: [...editingGuide[type], { id: Date.now().toString(), text: "", checked: false }]
    });
  };

  const updateRuleText = (type: 'buyRules' | 'sellRules', id: string, text: string) => {
    if (!editingGuide) return;
    setEditingGuide({
      ...editingGuide,
      [type]: editingGuide[type].map((r: TradingRule) => r.id === id ? { ...r, text } : r)
    });
  };

  const removeRule = (type: 'buyRules' | 'sellRules', id: string) => {
    if (!editingGuide) return;
    setEditingGuide({
      ...editingGuide,
      [type]: editingGuide[type].filter((r: TradingRule) => r.id !== id)
    });
  };

  const isEditingActive = activeGuide?.id === editingGuide?.id;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="bg-background border-secondary" style={{ height: '80vh', maxWidth: '900px', width: '90vw', padding: 0, backgroundColor: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: '8px', overflow: 'hidden', position: 'relative', display: 'flex', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        
        {/* Close Button */}
        <button onClick={() => onOpenChange(false)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--bs-secondary)', cursor: 'pointer', zIndex: 1070 }}>
          <X size={20} />
        </button>

        <div className="d-flex h-100 w-100 text-light" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
          
          {/* Left Sidebar: Guide List */}
          <div className="d-flex flex-column flex-shrink-0 border-end border-secondary" style={{ width: '260px', backgroundColor: 'var(--bs-card-bg)' }}>
            <div className="p-3 border-bottom border-secondary d-flex justify-content-between align-items-center">
              <span className="font-mono fw-bold text-uppercase" style={{ fontSize: '12px', letterSpacing: '0.1em' }}>Discipline Guides</span>
              <Button size="icon" variant="ghost" onClick={handleCreateNew} className="h-8 w-8 text-success hover:text-success" style={{ backgroundColor: 'transparent' }}>
                <Plus size={16} />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-2 d-flex flex-column gap-1">
              {guides.length === 0 ? (
                <div className="p-4 text-center text-secondary font-mono" style={{ fontSize: '11px' }}>
                  No guides created yet.
                </div>
              ) : (
                guides.map(g => (
                  <div 
                    key={g.id} 
                    className={`d-flex align-items-center justify-content-between p-2 rounded cursor-pointer transition-colors ${editingGuide?.id === g.id ? 'bg-success/10 text-success' : 'hover:bg-secondary/20 text-foreground'}`}
                    onClick={() => setEditingGuide(g)}
                  >
                    <div className="d-flex align-items-center gap-2 overflow-hidden">
                      {g.isActive ? <CheckCircle2 size={14} className="text-success flex-shrink-0" /> : <Circle size={14} className="text-secondary flex-shrink-0 opacity-50" />}
                      <span className="font-mono text-truncate" style={{ fontSize: '12px' }}>{g.name}</span>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-danger hover:text-danger hover:bg-danger/10" onClick={(e) => { e.stopPropagation(); deleteGuide(g.id); if(editingGuide?.id === g.id) setEditingGuide(null); }}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Area: Guide Editor */}
          <div className="flex-grow-1 d-flex flex-column overflow-hidden" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
            {!editingGuide ? (
              <div className="flex-grow-1 d-flex align-items-center justify-content-center text-secondary font-mono" style={{ fontSize: '12px' }}>
                Select a guide from the left or create a new one.
              </div>
            ) : (
              <>
                <div className="p-4 border-bottom border-secondary d-flex justify-content-between align-items-center bg-card/30">
                  <div className="d-flex align-items-center gap-3 w-50">
                    <Label className="font-mono text-uppercase text-secondary flex-shrink-0" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>Guide Name</Label>
                    <Input 
                      value={editingGuide.name} 
                      onChange={(e) => setEditingGuide({...editingGuide, name: e.target.value})}
                      className="font-mono bg-background border-secondary h-8 rounded-none"
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <Button 
                      variant={isEditingActive ? "outline" : "default"} 
                      className={`font-mono text-uppercase h-8 rounded-none ${isEditingActive ? 'border-success text-success' : 'bg-success text-light border-0'}`}
                      onClick={() => {
                        if (!isEditingActive) saveGuide(editingGuide);
                        activateGuide(isEditingActive ? null : editingGuide.id);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {isEditingActive ? 'Deactivate Overlay' : 'Activate Overlay'}
                    </Button>
                    <Button variant="outline" className="font-mono text-uppercase h-8 rounded-none border-secondary" onClick={handleSave}>
                      Save Guide
                    </Button>
                  </div>
                </div>

                <div className="flex-grow-1 overflow-auto p-4">
                  <div className="row g-4">
                    {/* Buy Rules Column */}
                    <div className="col-md-6 d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-2">
                          <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></div>
                          <span className="font-mono fw-bold text-uppercase" style={{ fontSize: '12px', letterSpacing: '0.1em', color: '#10b981' }}>BUY RULES</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => addRule('buyRules')} className="h-6 px-2 text-success hover:bg-success/10 font-mono text-uppercase" style={{ fontSize: '10px' }}>
                          <Plus size={12} className="me-1" /> Add
                        </Button>
                      </div>
                      
                      <div className="d-flex flex-column gap-2">
                        {editingGuide.buyRules.map((rule: TradingRule, idx: number) => (
                          <div key={rule.id} className="d-flex align-items-start gap-2 group">
                            <div className="d-flex align-items-center justify-content-center flex-shrink-0 mt-1" style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '10px', fontFamily: 'monospace' }}>
                              {idx + 1}
                            </div>
                            <textarea 
                              className="flex-1 font-mono bg-card border border-secondary p-2 resize-none outline-none focus:border-success transition-colors"
                              style={{ fontSize: '12px', minHeight: '60px', color: 'var(--foreground)' }}
                              placeholder="e.g. Confirm Trend using EMA50..."
                              value={rule.text}
                              onChange={(e) => updateRuleText('buyRules', rule.id, e.target.value)}
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-danger opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeRule('buyRules', rule.id)}>
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                        {editingGuide.buyRules.length === 0 && (
                          <div className="text-secondary font-mono fst-italic p-3 text-center border border-dashed border-secondary" style={{ fontSize: '11px' }}>No buy rules defined.</div>
                        )}
                      </div>
                    </div>

                    {/* Sell Rules Column */}
                    <div className="col-md-6 d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-2">
                          <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }}></div>
                          <span className="font-mono fw-bold text-uppercase" style={{ fontSize: '12px', letterSpacing: '0.1em', color: '#ef4444' }}>SELL RULES</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => addRule('sellRules')} className="h-6 px-2 text-danger hover:bg-danger/10 font-mono text-uppercase" style={{ fontSize: '10px' }}>
                          <Plus size={12} className="me-1" /> Add
                        </Button>
                      </div>
                      
                      <div className="d-flex flex-column gap-2">
                        {editingGuide.sellRules.map((rule: TradingRule, idx: number) => (
                          <div key={rule.id} className="d-flex align-items-start gap-2 group">
                            <div className="d-flex align-items-center justify-content-center flex-shrink-0 mt-1" style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '10px', fontFamily: 'monospace' }}>
                              {idx + 1}
                            </div>
                            <textarea 
                              className="flex-1 font-mono bg-card border border-secondary p-2 resize-none outline-none focus:border-danger transition-colors"
                              style={{ fontSize: '12px', minHeight: '60px', color: 'var(--foreground)' }}
                              placeholder="e.g. Confirm Trend using EMA50..."
                              value={rule.text}
                              onChange={(e) => updateRuleText('sellRules', rule.id, e.target.value)}
                            />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-danger opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeRule('sellRules', rule.id)}>
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                        {editingGuide.sellRules.length === 0 && (
                          <div className="text-secondary font-mono fst-italic p-3 text-center border border-dashed border-secondary" style={{ fontSize: '11px' }}>No sell rules defined.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
