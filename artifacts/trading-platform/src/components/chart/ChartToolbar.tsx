import React, { useState } from "react";
import { 
  MousePointer2, 
  Minus, 
  TrendingUp, 
  Square, 
  Trash2,
  ChevronRight,
  GripVertical,
  AlignEndHorizontal,
  Activity,
  Check,
  Type,
  BookOpen
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DrawingTool = "cursor" | "horizontal_line" | "vertical_line" | "trend_line" | "ray" | "rectangle" | "fib_retracement" | "text";

interface ChartToolbarProps {
  activeTool: DrawingTool;
  onToolSelect: (tool: DrawingTool) => void;
  onClearAll: () => void;
  availableIndicators?: Array<{ id: string | number, name: string }>;
  activeIndicatorIds?: Array<string | number>;
  onToggleIndicator?: (id: string | number) => void;
  onOpenGuides?: () => void;
}

const TOOL_CATEGORIES = [
  {
    id: "cursor",
    icon: MousePointer2,
    label: "Cursor / Select",
    tools: [
      { id: "cursor", icon: MousePointer2, label: "Cursor / Select" }
    ]
  },
  {
    id: "lines",
    icon: TrendingUp, // Default icon for category
    label: "Trend Lines",
    tools: [
      { id: "trend_line", icon: TrendingUp, label: "Trend Line" },
      { id: "ray", icon: ChevronRight, label: "Ray" },
      { id: "horizontal_line", icon: Minus, label: "Horizontal Line" },
      { id: "vertical_line", icon: GripVertical, label: "Vertical Line" },
    ]
  },
  {
    id: "fibonacci",
    icon: AlignEndHorizontal,
    label: "Fibonacci Tools",
    tools: [
      { id: "fib_retracement", icon: AlignEndHorizontal, label: "Fibonacci Retracement" }
    ]
  },
  {
    id: "shapes",
    icon: Square,
    label: "Geometric Shapes",
    tools: [
      { id: "rectangle", icon: Square, label: "Rectangle" },
    ]
  },
  {
    id: "annotations",
    icon: Type,
    label: "Annotations",
    tools: [
      { id: "text", icon: Type, label: "Text" },
    ]
  }
] as const;

export function ChartToolbar({ 
  activeTool, 
  onToolSelect, 
  onClearAll,
  availableIndicators,
  activeIndicatorIds,
  onToggleIndicator,
  onOpenGuides
}: ChartToolbarProps) {
  const [lastUsedTools, setLastUsedTools] = useState<Record<string, string>>({
    lines: "trend_line",
    shapes: "rectangle",
    fibonacci: "fib_retracement",
    annotations: "text",
    cursor: "cursor"
  });

  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const handleToolSelect = (categoryId: string, toolId: string) => {
    setLastUsedTools(prev => ({ ...prev, [categoryId]: toolId }));
    onToolSelect(toolId as DrawingTool);
    setOpenCategory(null);
  };

  return (
    <div className="d-flex flex-column align-items-center gap-2 border-end border-secondary bg-card py-2 flex-shrink-0 z-10 position-relative" style={{ width: '48px', backgroundColor: 'rgba(15, 19, 24, 0.5)' }}>
      <TooltipProvider delayDuration={300}>
        {TOOL_CATEGORIES.map((category) => {
          const currentToolId = lastUsedTools[category.id];
          const activeToolConfig = category.tools.find(t => t.id === currentToolId) || category.tools[0];
          const CategoryIcon = activeToolConfig.icon;
          
          const isCategoryActive = category.tools.some(t => t.id === activeTool);
          const hasMultipleTools = category.tools.length > 1;

          return (
            <Popover 
              key={category.id} 
              open={openCategory === category.id} 
              onOpenChange={(isOpen) => setOpenCategory(isOpen ? category.id : null)}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="position-relative">
                    <button
                      onClick={() => {
                        if (!hasMultipleTools) {
                          handleToolSelect(category.id, category.tools[0].id);
                        } else {
                          // If clicking the main icon, re-select the last used tool, unless already active, then maybe open popover?
                          // Actually, standard behavior: click icon selects it. Click small arrow (or long press) opens popover.
                          // For simplicity, we just select it. Popover opens on right click or if we use a split button.
                          // Let's just use PopoverTrigger for the whole button but only if it has multiple tools.
                          // Wait, if PopoverTrigger wraps it, clicking always opens popover?
                          // Let's make it so clicking it selects it. 
                          // To open the menu, we can have a small arrow indicator that triggers the popover.
                        }
                      }}
                      className={`p-2 rounded transition-colors d-flex align-items-center justify-content-center`}
                      style={{ 
                        border: 'none', 
                        background: isCategoryActive ? 'rgba(16, 185, 129, 0.2)' : 'transparent', 
                        color: isCategoryActive ? '#10b981' : '#94a3b8',
                        cursor: 'pointer',
                        width: '32px',
                        height: '32px'
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div className="d-flex align-items-center justify-content-center w-100 h-100" onClick={(e) => {
                          if (hasMultipleTools) {
                            // Let popover handle it
                          } else {
                            e.preventDefault();
                            handleToolSelect(category.id, category.tools[0].id);
                          }
                        }}>
                          <CategoryIcon style={{ width: '16px', height: '16px' }} />
                          {hasMultipleTools && (
                            <div 
                              style={{ 
                                position: 'absolute', 
                                right: '2px', 
                                bottom: '2px', 
                                width: '4px', 
                                height: '4px', 
                                borderRight: '1px solid currentColor', 
                                borderBottom: '1px solid currentColor' 
                              }} 
                            />
                          )}
                        </div>
                      </PopoverTrigger>
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="text-xs font-mono">{activeToolConfig.label}</div>
                </TooltipContent>
              </Tooltip>

              {hasMultipleTools && (
                <PopoverContent side="right" align="start" sideOffset={10} className="p-1 rounded-sm border-secondary shadow-lg" style={{ width: 'auto', backgroundColor: '#0f1318', minWidth: '160px' }}>
                  <div className="d-flex flex-column gap-1">
                    {category.tools.map(tool => {
                      const SubIcon = tool.icon;
                      const isSubActive = activeTool === tool.id;
                      return (
                        <button
                          key={tool.id}
                          className="d-flex align-items-center gap-2 px-2 py-1.5 rounded transition-colors text-start"
                          style={{
                            border: 'none',
                            background: isSubActive ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                            color: isSubActive ? '#10b981' : '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                          onClick={() => handleToolSelect(category.id, tool.id)}
                        >
                          <SubIcon style={{ width: '14px', height: '14px' }} />
                          <span className="font-mono">{tool.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              )}
            </Popover>
          );
        })}
        
        <div style={{ width: '32px', height: '1px', backgroundColor: '#1a2332', margin: '8px 0' }} />
        
        {availableIndicators && availableIndicators.length > 0 && onToggleIndicator && (
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className="p-2 rounded transition-colors d-flex align-items-center justify-content-center"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: activeIndicatorIds && activeIndicatorIds.length > 0 ? '#10b981' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    <Activity style={{ width: '16px', height: '16px' }} />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs font-mono">Indicators</div>
              </TooltipContent>
            </Tooltip>

            <PopoverContent side="right" align="start" sideOffset={10} className="p-1 rounded-sm border-secondary shadow-lg" style={{ width: 'auto', backgroundColor: '#0f1318', minWidth: '160px', zIndex: 1000 }}>
              <div className="d-flex flex-column gap-1">
                {availableIndicators.map(ind => {
                  const isActive = activeIndicatorIds?.includes(ind.id);
                  return (
                    <button
                      key={ind.id}
                      className="d-flex align-items-center justify-content-between gap-3 px-2 py-1.5 rounded transition-colors text-start"
                      style={{
                        border: 'none',
                        background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                        color: isActive ? '#10b981' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                      onClick={() => onToggleIndicator(ind.id)}
                    >
                      <span className="font-mono">{ind.name}</span>
                      {isActive && <Check style={{ width: '12px', height: '12px' }} />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div style={{ width: '32px', height: '1px', backgroundColor: '#1a2332', margin: '8px 0' }} />

        {onOpenGuides && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenGuides}
                className="p-2 rounded transition-colors text-muted hover:text-success"
                style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
              >
                <BookOpen style={{ width: '16px', height: '16px' }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-xs font-mono">Discipline Guides</div>
            </TooltipContent>
          </Tooltip>
        )}
        
        <div style={{ width: '32px', height: '1px', backgroundColor: '#1a2332', margin: '8px 0' }} />
        
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClearAll}
              className="p-2 rounded transition-colors text-muted hover:text-danger"
              style={{ border: 'none', background: 'transparent', color: '#94a3b8' }}
            >
              <Trash2 style={{ width: '16px', height: '16px' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-xs font-mono">Clear All Drawings</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
