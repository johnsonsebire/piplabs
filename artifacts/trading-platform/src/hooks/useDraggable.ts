import { useState, useCallback, useRef, useEffect } from 'react';

interface Position {
  x: number;
  y: number;
}

export function useDraggable(initialPosition: Position = { x: 0, y: 0 }) {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLElement | null>(null);
  
  const startPos = useRef<Position>({ x: 0, y: 0 });
  const startMousePos = useRef<Position>({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent | MouseEvent) => {
    setIsDragging(true);
    startPos.current = position;
    startMousePos.current = { x: e.clientX, y: e.clientY };
  }, [position]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startMousePos.current.x;
    const dy = e.clientY - startMousePos.current.y;
    
    setPosition({
      x: startPos.current.x + dx,
      y: startPos.current.y + dy,
    });
  }, [isDragging]);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    } else {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, onMouseMove, onMouseUp]);

  return {
    position,
    isDragging,
    onMouseDown,
    dragRef,
  };
}
