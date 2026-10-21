import React, { useState, useEffect } from 'react';
import './Modal.css';

const ANCHOR_GRID = [
  { id: 'top-left', label: '↖', title: 'Top Left' },
  { id: 'top-center', label: '↑', title: 'Top Center' },
  { id: 'top-right', label: '↗', title: 'Top Right' },
  { id: 'center-left', label: '←', title: 'Center Left' },
  { id: 'center', label: '●', title: 'Center' },
  { id: 'center-right', label: '→', title: 'Center Right' },
  { id: 'bottom-left', label: '↙', title: 'Bottom Left' },
  { id: 'bottom-center', label: '↓', title: 'Bottom Center' },
  { id: 'bottom-right', label: '↘', title: 'Bottom Right' },
];

export default function CanvasSizeModal({ doc, isOpen, onClose, onApply }) {
  const [width, setWidth] = useState(doc?.width ?? 800);
  const [height, setHeight] = useState(doc?.height ?? 600);
  const [anchor, setAnchor] = useState('center');
  const [error, setError] = useState('');

  useEffect(() => {
    if (doc && isOpen) {
      setWidth(doc.width);
      setHeight(doc.height);
      setAnchor('center');
      setError('');
    }
  }, [doc, isOpen]);

  if (!isOpen || !doc) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSubmit = () => {
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);

    if (isNaN(w) || isNaN(h) || w < 1 || h < 1) {
      setError('Width and height must be positive numbers greater than 0.');
      return;
    }
    if (w > 10000 || h > 10000) {
      setError('Dimensions cannot exceed 10,000 pixels to prevent browser memory exhaustion.');
      return;
    }

    onApply(w, h, anchor);
    onClose();
  };

  const isExpanding = (parseInt(width, 10) || 0) > doc.width || (parseInt(height, 10) || 0) > doc.height;
  const isShrinking = (parseInt(width, 10) || 0) < doc.width || (parseInt(height, 10) || 0) < doc.height;

  return (
    <div className="app-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="app-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="app-dialog-header">
          <h3 className="app-dialog-title">Canvas Size</h3>
          <button
            className="app-dialog-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="app-dialog-body">
          <div className="modal-info-box">
            <div className="modal-info-row">
              <span className="modal-info-label">Current Dimensions:</span>
              <span className="modal-info-val">{doc.width} × {doc.height} px</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-info-label">Document:</span>
              <span className="modal-info-val">{doc.name}</span>
            </div>
          </div>

          <div className="modal-form-row">
            <label className="modal-form-label">New Width:</label>
            <div className="modal-form-input-group">
              <input
                type="number"
                min={1}
                max={10000}
                className="modal-input"
                value={width}
                onChange={(e) => { setWidth(e.target.value); setError(''); }}
                autoFocus
              />
              <span className="modal-input-unit">px</span>
            </div>
          </div>

          <div className="modal-form-row">
            <label className="modal-form-label">New Height:</label>
            <div className="modal-form-input-group">
              <input
                type="number"
                min={1}
                max={10000}
                className="modal-input"
                value={height}
                onChange={(e) => { setHeight(e.target.value); setError(''); }}
              />
              <span className="modal-input-unit">px</span>
            </div>
          </div>

          <div className="modal-form-row" style={{ alignItems: 'flex-start' }}>
            <label className="modal-form-label" style={{ marginTop: 8 }}>Anchor:</label>
            <div className="anchor-grid-container">
              <div className="anchor-grid" role="radiogroup" aria-label="Anchor position">
                {ANCHOR_GRID.map((cell) => (
                  <button
                    key={cell.id}
                    type="button"
                    className={`anchor-cell ${anchor === cell.id ? 'active' : ''}`}
                    onClick={() => setAnchor(cell.id)}
                    title={cell.title}
                    role="radio"
                    aria-checked={anchor === cell.id}
                  >
                    {cell.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="modal-hint-text">
            {isExpanding && 'Canvas expansion reveals transparent background pixels in the newly added areas.'}
            {isShrinking && 'Canvas reduction clips layer pixels outside the new boundaries while preserving original content.'}
            {!isExpanding && !isShrinking && 'Layers will be re-anchored within the document boundary.'}
          </p>

          {error && <p className="modal-error-text">{error}</p>}
        </div>

        <div className="app-dialog-footer">
          <button
            type="button"
            className="app-dialog-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-dialog-btn"
            onClick={handleSubmit}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
