import React, { useState, useEffect } from 'react';
import './Modal.css';
import { Link2, Unlink2 } from 'lucide-react';

export default function ImageSizeModal({ doc, isOpen, onClose, onApply }) {
  const [width, setWidth] = useState(doc?.width ?? 800);
  const [height, setHeight] = useState(doc?.height ?? 600);
  const [lockAspect, setLockAspect] = useState(true);
  const [error, setError] = useState('');

  const origRatio = doc && doc.height > 0 ? doc.width / doc.height : 1;

  useEffect(() => {
    if (doc && isOpen) {
      setWidth(doc.width);
      setHeight(doc.height);
      setLockAspect(true);
      setError('');
    }
  }, [doc, isOpen]);

  if (!isOpen || !doc) return null;

  const handleWidthChange = (val) => {
    const num = parseInt(val, 10);
    setWidth(isNaN(num) ? '' : num);
    setError('');
    if (lockAspect && !isNaN(num) && num > 0) {
      setHeight(Math.max(1, Math.round(num / origRatio)));
    }
  };

  const handleHeightChange = (val) => {
    const num = parseInt(val, 10);
    setHeight(isNaN(num) ? '' : num);
    setError('');
    if (lockAspect && !isNaN(num) && num > 0) {
      setWidth(Math.max(1, Math.round(num * origRatio)));
    }
  };

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

    onApply(w, h);
    onClose();
  };

  return (
    <div className="app-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="app-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="app-dialog-header">
          <h3 className="app-dialog-title">Image Size</h3>
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
              <span className="modal-info-label">Original Dimensions:</span>
              <span className="modal-info-val">{doc.width} × {doc.height} px</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-info-label">Document:</span>
              <span className="modal-info-val">{doc.name}</span>
            </div>
          </div>

          <div className="modal-form-row">
            <label className="modal-form-label">Width:</label>
            <div className="modal-form-input-group">
              <input
                type="number"
                min={1}
                max={10000}
                className="modal-input"
                value={width}
                onChange={(e) => handleWidthChange(e.target.value)}
                autoFocus
              />
              <span className="modal-input-unit">px</span>
            </div>
          </div>

          <div className="modal-form-row">
            <label className="modal-form-label">Height:</label>
            <div className="modal-form-input-group">
              <input
                type="number"
                min={1}
                max={10000}
                className="modal-input"
                value={height}
                onChange={(e) => handleHeightChange(e.target.value)}
              />
              <span className="modal-input-unit">px</span>
              <button
                type="button"
                className={`aspect-lock-btn ${lockAspect ? 'locked' : ''}`}
                onClick={() => setLockAspect(!lockAspect)}
                title={lockAspect ? 'Constrain Proportions (Locked)' : 'Do Not Constrain Proportions (Unlocked)'}
              >
                {lockAspect ? <Link2 size={14} /> : <Unlink2 size={14} />}
              </button>
            </div>
          </div>

          <p className="modal-hint-text">
            Resampling: High-quality bicubic canvas interpolation. All layers are rescaled proportionally.
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
