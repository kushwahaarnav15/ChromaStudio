import React from 'react';
import './SelectionOverlay.css';

/**
 * SelectionOverlay — Renders animated marching-ants outline and tinted area
 * for active rectangular or elliptical selections in document space.
 *
 * Keeps stroke width normalized to 1 screen pixel across all viewport zoom levels.
 */
export default function SelectionOverlay({
  doc,
  zoom = 1,
  selection = null,
  activeSelectionDrag = null,
}) {
  const sel = activeSelectionDrag || selection;
  if (!doc || !sel || sel.width <= 0 || sel.height <= 0) return null;

  const strokeW = 1.2 / zoom;
  const dashLen = 4 / zoom;
  const dashArray = `${dashLen} ${dashLen}`;

  const isEllipse = sel.type === 'ellipse';
  const cx = sel.x + sel.width / 2;
  const cy = sel.y + sel.height / 2;
  const rx = sel.width / 2;
  const ry = sel.height / 2;

  // Mask path for inverted selection
  let invertCutPath = '';
  if (sel.inverted) {
    if (isEllipse) {
      invertCutPath = `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
    } else {
      invertCutPath = `M ${sel.x} ${sel.y} H ${sel.x + sel.width} V ${sel.y + sel.height} H ${sel.x} Z`;
    }
  }

  return (
    <svg
      className="selection-overlay-svg"
      width={doc.width}
      height={doc.height}
      viewBox={`0 0 ${doc.width} ${doc.height}`}
      aria-hidden="true"
    >
      {/* If inverted: tint outside the selection */}
      {sel.inverted ? (
        <path
          d={`M 0 0 H ${doc.width} V ${doc.height} H 0 Z ${invertCutPath}`}
          fill="rgba(0, 0, 0, 0.4)"
          fillRule="evenodd"
        />
      ) : (
        /* Normal: subtle highlight inside the selection */
        isEllipse ? (
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="rgba(0, 120, 212, 0.08)"
          />
        ) : (
          <rect
            x={sel.x}
            y={sel.y}
            width={sel.width}
            height={sel.height}
            fill="rgba(0, 120, 212, 0.08)"
          />
        )
      )}

      {/* Marching Ants: Black Dashed Base */}
      {isEllipse ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="#000000"
          strokeWidth={strokeW}
          strokeDasharray={dashArray}
          className="selection-ants-black"
        />
      ) : (
        <rect
          x={sel.x}
          y={sel.y}
          width={sel.width}
          height={sel.height}
          fill="none"
          stroke="#000000"
          strokeWidth={strokeW}
          strokeDasharray={dashArray}
          className="selection-ants-black"
        />
      )}

      {/* Marching Ants: White Dashed Inverted Offset */}
      {isEllipse ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="#ffffff"
          strokeWidth={strokeW}
          strokeDasharray={dashArray}
          className="selection-ants-white"
        />
      ) : (
        <rect
          x={sel.x}
          y={sel.y}
          width={sel.width}
          height={sel.height}
          fill="none"
          stroke="#ffffff"
          strokeWidth={strokeW}
          strokeDasharray={dashArray}
          className="selection-ants-white"
        />
      )}
    </svg>
  );
}
