import React from 'react';
import './StatusBar.css';

export default function StatusBar({
  zoomLevel = 100,
  onZoomChange,
  documentDimensions = null,
  cursorCoords = null
}) {
  return (
    <footer className="status-bar-container" aria-label="Status Bar">
      <div className="status-bar-left">
        <div className="status-item">
          <span className="status-indicator-dot" />
          <span>Ready</span>
        </div>

        <div className="status-item">
          <span>Doc:</span>
          <span className="status-dim-badge">
            {documentDimensions
              ? `${documentDimensions.width} × ${documentDimensions.height} px (${documentDimensions.dpi || 72} DPI)`
              : 'None (Drop image to start)'}
          </span>
        </div>
      </div>

      <div className="status-bar-right">
        <div className="status-item cursor-coords">
          {cursorCoords ? `X: ${cursorCoords.x} | Y: ${cursorCoords.y}` : 'X: -- | Y: --'}
        </div>

        <div className="status-item">
          <span style={{ color: 'var(--text-muted)' }}>sRGB (8-bit)</span>
        </div>

        <div className="status-item zoom-control-group">
          <span>Zoom:</span>
          <span className="zoom-percent-badge">{Math.round(zoomLevel)}%</span>
          <button
            className="zoom-quick-btn"
            onClick={() => onZoomChange && onZoomChange(100)}
            title="Reset Zoom to 100%"
          >
            100%
          </button>
          <button
            className="zoom-quick-btn"
            onClick={() => onZoomChange && onZoomChange('fit')}
            title="Fit canvas to viewport"
          >
            Fit
          </button>
        </div>
      </div>
    </footer>
  );
}
