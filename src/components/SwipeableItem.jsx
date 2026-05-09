import React, { useState, useRef } from 'react';
import { Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { hapticFeedback } from '../utils/notifications';

export const SwipeableItem = ({ onEdit, onDeleteRequest, children, frontClass = "bg-slate-800 border-slate-700", wrapperClass = "mb-3", isDragDisabled = false }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleStart = (e) => {
    if (isDragDisabled || !e) return;
    try {
      const tagName = typeof e?.target?.tagName === 'string' ? e.target.tagName.toLowerCase() : '';
      if (['input', 'textarea', 'button', 'select'].includes(tagName)) return;
    } catch(err) {}

    const isMouse = typeof e?.type === 'string' && e.type.includes('mouse');
    const clientX = isMouse ? e.clientX : (e?.touches?.[0]?.clientX || 0);
    const clientY = isMouse ? e.clientY : (e?.touches?.[0]?.clientY || 0);

    startX.current = clientX;
    startY.current = clientY;
    isDragging.current = true;
    setIsSwiping(true);
  };

  const handleMove = (e) => {
    if (!isDragging.current || isDragDisabled || !e) return;

    const isMouse = typeof e?.type === 'string' && e.type.includes('mouse');
    const clientX = isMouse ? e.clientX : (e?.touches?.[0]?.clientX || 0);
    const clientY = isMouse ? e.clientY : (e?.touches?.[0]?.clientY || 0);

    const diffX = clientX - startX.current;
    const diffY = clientY - startY.current;

    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      isDragging.current = false;
      setOffset(0);
      return;
    }
    let newOffset = diffX;
    if (newOffset > 100) newOffset = 100 + (newOffset - 100) * 0.2;
    if (newOffset < -100) newOffset = -100 + (newOffset + 100) * 0.2;
    setOffset(newOffset);
  };

  const handleEnd = () => {
    if (isDragDisabled || !isDragging.current) return;
    isDragging.current = false;
    setIsSwiping(false);
    if (offset > 70) { hapticFeedback([30, 50]); onEdit(); }
    else if (offset < -70) { hapticFeedback([30, 50]); onDeleteRequest(); }
    setOffset(0);
  };

  return (
    <div className={`relative w-full rounded-xl bg-slate-900 overflow-hidden shadow-sm ${wrapperClass}`}>
      <div className="absolute inset-0 flex justify-between items-center px-4 rounded-xl font-medium text-white pointer-events-none">
        <div className={`flex items-center gap-2 transition-all duration-200 ${offset > 20 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'} text-blue-400`}>
          <Edit2 className="w-5 h-5" /> <span className="text-sm">Editar</span>
        </div>
        <div className={`flex items-center gap-2 transition-all duration-200 ${offset < -20 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'} text-red-500`}>
          <span className="text-sm">Excluir</span> <Trash2 className="w-5 h-5" />
        </div>
      </div>
      <div
        onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
        onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
        style={{ transform: `translateX(${offset}px)`, touchAction: isDragDisabled ? 'auto' : 'pan-y' }}
        className={`relative w-full rounded-xl border transition-transform ${!isSwiping ? 'duration-300 ease-out' : 'duration-0'} ${frontClass}`}
      >
        {children}
      </div>
    </div>
  );
};

export const SwipeHint = () => (
  <div className="flex items-center justify-center gap-2 mb-3 mt-1 text-slate-500 opacity-70 text-[10px] uppercase font-bold tracking-widest">
    <ChevronRight className="w-3 h-3 animate-pulse" />
    <span>Deslize para gerir</span>
    <ChevronLeft className="w-3 h-3 animate-pulse" />
  </div>
);
