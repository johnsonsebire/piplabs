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
  BookOpen,
  PenTool,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DrawingTool = "cursor" | "horizontal_line" | "vertical_line" | "trend_line" | "ray" | "rectangle" | "fib_retracement" | "text" | "brush" | "long_position" | "short_position";

interface ChartToolbarProps {
  activeTool: DrawingTool;
  onToolSelect: (tool: DrawingTool) => void;
  onClearAll: () => void;
  onOpenIndicators?: () => void;
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
    id: "positions",
    icon: ArrowUpRight,
    label: "Positions",
    tools: [
      { id: "long_position", icon: ArrowUpRight, label: "Long Position" },
      { id: "short_position", icon: ArrowDownRight, label: "Short Position" },
    ]
  },
  {
    id: "shapes",
    icon: Square,
    label: "Geometric Shapes",
    tools: [
      { id: "rectangle", icon: Square, label: "Rectangle" },
      { id: "brush", icon: PenTool, label: "Brush" },
    ]
  },
  {
    id: "annotations",
    icon: Type,
    label: "Annotations",
    tools: [
      { id: "text", icon: Type, label: "Text Note" },
    ]
  }
] as const;

export function ChartToolbar({ 
  activeTool, 
  onToolSelect, 
  onClearAll,
  onOpenIndicators,
  onOpenGuides
}: ChartToolbarProps) {
  const [lastUsedTools, setLastUsedTools] = useState<Record<string, string>>({
    lines: "trend_line",
    positions: "long_position",
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
                          if (!hasMultipleTools) {
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

        {onOpenIndicators && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-2 rounded transition-colors d-flex align-items-center justify-content-center text-muted-foreground hover:text-primary"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: '32px', height: '32px', color: '#94a3b8' }}
                onClick={onOpenIndicators}
              >
                <Activity style={{ width: '16px', height: '16px' }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-xs font-mono">Indicators, metrics, & strategies</div>
            </TooltipContent>
          </Tooltip>
        )}

        {onOpenGuides && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-2 rounded transition-colors d-flex align-items-center justify-content-center text-muted-foreground hover:text-primary"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: '32px', height: '32px', color: '#94a3b8' }}
                onClick={onOpenGuides}
              >
                <BookOpen style={{ width: '16px', height: '16px' }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-xs font-mono">Trading Guides & Mentorship</div>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="p-2 rounded transition-colors d-flex align-items-center justify-content-center mt-auto mb-2 text-muted-foreground hover:text-destructive"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: '32px', height: '32px' }}
              onClick={onClearAll}
            >
              <Trash2 style={{ width: '16px', height: '16px' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-xs font-mono">Clear all drawings</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
