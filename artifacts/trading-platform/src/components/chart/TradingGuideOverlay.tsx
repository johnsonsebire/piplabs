import React, { useState } from "react";
import { useTradingGuides } from "@/hooks/useTradingGuides";
import { Button } from "@/components/ui/button";
import { RefreshCw, Minimize2, Maximize2, ChevronRight, X, GripHorizontal, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDraggable } from "@/hooks/useDraggable";

export function TradingGuideOverlay() {
  const { activeGuide, updateActiveGuideRule, resetActiveGuideRules, activateGuide } = useTradingGuides();
  const [minimized, setMinimized] = useState(false);
  
  // Set initial position based on window width/height if needed, or static defaults. 
  // It's rendered inside a relative chart container, so default to top-right.
  const { position, isDragging, onMouseDown } = useDraggable({ x: 0, y: 0 });

  if (!activeGuide) {
    return null;
  }

  if (minimized) {
    return (
      <div 
        className="position-absolute d-flex flex-column gap-2" 
        style={{ 
          top: `calc(20px + ${position.y}px)`, 
          right: `calc(20px - ${position.x}px)`, 
          zIndex: 50 
        }}
      >
        <div 
          className="d-flex align-items-center justify-content-center cursor-grab bg-card/80 backdrop-blur border border-secondary text-muted-foreground hover:text-white transition-colors shadow-sm"
          onMouseDown={onMouseDown}
          style={{ width: '36px', height: '24px', borderRadius: '4px' }}
        >
          <GripHorizontal size={14} />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="bg-card/80 backdrop-blur border-secondary text-success shadow-sm"
                onClick={() => setMinimized(false)}
              >
                <Maximize2 size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-mono text-uppercase" style={{ fontSize: '10px' }}>
              Show {activeGuide.name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div 
      className={`position-absolute border border-secondary shadow-lg d-flex flex-column overflow-hidden text-light ${isDragging ? '' : 'transition-all'}`}
      style={{ 
        top: `calc(20px + ${position.y}px)`, 
        right: `calc(20px - ${position.x}px)`, 
        width: '320px', 
        maxHeight: 'calc(100% - 40px)', 
        zIndex: 50,
        borderRadius: '8px',
        backgroundColor: 'var(--bs-card-bg)',
        backdropFilter: 'blur(10px)',
        cursor: isDragging ? 'grabbing' : 'default',
        opacity: isDragging ? 0.9 : 1
      }}
    >
      <div 
        className="d-flex align-items-center justify-content-between p-2 border-bottom border-secondary" 
        style={{ backgroundColor: 'var(--bs-body-bg)' }}
      >
        <div 
          className="d-flex align-items-center gap-2 overflow-hidden flex-1"
          onMouseDown={onMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <GripHorizontal size={14} className="text-secondary ms-1 hover:text-white transition-colors" />
          <div className="text-success p-1 rounded" style={{ fontSize: '10px', backgroundColor: 'rgba(16, 185, 129, 0.2)' }}>
            <ChevronRight size={14} />
          </div>
          <span className="font-mono fw-bold text-uppercase text-truncate" style={{ fontSize: '11px', letterSpacing: '0.05em' }} title={activeGuide.name}>
            {activeGuide.name}
          </span>
        </div>
        <div className="d-flex align-items-center gap-1 flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-secondary hover:text-foreground" onClick={() => resetActiveGuideRules(activeGuide.id)}>
                  <RefreshCw size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono" style={{ fontSize: '10px' }}>Reset Checkboxes</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-secondary hover:text-foreground" onClick={() => setMinimized(true)}>
            <Minimize2 size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:text-danger hover:bg-danger/10" onClick={() => activateGuide(null)} title="Close Overlay">
            <X size={14} />
          </Button>
        </div>
      </div>

      <div className="overflow-auto flex-grow-1 p-3 d-flex flex-column gap-4">
        {/* Buy Rules */}
        {activeGuide.buyRules.length > 0 && (
          <div className="d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }}></div>
              <span className="font-mono fw-bold text-uppercase" style={{ fontSize: '10px', color: '#10b981', letterSpacing: '0.1em' }}>BUY CONDITIONS</span>
            </div>
            {activeGuide.buyRules.map((rule, idx) => (
              <div 
                key={rule.id} 
                className="d-flex align-items-center gap-2 py-1 px-1 cursor-pointer transition-colors" 
                style={{ 
                  borderBottom: idx === activeGuide.buyRules.length - 1 ? 'none' : '1px solid var(--bs-border-color-translucent)'
                }}
                onClick={() => updateActiveGuideRule(activeGuide.id, 'buyRules', rule.id, !rule.checked)}
              >
                <div 
                  className="d-flex align-items-center justify-content-center flex-shrink-0 transition-all"
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    border: `1px solid ${rule.checked ? '#10b981' : 'rgba(255,255,255,0.3)'}`,
                    backgroundColor: rule.checked ? '#10b981' : 'transparent'
                  }}
                >
                  {rule.checked && <Check size={8} color="#000" strokeWidth={4} />}
                </div>
                <span className={`font-mono flex-grow-1 transition-all ${rule.checked ? 'text-success text-decoration-line-through opacity-75' : 'text-light'}`} style={{ fontSize: '11px', lineHeight: 1.4 }}>
                  {rule.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Sell Rules */}
        {activeGuide.sellRules.length > 0 && (
          <div className="d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }}></div>
              <span className="font-mono fw-bold text-uppercase" style={{ fontSize: '10px', color: '#ef4444', letterSpacing: '0.1em' }}>SELL CONDITIONS</span>
            </div>
            {activeGuide.sellRules.map((rule, idx) => (
              <div 
                key={rule.id} 
                className="d-flex align-items-center gap-2 py-1 px-1 cursor-pointer transition-colors" 
                style={{ 
                  borderBottom: idx === activeGuide.sellRules.length - 1 ? 'none' : '1px solid var(--bs-border-color-translucent)'
                }}
                onClick={() => updateActiveGuideRule(activeGuide.id, 'sellRules', rule.id, !rule.checked)}
              >
                <div 
                  className="d-flex align-items-center justify-content-center flex-shrink-0 transition-all"
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    border: `1px solid ${rule.checked ? '#ef4444' : 'rgba(255,255,255,0.3)'}`,
                    backgroundColor: rule.checked ? '#ef4444' : 'transparent'
                  }}
                >
                  {rule.checked && <Check size={8} color="#000" strokeWidth={4} />}
                </div>
                <span className={`font-mono flex-grow-1 transition-all ${rule.checked ? 'text-danger text-decoration-line-through opacity-75' : 'text-light'}`} style={{ fontSize: '11px', lineHeight: 1.4 }}>
                  {rule.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
