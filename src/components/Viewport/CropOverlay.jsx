import React, { useRef, useCallback } from 'react';
import './CropOverlay.css';
import { Check, X } from 'lucide-react';

/**
 * Aspect ratio helper.
 * Returns ratio number (w / h) or null for freeform.
 */
function getRatioValue(cropRatio, doc) {
  switch (cropRatio) {
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '16:9':
      return 16 / 9;
    case 'original':
      return doc ? doc.width / doc.height : 1;
    case 'free':
    default:
      return null;
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export default function CropOverlay({
  doc,
  zoom = 1,
  cropRect,
  onChangeCropRect,
  cropRatio = 'free',
  onApply,
  onCancel,
}) {
  const dragRef = useRef(null);

  const ratio = getRatioValue(cropRatio, doc);
  const minDim = 10; // minimum crop size in document pixels

  // ─── Pointer handlers ───────────────────────────────────────────────────

  const handlePointerDown = useCallback((e, mode, handleType = null) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    dragRef.current = {
      pointerId: e.pointerId,
      mode, // 'move' | 'handle' | 'draw'
      handleType,
      startX: e.clientX,
      startY: e.clientY,
      initialRect: { ...cropRect },
    };
  }, [cropRect]);

  const handleBackdropPointerDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    // Compute clicked doc position
    const rect = e.currentTarget.getBoundingClientRect();
    const docX = clamp((e.clientX - rect.left) / zoom, 0, doc.width);
    const docY = clamp((e.clientY - rect.top) / zoom, 0, doc.height);

    dragRef.current = {
      pointerId: e.pointerId,
      mode: 'draw',
      startX: e.clientX,
      startY: e.clientY,
      anchorDocX: docX,
      anchorDocY: docY,
      initialRect: { x: docX, y: docY, width: minDim, height: minDim },
    };

    onChangeCropRect({ x: docX, y: docY, width: minDim, height: minDim });
  }, [doc, zoom, minDim, onChangeCropRect]);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { mode, handleType, startX, startY, initialRect, anchorDocX, anchorDocY } = dragRef.current;

    const deltaX = (e.clientX - startX) / zoom;
    const deltaY = (e.clientY - startY) / zoom;

    if (mode === 'move') {
      const maxX = doc.width - initialRect.width;
      const maxY = doc.height - initialRect.height;
      const newX = clamp(initialRect.x + deltaX, 0, maxX);
      const newY = clamp(initialRect.y + deltaY, 0, maxY);

      onChangeCropRect({
        ...initialRect,
        x: Math.round(newX),
        y: Math.round(newY),
      });
      return;
    }

    if (mode === 'draw') {
      const curX = clamp(anchorDocX + deltaX, 0, doc.width);
      const curY = clamp(anchorDocY + deltaY, 0, doc.height);

      let x = Math.min(anchorDocX, curX);
      let y = Math.min(anchorDocY, curY);
      let w = Math.max(minDim, Math.abs(curX - anchorDocX));
      let h = Math.max(minDim, Math.abs(curY - anchorDocY));

      if (ratio) {
        // Constrain to ratio
        if (w / h > ratio) {
          w = h * ratio;
        } else {
          h = w / ratio;
        }
        if (x + w > doc.width) {
          w = doc.width - x;
          h = w / ratio;
        }
        if (y + h > doc.height) {
          h = doc.height - y;
          w = h * ratio;
        }
      }

      onChangeCropRect({
        x: Math.round(clamp(x, 0, doc.width - w)),
        y: Math.round(clamp(y, 0, doc.height - h)),
        width: Math.round(w),
        height: Math.round(h),
      });
      return;
    }

    if (mode === 'handle') {
      let { x, y, width: w, height: h } = initialRect;

      // Handle individual handles
      switch (handleType) {
        case 'se': {
          w = clamp(initialRect.width + deltaX, minDim, doc.width - x);
          h = clamp(initialRect.height + deltaY, minDim, doc.height - y);
          if (ratio) {
            h = w / ratio;
            if (y + h > doc.height) {
              h = doc.height - y;
              w = h * ratio;
            }
          }
          break;
        }
        case 'e': {
          w = clamp(initialRect.width + deltaX, minDim, doc.width - x);
          if (ratio) {
            h = w / ratio;
            if (y + h > doc.height) {
              h = doc.height - y;
              w = h * ratio;
            }
          }
          break;
        }
        case 's': {
          h = clamp(initialRect.height + deltaY, minDim, doc.height - y);
          if (ratio) {
            w = h * ratio;
            if (x + w > doc.width) {
              w = doc.width - x;
              h = w / ratio;
            }
          }
          break;
        }
        case 'nw': {
          const right = x + w;
          const bottom = y + h;
          x = clamp(initialRect.x + deltaX, 0, right - minDim);
          y = clamp(initialRect.y + deltaY, 0, bottom - minDim);
          w = right - x;
          h = bottom - y;
          if (ratio) {
            w = h * ratio;
            x = right - w;
            if (x < 0) {
              x = 0;
              w = right;
              h = w / ratio;
              y = bottom - h;
            }
          }
          break;
        }
        case 'ne': {
          const bottom = y + h;
          w = clamp(initialRect.width + deltaX, minDim, doc.width - x);
          y = clamp(initialRect.y + deltaY, 0, bottom - minDim);
          h = bottom - y;
          if (ratio) {
            h = w / ratio;
            y = bottom - h;
            if (y < 0) {
              y = 0;
              h = bottom;
              w = h * ratio;
            }
          }
          break;
        }
        case 'sw': {
          const right = x + w;
          x = clamp(initialRect.x + deltaX, 0, right - minDim);
          w = right - x;
          h = clamp(initialRect.height + deltaY, minDim, doc.height - y);
          if (ratio) {
            h = w / ratio;
            if (y + h > doc.height) {
              h = doc.height - y;
              w = h * ratio;
              x = right - w;
            }
          }
          break;
        }
        case 'n': {
          const bottom = y + h;
          y = clamp(initialRect.y + deltaY, 0, bottom - minDim);
          h = bottom - y;
          if (ratio) {
            w = h * ratio;
            if (x + w > doc.width) {
              w = doc.width - x;
              h = w / ratio;
              y = bottom - h;
            }
          }
          break;
        }
        case 'w': {
          const right = x + w;
          x = clamp(initialRect.x + deltaX, 0, right - minDim);
          w = right - x;
          if (ratio) {
            h = w / ratio;
            if (y + h > doc.height) {
              h = doc.height - y;
              w = h * ratio;
              x = right - w;
            }
          }
          break;
        }
        default:
          break;
      }

      onChangeCropRect({
        x: Math.round(clamp(x, 0, doc.width - minDim)),
        y: Math.round(clamp(y, 0, doc.height - minDim)),
        width: Math.round(Math.max(minDim, w)),
        height: Math.round(Math.max(minDim, h)),
      });
    }
  }, [doc, zoom, minDim, ratio, onChangeCropRect]);

  const handlePointerUp = useCallback((e) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(dragRef.current.pointerId);
      } catch {
        // pointer may have already been released
      }
      dragRef.current = null;
    }
  }, []);

  if (!doc || !cropRect) return null;

  // Scale compensation so handles and badges maintain constant on-screen size
  const invScale = 1 / Math.max(0.05, zoom);

  return (
    <div
      className="crop-overlay-root"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Click surface outside the crop box */}
      <div
        className="crop-backdrop-surface"
        onPointerDown={handleBackdropPointerDown}
      />

      {/* The active crop boundary box */}
      <div
        className="crop-box"
        style={{
          left: `${cropRect.x}px`,
          top: `${cropRect.y}px`,
          width: `${cropRect.width}px`,
          height: `${cropRect.height}px`,
        }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      >
        {/* Rule-of-Thirds Grid */}
        <div className="crop-grid-line h-1" />
        <div className="crop-grid-line h-2" />
        <div className="crop-grid-line v-1" />
        <div className="crop-grid-line v-2" />

        {/* Dimension Badge */}
        <div
          className="crop-dim-badge"
          style={{ transform: `translateX(-50%) scale(${invScale})` }}
        >
          {Math.round(cropRect.width)} × {Math.round(cropRect.height)} px
        </div>

        {/* Floating Quick Action Buttons */}
        <div
          className="crop-action-pill"
          style={{ transform: `scale(${invScale})`, transformOrigin: 'bottom right' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="crop-pill-btn apply"
            onClick={onApply}
            title="Commit Crop (Enter)"
          >
            <Check size={12} />
            <span>Apply</span>
          </button>
          <button
            className="crop-pill-btn cancel"
            onClick={onCancel}
            title="Cancel Crop (Esc)"
          >
            <X size={12} />
            <span>Cancel</span>
          </button>
        </div>

        {/* 8 Draggable Handles */}
        <div
          className="crop-handle crop-handle-corner nw"
          style={{ transform: `translate(-50%, -50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'nw')}
        />
        <div
          className="crop-handle crop-handle-edge-h n"
          style={{ transform: `translate(-50%, -50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'n')}
        />
        <div
          className="crop-handle crop-handle-corner ne"
          style={{ transform: `translate(50%, -50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'ne')}
        />
        <div
          className="crop-handle crop-handle-edge-v e"
          style={{ transform: `translate(50%, -50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'e')}
        />
        <div
          className="crop-handle crop-handle-corner se"
          style={{ transform: `translate(50%, 50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'se')}
        />
        <div
          className="crop-handle crop-handle-edge-h s"
          style={{ transform: `translate(-50%, 50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 's')}
        />
        <div
          className="crop-handle crop-handle-corner sw"
          style={{ transform: `translate(-50%, 50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'sw')}
        />
        <div
          className="crop-handle crop-handle-edge-v w"
          style={{ transform: `translate(-50%, -50%) scale(${invScale})` }}
          onPointerDown={(e) => handlePointerDown(e, 'handle', 'w')}
        />
      </div>
    </div>
  );
}
