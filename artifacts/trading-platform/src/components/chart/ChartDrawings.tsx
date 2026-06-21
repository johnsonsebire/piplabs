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
  width?: number;
  height?: number;
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
    pointIndex?: number,
    initialWidth?: number,
    initialHeight?: number
  } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);

  // Selection & Multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isBrushing, setIsBrushing] = useState(false);

  // Instant deselection when clicking the chart canvas (handles click+drag panning too)
  useEffect(() => {
    const handleCanvasMouseDown = (e: MouseEvent) => {
      if (activeTool === "cursor" && !isShiftDown) {
        if ((e.target as HTMLElement).tagName === "CANVAS") {
          setSelectedIds([]);
        }
      }
    };
    window.addEventListener("mousedown", handleCanvasMouseDown);
    return () => window.removeEventListener("mousedown", handleCanvasMouseDown);
  }, [activeTool, isShiftDown]);

  const clipboardRef = useRef<Drawing[]>([]);
  const selectedIdsRef = useRef(selectedIds);
  const drawingsRef = useRef(drawings);
  
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);

  // Keyboard events (Delete, Shift, Copy, Paste, Duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftDown(true);
      }

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIdsRef.current.length > 0) {
          setDrawings((prev) => prev.filter((d) => !selectedIdsRef.current.includes(d.id)));
          setSelectedIds([]);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const selected = drawingsRef.current.filter((d) => selectedIdsRef.current.includes(d.id));
        if (selected.length > 0) {
          clipboardRef.current = JSON.parse(JSON.stringify(selected));
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (clipboardRef.current.length > 0) {
          const newDrawings = clipboardRef.current.map((d) => ({
            ...d,
            id: Date.now().toString() + Math.random().toString(),
          }));
          setDrawings((prev) => [...prev, ...newDrawings]);
          setSelectedIds(newDrawings.map((d) => d.id));
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault(); // Prevent browser bookmark
        const selected = drawingsRef.current.filter((d) => selectedIdsRef.current.includes(d.id));
        if (selected.length > 0) {
          const newDrawings = JSON.parse(JSON.stringify(selected)).map((d: Drawing) => ({
            ...d,
            id: Date.now().toString() + Math.random().toString(),
          }));
          setDrawings((prev) => [...prev, ...newDrawings]);
          setSelectedIds(newDrawings.map((d: Drawing) => d.id));
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
  }, [setDrawings]);

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

  // Helper: given a stored time value (which may be a future-extrapolated timestamp),
  // return its pixel X coordinate on the chart.
  // For past candles this is a direct API lookup; for future timestamps we extrapolate
  // using the same pixels-per-bar calculation as the renderer.
  const timeToPixelX = (time: number): number | null => {
    if (!chart) return null;
    const x = chart.timeScale().timeToCoordinate(time as Time);
    if (x !== null) return x;
    // Future point — extrapolate
    if (validCandles && validCandles.length >= 2) {
      const lastCandle = validCandles[validCandles.length - 1];
      const secondLast = validCandles[validCandles.length - 2];
      const interval = (lastCandle.time as number) - (secondLast.time as number);
      const lastX = chart.timeScale().timeToCoordinate(lastCandle.time as Time);
      const secondLastX = chart.timeScale().timeToCoordinate(secondLast.time as Time);
      if (lastX !== null && secondLastX !== null && interval > 0) {
        const pixelsPerBar = Math.abs(lastX - secondLastX);
        const barsAhead = (time - (lastCandle.time as number)) / interval;
        return lastX + barsAhead * pixelsPerBar;
      }
    }
    return null;
  };

  // Helper: given a pixel X coordinate, return the chart timestamp it represents.
  // For coordinates inside the chart data range, use the chart API directly.
  // For coordinates to the right of the last candle, extrapolate via pixels-per-bar
  // so that future positions are always resolvable regardless of how far right the cursor goes.
  const pixelXToTime = (pixelX: number): number | null => {
    if (!chart) return null;
    const t = chart.timeScale().coordinateToTime(pixelX);
    if (t !== null) return t as number;
    // Extrapolate into the future from pixel position
    if (validCandles && validCandles.length >= 2) {
      const lastCandle = validCandles[validCandles.length - 1];
      const secondLast = validCandles[validCandles.length - 2];
      const interval = (lastCandle.time as number) - (secondLast.time as number);
      const lastX = chart.timeScale().timeToCoordinate(lastCandle.time as Time);
      const secondLastX = chart.timeScale().timeToCoordinate(secondLast.time as Time);
      if (lastX !== null && secondLastX !== null && interval > 0) {
        const pixelsPerBar = Math.abs(lastX - secondLastX);
        if (pixelsPerBar > 0 && pixelX >= lastX) {
          const barsAhead = (pixelX - lastX) / pixelsPerBar;
          return (lastCandle.time as number) + Math.round(barsAhead) * interval;
        }
      }
    }
    return null;
  };

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

        if (pointIndex === 999 && d.type === "text") {
          const w = dragStateRef.current?.initialWidth ?? 100;
          const h = dragStateRef.current?.initialHeight ?? 40;
          return {
            ...d,
            width: Math.max(50, w + dx),
            height: Math.max(30, h + dy)
          };
        }

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
            // Use timeToPixelX which handles both past candles and future-extrapolated points
            const currentX = timeToPixelX(pt.time);
            if (currentX !== null) {
              const targetX = currentX + dx;
              const newT = pixelXToTime(targetX);
              if (newT !== null) {
                newTime = newT;
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
  }, [isDragging, chart, series, setDrawings, validCandles]);

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

  const resolveTimeFromParam = (param: any): number | null => {
    if (!chart || !series) return null;
    if (param.time) return param.time as number;
    
    if (param.point) {
      // Use pixelXToTime which handles both in-data and future positions
      return pixelXToTime(param.point.x);
    }
    return null;
  };


  // Handle Chart Clicks and Crosshair moves for creation
  useEffect(() => {
    if (!chart || !series) return;

    const handleClick = (param: any) => {
      // Don't create if we are dragging or clicking on an existing shape
      if (dragStateRef.current) return;

      if (activeTool === "cursor" || activeTool === "brush") {
        if (!isShiftDown && activeTool === "cursor") {
          setSelectedIds([]); // Clear selection when clicking empty chart space
        }
        return;
      }

      if (!param.point) return;
      const time = resolveTimeFromParam(param);
      if (time === null) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

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
          
          if (active.type === "long_position" || active.type === "short_position") {
            const entryTime = active.points[0].time;
            const entryPrice = active.points[0].price;
            const exitTime = time;
            
            // Generate default TP and SL (2% reward, 1% risk based on entry price)
            const risk = entryPrice * 0.01;
            const reward = entryPrice * 0.02;
            
            const tpPrice = active.type === "long_position" ? entryPrice + reward : entryPrice - reward;
            const slPrice = active.type === "long_position" ? entryPrice - risk : entryPrice + risk;
            
            return prev.map(d => d.id === active.id ? { 
               ...d, 
               points: [
                 { time: entryTime, price: entryPrice }, // p0: Entry
                 { time: exitTime, price: entryPrice },  // p1: Exit Time (determines width)
                 { time: entryTime, price: tpPrice },    // p2: Take Profit
                 { time: entryTime, price: slPrice }     // p3: Stop Loss
               ],
               completed: true 
            } : d);
          }
          
          return prev.map((d) =>
            d.id === active.id ? { ...d, points: [...d.points, { time, price }], completed: true } : d
          );
        }
      });
    };

    const handleCrosshairMove = (param: any) => {
      if (!currentDrawingRef.current || !param.point) return;

      const time = resolveTimeFromParam(param);
      if (time === null) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

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

  const handleShapeMouseDown = (e: React.MouseEvent, id: string, points: Point[], pointIndex?: number, explicitWidth?: number, explicitHeight?: number) => {
    if (activeTool !== "cursor") return;
    e.stopPropagation();

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    } else {
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
    }
    
    const targetDrawing = drawings.find(d => d.id === id);
    dragStateRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      initialPoints: [...points],
      pointIndex,
      initialWidth: explicitWidth ?? targetDrawing?.width,
      initialHeight: explicitHeight ?? targetDrawing?.height
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
    } else if (activeTool === "brush") {
      setIsBrushing(true);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const time = pixelXToTime(x);
        const price = series.coordinateToPrice(y);
        if (time !== null && price !== null) {
          const newDrawing: Drawing = {
            id: Date.now().toString(),
            type: "brush",
            points: [{ time, price }],
            color: "#3b82f6",
            completed: false,
          };
          currentDrawingRef.current = newDrawing;
          setDrawings(prev => [...prev, newDrawing]);
        }
      }
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (activeTool === "brush" && isBrushing && currentDrawingRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = pixelXToTime(x);
      const price = series.coordinateToPrice(y);
      
      if (time !== null && price !== null) {
        setDrawings(prev => prev.map(d => {
          if (d.id === currentDrawingRef.current?.id) {
            // Decimate points slightly to optimize brush rendering
            const lastPt = d.points[d.points.length - 1];
            const dist = Math.sqrt(Math.pow((lastPt.time as number) - time, 2) + Math.pow(lastPt.price - price, 2));
            if (dist > 0) { // Add point if moved
               return { ...d, points: [...d.points, { time, price }] };
            }
          }
          return d;
        }));
      }
    }
  };

  const handleSvgMouseUp = () => {
    if (activeTool === "brush" && isBrushing) {
      setIsBrushing(false);
      if (currentDrawingRef.current) {
        setDrawings(prev => prev.map(d => d.id === currentDrawingRef.current?.id ? { ...d, completed: true } : d));
        currentDrawingRef.current = null;
      }
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

  // Determine right price-scale pixel width so the SVG overlay doesn't obscure it.
  // IPriceScaleApi.width() is the public lightweight-charts v4+ API.
  const rightAxisWidth = (() => {
    if (!chart) return 60;
    try {
      const w = chart.priceScale('right').width();
      if (typeof w === 'number' && w > 0) return w;
    } catch { /* fall through */ }
    return 60;
  })();

  // Render SVG Elements
  return (
    <>
    <svg
      onMouseDown={handleSvgMouseDown}
      onMouseMove={handleSvgMouseMove}
      onMouseUp={handleSvgMouseUp}
      onMouseLeave={handleSvgMouseUp}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        // Clip right so drawings don't cover the price scale
        width: `calc(100% - ${rightAxisWidth}px)`,
        height: "100%",
        overflow: "hidden",
        pointerEvents: (isShiftDown && activeTool === "cursor") || activeTool === "brush" ? "all" : "none",
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
        // For points in the future (beyond the last candle), extrapolate pixel X
        const coords = d.points.map((pt) => {
          let x: number | null = chart.timeScale().timeToCoordinate(pt.time as Time);

          if (x === null && validCandles && validCandles.length >= 2) {
            // The point is in the future — extrapolate pixel X from candle interval
            const lastCandle = validCandles[validCandles.length - 1];
            const secondLast = validCandles[validCandles.length - 2];
            const interval = (lastCandle.time as number) - (secondLast.time as number);

            const lastX = chart.timeScale().timeToCoordinate(lastCandle.time as Time);
            if (lastX !== null && interval > 0) {
              // How many intervals past the last candle?
              const barsAhead = ((pt.time as number) - (lastCandle.time as number)) / interval;

              // Determine pixels-per-bar from the timeScale
              const secondLastX = chart.timeScale().timeToCoordinate(secondLast.time as Time);
              if (secondLastX !== null) {
                const pixelsPerBar = Math.abs(lastX - secondLastX);
                x = lastX + barsAhead * pixelsPerBar;
              }
            }
          }

          const y = series.priceToCoordinate(pt.price);
          return { x, y };
        });

        // Filter out if y-coordinate is invalid (price out of view is ok, x must resolve)
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
          const textLines = (d.text || "").split("\n");
          const maxLineLen = Math.max(...textLines.map(l => l.length), 10);
          const width = d.width ?? Math.max(100, maxLineLen * 8 + 24);
          const height = d.height ?? Math.max(40, textLines.length * 18 + 24);
          
          return (
            <g key={d.id}>
              {isEditing ? (
                <foreignObject x={coords[0].x!} y={coords[0].y!} width={Math.max(width, 300)} height={Math.max(height, 150)} style={{ pointerEvents: 'all' }}>
                  <textarea
                    defaultValue={d.text === "Text" ? "" : d.text}
                    autoFocus
                    placeholder="Enter your note..."
                    onBlur={(e) => {
                       const val = e.target.value;
                       if (!val.trim()) {
                         setDrawings(prev => prev.filter(x => x.id !== d.id));
                       } else {
                         setDrawings(prev => prev.map(item => item.id === d.id ? { ...item, text: val } : item));
                       }
                       setEditingTextId(null);
                    }}
                    style={{
                       background: 'rgba(15, 19, 24, 0.95)',
                       border: `1px solid ${d.color}`,
                       color: d.color,
                       outline: 'none',
                       fontSize: '13px',
                       fontFamily: 'monospace',
                       width: '100%',
                       height: '100%',
                       padding: '8px',
                       borderRadius: '6px',
                       resize: 'none',
                       boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                </foreignObject>
              ) : (
                <foreignObject 
                  x={coords[0].x!} 
                  y={coords[0].y!} 
                  width={width} 
                  height={height}
                  onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (activeTool === "cursor") setEditingTextId(d.id);
                  }}
                  style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }}
                >
                  <div style={{
                    background: `${d.color}20`,
                    borderLeft: `3px solid ${d.color}`,
                    color: '#e2e8f0',
                    padding: '8px 12px',
                    borderRadius: '0 6px 6px 0',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    lineHeight: '1.4',
                    whiteSpace: 'pre-wrap',
                    backdropFilter: 'blur(4px)',
                    height: '100%',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}>
                    {d.text}
                  </div>
                </foreignObject>
              )}
              {/* Move Handle */}
              {renderAnchor(d.id, d.points, coords[0].x!, coords[0].y!, 0, "move")}
              {/* Resize Handle */}
              {selectedIds.includes(d.id) && activeTool === "cursor" && (
                <circle
                  cx={coords[0].x! + width}
                  cy={coords[0].y! + height}
                  r={5}
                  fill="#ffffff"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points, 999, width, height)}
                  style={{ cursor: 'nwse-resize', pointerEvents: 'all' }}
                />
              )}
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
        if (d.type === "brush") {
          const pathD = "M " + coords.map(c => `${c.x},${c.y}`).join(" L ");
          return (
            <g key={d.id} onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points)}>
               <path d={pathD} fill="none" stroke={d.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }} />
               {/* Invisible wider path for hit area */}
               <path d={pathD} fill="none" stroke="transparent" strokeWidth={15} style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }} />
            </g>
          );
        }

        if (d.type === "long_position" || d.type === "short_position") {
          if (coords.length < 4) return null;
          const xStart = Math.min(coords[0].x!, coords[1].x!);
          const width = Math.max(20, Math.abs(coords[1].x! - coords[0].x!));
          const yEntry = coords[0].y!;
          const yTp = coords[2].y!;
          const ySl = coords[3].y!;
          
          const isLong = d.type === "long_position";
          
          const pEntry = d.points[0].price;
          const pTp = d.points[2].price;
          const pSl = d.points[3].price;
          
          // Profit box
          const profitY = Math.min(yEntry, yTp);
          const profitH = Math.abs(yEntry - yTp);
          const profitColor = isLong ? "rgba(34, 197, 94, 0.25)" : "rgba(34, 197, 94, 0.25)"; 
          
          // Loss box
          const lossY = Math.min(yEntry, ySl);
          const lossH = Math.abs(yEntry - ySl);
          const lossColor = "rgba(239, 68, 68, 0.25)";
          
          const riskPrice = Math.abs(pEntry - pSl);
          const rewardPrice = Math.abs(pEntry - pTp);
          const rrRatio = riskPrice > 0 ? (rewardPrice / riskPrice).toFixed(2) : "0.00";
          const profitPct = ((rewardPrice / pEntry) * 100).toFixed(2);
          const lossPct = ((riskPrice / pEntry) * 100).toFixed(2);
          
          return (
             <g key={d.id}>
               <g onMouseDown={(e) => handleShapeMouseDown(e, d.id, d.points)} style={{ pointerEvents: getPointerEvents(), cursor: getCursor() }}>
                  {/* Target Box */}
                  <rect x={xStart} y={profitY} width={width} height={profitH} fill={profitColor} stroke="rgba(34, 197, 94, 0.5)" strokeWidth={1} />
                  <text x={xStart + width/2} y={profitY + profitH/2} fill="#22c55e" fontSize="10" fontFamily="monospace" textAnchor="middle" alignmentBaseline="middle" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    Target: {pTp.toFixed(5)} ({profitPct}%)
                  </text>
                  
                  {/* Stop Box */}
                  <rect x={xStart} y={lossY} width={width} height={lossH} fill={lossColor} stroke="rgba(239, 68, 68, 0.5)" strokeWidth={1} />
                  <text x={xStart + width/2} y={lossY + lossH/2} fill="#ef4444" fontSize="10" fontFamily="monospace" textAnchor="middle" alignmentBaseline="middle" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    Stop: {pSl.toFixed(5)} ({lossPct}%)
                  </text>
                  
                  {/* Entry Line & Badge */}
                  <line x1={xStart} y1={yEntry} x2={xStart + width} y2={yEntry} stroke={d.color} strokeWidth={2} />
                  <rect x={xStart + width/2 - 25} y={yEntry - 8} width={50} height={16} fill={d.color} rx={2} />
                  <text x={xStart + width/2} y={yEntry + 3} fill="#000" fontSize="9" fontFamily="monospace" textAnchor="middle" style={{ pointerEvents: 'none', fontWeight: 'bold' }}>
                    R/R: {rrRatio}
                  </text>
               </g>
               
               {/* Anchors */}
               {renderAnchor(d.id, d.points, xStart, yEntry, 0, "move")}
               {renderAnchor(d.id, d.points, coords[1].x!, yEntry, 1, "ew-resize")}
               {renderAnchor(d.id, d.points, xStart + width/2, yTp, 2, "ns-resize")}
               {renderAnchor(d.id, d.points, xStart + width/2, ySl, 3, "ns-resize")}
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
          top: '50px',
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
