import React, { useEffect, useState, useRef } from "react";
import { IChartApi, ISeriesApi, Logical, Time } from "lightweight-charts";
import { DrawingTool } from "./ChartToolbar";

export type Point = { time: number; price: number };

export type Drawing = {
  id: string;
  type: DrawingTool;
  points: Point[];
  color: string;
  completed: boolean;
  text?: string;
};

interface ChartDrawingsProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  activeTool: DrawingTool;
  drawings: Drawing[];
  setDrawings: React.Dispatch<React.SetStateAction<Drawing[]>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  validCandles?: any[];
}

export function ChartDrawings({
  chart,
  series,
  activeTool,
  drawings,
  setDrawings,
  containerRef,
  validCandles = [],
}: ChartDrawingsProps) {
  const [svgRect, setSvgRect] = useState({ width: 0, height: 0 });
  const [renderTrigger, setRenderTrigger] = useState(0);
  
  // Drawing creation state
  const currentDrawingRef = useRef<Drawing | null>(null);

  // Dragging state
  const dragStateRef = useRef<{ 
    id: string, 
    startX: number, 
    startY: number, 
    initialPoints: Point[],
    pointIndex?: number 
  } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);

  // Selection & Multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Keyboard events (Delete & Shift)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftDown(true);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // We only want to delete if we are not focused on an input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

        if (selectedIds.length > 0) {
          setDrawings((prev) => prev.filter((d) => !selectedIds.includes(d.id)));
          setSelectedIds([]);
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftDown(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedIds, setDrawings]);

  // Sync SVG dimensions and redraw on chart interactions
  useEffect(() => {
    if (!chart || !containerRef.current) return;

    const updateRender = () => setRenderTrigger((prev) => prev + 1);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSvgRect({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
      updateRender();
    });
    ro.observe(containerRef.current);

    chart.timeScale().subscribeVisibleLogicalRangeChange(updateRender);
    chart.timeScale().subscribeSizeChange(updateRender);

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateRender);
      chart.timeScale().unsubscribeSizeChange(updateRender);
    };
  }, [chart, containerRef]);

  // Handle Dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current || !chart || !series) return;

      const { id, startX, startY, initialPoints, pointIndex } = dragStateRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      setDrawings((prev) => prev.map((d) => {
        if (d.id !== id) return d;

        const newPoints = initialPoints.map((pt, idx) => {
          // If we are resizing a specific corner of a rectangle:
          // For rectangle: initialPoints has 2 points [p0, p1]
          // pointIndex 0: changes p0 (idx 0)
          // pointIndex 1: changes p1 (idx 1)
          // pointIndex 2 (top-right/bottom-left): changes p0.time (idx 0) and p1.price (idx 1)
          // pointIndex 3 (bottom-right/top-left): changes p1.time (idx 1) and p0.price (idx 0)
          
          let applyDx = false;
          let applyDy = false;

          if (pointIndex === undefined) {
            // Dragging whole shape
            applyDx = true;
            applyDy = true;
          } else {
            // Dragging specific point/corner
            if (d.type === "rectangle") {
              if (pointIndex === 0 && idx === 0) { applyDx = true; applyDy = true; }
              if (pointIndex === 1 && idx === 1) { applyDx = true; applyDy = true; }
              if (pointIndex === 2) {
                if (idx === 0) applyDx = true; // changes p0's time
                if (idx === 1) applyDy = true; // changes p1's price
              }
              if (pointIndex === 3) {
                if (idx === 1) applyDx = true; // changes p1's time
                if (idx === 0) applyDy = true; // changes p0's price
              }
            } else {
              // Line or Fib (only pointIndex 0 or 1)
              if (pointIndex === idx) {
                applyDx = true;
                applyDy = true;
              }
            }
          }

          let newTime = pt.time;
          let newPrice = pt.price;

          if (applyDx) {
            const currentX = chart.timeScale().timeToCoordinate(pt.time as Time);
            if (currentX !== null) {
              const translatedTime = chart.timeScale().coordinateToTime(currentX + dx);
              if (translatedTime !== null) {
                newTime = translatedTime as number;
              }
            }
          }

          if (applyDy) {
            const currentY = series.priceToCoordinate(pt.price);
            if (currentY !== null) {
              const translatedPrice = series.coordinateToPrice(currentY + dy);
              if (translatedPrice !== null) {
                newPrice = translatedPrice;
              }
            }
          }

          return { time: newTime, price: newPrice };
        });

        return { ...d, points: newPoints };
      }));
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, chart, series, setDrawings]);

  // Handle Box Selection
  useEffect(() => {
    if (!selectionBox) return;

    const handleMouseMove = (e: MouseEvent) => {
      setSelectionBox(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (selectionBox && containerRef.current && chart && series) {
        const rect = containerRef.current.getBoundingClientRect();
        const left = Math.min(selectionBox.startX, selectionBox.currentX) - rect.left;
        const right = Math.max(selectionBox.startX, selectionBox.currentX) - rect.left;
        const top = Math.min(selectionBox.startY, selectionBox.currentY) - rect.top;
        const bottom = Math.max(selectionBox.startY, selectionBox.currentY) - rect.top;

        const newlySelected: string[] = [];
        drawings.forEach(d => {
          let inside = false;
          d.points.forEach(pt => {
            const x = chart.timeScale().timeToCoordinate(pt.time as Time);
            const y = series.priceToCoordinate(pt.price);
            if (x !== null && y !== null && x >= left && x <= right && y >= top && y <= bottom) {
              inside = true;
            }
          });
          if (inside) newlySelected.push(d.id);
        });

        if (newlySelected.length > 0) {
          setSelectedIds(prev => Array.from(new Set([...prev, ...newlySelected])));
        }
      }
      setSelectionBox(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [selectionBox, chart, series, containerRef, drawings]);

  // Handle Chart Clicks and Crosshair moves for creation
  useEffect(() => {
    if (!chart || !series) return;

    const handleClick = (param: any) => {
      // Don't create if we are dragging or clicking on an existing shape
      if (dragStateRef.current) return;

      if (activeTool === "cursor") {
        if (!isShiftDown) {
          setSelectedIds([]); // Clear selection when clicking empty chart space
        }
        return;
      }

      if (!param.point || !param.time) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      const time = param.time as number;

      setDrawings((prev) => {
        const active = prev.find((d) => !d.completed);

        if (activeTool === "text") {
          const newId = Date.now().toString();
          setEditingTextId(newId);
          // Auto-select it so the color picker appears
          setSelectedIds([newId]);
          return [
            ...prev,
            { id: newId, type: activeTool, points: [{ time, price }], color: "#ffffff", text: "Text", completed: true },
          ];
        }

        if (activeTool === "horizontal_line" || activeTool === "vertical_line") {
          // Horizontal and Vertical lines only need 1 point
          return [
            ...prev,
            { id: Date.now().toString(), type: activeTool, points: [{ time, price }], color: "#3b82f6", completed: true },
          ];
        }

        if (!active) {
          // Start new drawing
          const newDrawing: Drawing = {
            id: Date.now().toString(),
            type: activeTool,
            points: [{ time, price }],
            color: "#3b82f6",
            completed: false,
          };
          currentDrawingRef.current = newDrawing;
          return [...prev, newDrawing];
        } else {
          // Complete existing drawing (trend line, ray, fib, rectangle)
          currentDrawingRef.current = null;
          return prev.map((d) =>
            d.id === active.id ? { ...d, points: [...d.points, { time, price }], completed: true } : d
          );
        }
      });
    };

    const handleCrosshairMove = (param: any) => {
      if (!currentDrawingRef.current || !param.point || !param.time) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      const time = param.time as number;

      setDrawings((prev) =>
        prev.map((d) => {
          if (d.id === currentDrawingRef.current?.id && !d.completed) {
            // Keep the first point, update the second "preview" point
            return { ...d, points: [d.points[0], { time, price }] };
          }
          return d;
        })
      );
    };

    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
    };
  }, [chart, series, activeTool, setDrawings, isShiftDown]);

  if (!chart || !series) return null;

  const handleShapeMouseDown = (e: React.MouseEvent, id: string, points: Point[], pointIndex?: number) => {
    if (activeTool !== "cursor") return;
    e.stopPropagation();

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    } else {
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
    }
    
    dragStateRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      initialPoints: [...points],
      pointIndex
    };
    setIsDragging(true);
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (isShiftDown && activeTool === "cursor") {
      setSelectionBox({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
    } else if (activeTool === "cursor" && !isShiftDown) {
      setSelectedIds([]);
    }
  };

  const getPointerEvents = () => activeTool === "cursor" ? "all" : "none";
  const getCursor = () => activeTool === "cursor" ? (isDragging ? "grabbing" : "grab") : "default";

  // Helper to render hit areas for thin lines
  const renderLineWithHitArea = (id: string, points: Point[], x1: number, y1: number, x2: number, y2: number, color: string, dashArray?: string) => {
    return (
      <g 
        key={id}
        onMouseDown={(e) => handleShapeMouseDown(e, id, points)}
        style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }}
      >
        {/* Invisible thick line for easier hit testing */}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={15} />
        {/* Visible line */}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeDasharray={dashArray} pointerEvents="none" />
      </g>
    );
  };

  const renderAnchor = (id: string, points: Point[], x: number, y: number, pointIndex: number, cursor: string = "pointer") => {
    if (activeTool !== "cursor") return null;
    const isSelected = selectedIds.includes(id);
    if (!isSelected) return null;

    return (
      <circle
        key={`${id}-anchor-${pointIndex}`}
        cx={x}
        cy={y}
        r={5}
        fill="#ffffff"
        stroke="#3b82f6"
        strokeWidth={2}
        style={{ pointerEvents: "all", cursor }}
        onMouseDown={(e) => handleShapeMouseDown(e, id, points, pointIndex)}
      />
    );
  };

  // Render SVG Elements
  return (
    <>
    <svg
      onMouseDown={handleSvgMouseDown}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: isShiftDown && activeTool === "cursor" ? "all" : "none",
        zIndex: 20,
      }}
    >
      {/* Selection Box overlay */}
      {selectionBox && containerRef.current && (
        <rect
          x={Math.min(selectionBox.startX, selectionBox.currentX) - containerRef.current.getBoundingClientRect().left}
          y={Math.min(selectionBox.startY, selectionBox.currentY) - containerRef.current.getBoundingClientRect().top}
          width={Math.abs(selectionBox.currentX - selectionBox.startX)}
          height={Math.abs(selectionBox.currentY - selectionBox.startY)}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="#3b82f6"
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
      )}

      {drawings.map((d) => {
        // Map points to SVG coordinates
        const coords = d.points.map((pt) => {
          let x = chart.timeScale().timeToCoordinate(pt.time as Time);
          
          if (x === null && validCandles && validCandles.length > 0) {
            // Snapping to nearest available candle in this timeframe
            const targetTime = pt.time as number;
            let closest = validCandles[0].time;
            let minDiff = Math.abs(closest - targetTime);
            for (let i = 1; i < validCandles.length; i++) {
              const diff = Math.abs(validCandles[i].time - targetTime);
              if (diff < minDiff) {
                minDiff = diff;
                closest = validCandles[i].time;
              }
            }
            x = chart.timeScale().timeToCoordinate(closest as Time);
          }
          
          const y = series.priceToCoordinate(pt.price);
          return { x, y };
        });

        // Filter out if coords are completely invalid
        if (coords.some((c) => c.x === null || c.y === null)) return null;

        if (d.type === "horizontal_line") {
          const y = coords[0].y!;
          return renderLineWithHitArea(d.id, d.points, 0, y, svgRect.width, y, d.color, "4 4");
        }

        if (d.type === "vertical_line") {
          const x = coords[0].x!;
          return renderLineWithHitArea(d.id, d.points, x, 0, x, svgRect.height, d.color, "4 4");
        }

        if (d.type === "text") {
          const isEditing = editingTextId === d.id;
          return (
            <g key={d.id}>
              {isEditing ? (
                <foreignObject x={coords[0].x!} y={coords[0].y! - 20} width="300" height="40" style={{ pointerEvents: 'all' }}>
                  <input
                    type="text"
                    defaultValue={d.text}
                    autoFocus
                    onBlur={(e) => {
                       const val = e.target.value;
                       if (!val.trim()) {
                         setDrawings(prev => prev.filter(x => x.id !== d.id));
                       } else {
                         setDrawings(prev => prev.map(item => item.id === d.id ? { ...item, text: val } : item));
                       }
                       setEditingTextId(null);
                    }}
                    onKeyDown={(e) => {
                       if (e.key === "Enter") {
                         e.currentTarget.blur();
                       }
                    }}
                    style={{
                       background: 'rgba(15, 19, 24, 0.8)',
                       border: `1px dashed ${d.color}`,
                       color: d.color,
                       outline: 'none',
                       fontSize: '14px',
                       fontFamily: 'sans-serif',
                       width: '100%',
                       padding: '2px 4px',
                       borderRadius: '4px'
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={coords[0].x!}
                  y={coords[0].y!}
                  fill={d.color}
                  fontSize="14"
                  fontFamily="sans-serif"
                  onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (activeTool === "cursor") {
                      setEditingTextId(d.id);
                    }
                  }}
                  style={{ pointerEvents: getPointerEvents(), cursor: getCursor(), userSelect: "none" }}
                >
                  {d.text}
                </text>
              )}
              {renderAnchor(d.id, d.points, coords[0].x!, coords[0].y!, 0, "move")}
            </g>
          );
        }

        if (coords.length < 2) return null; // Needs 2 points

        const p1 = coords[0];
        const p2 = coords[1];

        if (d.type === "trend_line") {
          return (
            <g key={d.id}>
              {renderLineWithHitArea(d.id, d.points, p1.x!, p1.y!, p2.x!, p2.y!, d.color)}
              {renderAnchor(d.id, d.points, p1.x!, p1.y!, 0, "pointer")}
              {renderAnchor(d.id, d.points, p2.x!, p2.y!, 1, "pointer")}
            </g>
          );
        }

        if (d.type === "ray") {
          let xEnd, yEnd;
          if (p2.x === p1.x) {
            xEnd = p1.x!;
            yEnd = p2.y! > p1.y! ? svgRect.height : 0;
          } else {
            const m = (p2.y! - p1.y!) / (p2.x! - p1.x!);
            xEnd = p2.x! > p1.x! ? svgRect.width : 0;
            yEnd = p1.y! + m * (xEnd - p1.x!);
            
            // Check boundaries
            if (yEnd < 0) {
              yEnd = 0;
              xEnd = p1.x! + (0 - p1.y!) / m;
            } else if (yEnd > svgRect.height) {
              yEnd = svgRect.height;
              xEnd = p1.x! + (svgRect.height - p1.y!) / m;
            }
          }
          return (
            <g key={d.id}>
              {renderLineWithHitArea(d.id, d.points, p1.x!, p1.y!, xEnd, yEnd, d.color)}
              {renderAnchor(d.id, d.points, p1.x!, p1.y!, 0, "pointer")}
              {renderAnchor(d.id, d.points, p2.x!, p2.y!, 1, "pointer")}
            </g>
          );
        }

        if (d.type === "rectangle") {
          const x = Math.min(p1.x!, p2.x!);
          const y = Math.min(p1.y!, p2.y!);
          const w = Math.abs(p2.x! - p1.x!);
          const h = Math.abs(p2.y! - p1.y!);
          
          return (
            <g key={d.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={`${d.color}33`} // 20% opacity
                stroke={d.color}
                strokeWidth={2}
                onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points)}
                style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }}
              />
              {/* Four corners for resizing */}
              {renderAnchor(d.id, d.points, p1.x!, p1.y!, 0, "nwse-resize")}
              {renderAnchor(d.id, d.points, p2.x!, p2.y!, 1, "nwse-resize")}
              {renderAnchor(d.id, d.points, p1.x!, p2.y!, 2, "nesw-resize")}
              {renderAnchor(d.id, d.points, p2.x!, p1.y!, 3, "nesw-resize")}
            </g>
          );
        }

        if (d.type === "fib_retracement") {
          const startX = Math.min(p1.x!, p2.x!);
          const endX = svgRect.width; // Extend to right edge
          const y1 = p1.y!;
          const y2 = p2.y!;
          
          const levels = [
            { v: 0, color: "#787b86" },
            { v: 0.236, color: "#f44336" },
            { v: 0.382, color: "#81c784" },
            { v: 0.5, color: "#4caf50" },
            { v: 0.618, color: "#009688" },
            { v: 0.786, color: "#64b5f6" },
            { v: 1, color: "#787b86" },
          ];

          return (
            <g key={d.id}>
              <g 
                onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points)}
                style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }}
              >
                {/* Invisible bounding rect for easy hit testing of the whole fib area */}
                <rect 
                  x={startX} 
                  y={Math.min(y1, y2)} 
                  width={endX - startX} 
                  height={Math.abs(y2 - y1)} 
                  fill="transparent" 
                />
                {/* Trendline connecting start to end */}
                <line x1={p1.x!} y1={p1.y!} x2={p2.x!} y2={p2.y!} stroke={d.color} strokeWidth={1} strokeDasharray="2 4" pointerEvents="none" />
                {levels.map((lvl) => {
                  const y = y1 + (y2 - y1) * lvl.v;
                  return (
                    <g key={`${d.id}-${lvl.v}`} pointerEvents="none">
                      <line x1={startX} x2={endX} y1={y} y2={y} stroke={lvl.color} strokeWidth={1} />
                      <text x={startX + 5} y={y - 4} fill={lvl.color} fontSize="10" fontFamily="monospace">
                        {lvl.v.toFixed(3)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {/* Anchor handles for Swing High / Swing Low */}
              {renderAnchor(d.id, d.points, p1.x!, p1.y!, 0, "ns-resize")}
              {renderAnchor(d.id, d.points, p2.x!, p2.y!, 1, "ns-resize")}
            </g>
          );
        }



        return null;
      })}
    </svg>
    {/* Floating Color Picker for Selected Item */}
    {selectedIds.length === 1 && (
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 19, 24, 0.9)',
          border: '1px solid #1e293b',
          borderRadius: '6px',
          padding: '6px',
          display: 'flex',
          gap: '8px',
          zIndex: 30,
          pointerEvents: 'all'
        }}
      >
        {['#ffffff', '#f87171', '#4ade80', '#60a5fa', '#facc15', '#c084fc'].map(c => (
          <div
            key={c}
            onClick={(e) => {
              e.stopPropagation();
              setDrawings(prev => prev.map(d => d.id === selectedIds[0] ? { ...d, color: c } : d));
            }}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: c,
              cursor: 'pointer',
              border: drawings.find(d => d.id === selectedIds[0])?.color === c ? '2px solid white' : '1px solid #334155'
            }}
          />
        ))}
      </div>
    )}
    </>
  );
}
