import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Modal.css';
import { SUPPORTED_EXPORT_FORMATS, buildExportCanvas, estimateSizeKB, exportDocument } from '../../utils/exportDocument';

const FORMAT_OPTIONS = [
  { value: 'png',  label: 'PNG (with transparency)' },
  { value: 'jpeg', label: 'JPEG (no transparency)'  },
  { value: 'webp', label: 'WebP'                    },
];

export default function ExportModal({ isOpen, doc, layers, onClose, initialFormat = 'png' }) {
  const [format,    setFormat]    = useState(initialFormat || 'png');
  const [quality,   setQuality]   = useState(92);
  const [bgColor,   setBgColor]   = useState('#ffffff');
  const [filename,  setFilename]  = useState('export');
  const [sizeKB,    setSizeKB]    = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const estimateTimer = useRef(null);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen && doc) {
      const base = doc.name?.replace(/\.[^.]+$/, '') ?? 'export';
      setFilename(base);
      setFormat(initialFormat && SUPPORTED_EXPORT_FORMATS.includes(initialFormat) ? initialFormat : 'png');
      setQuality(92);
      setBgColor('#ffffff');
      setError('');
      setSizeKB(null);
    }
  }, [isOpen, doc, initialFormat]);

  // Debounced size estimate
  useEffect(() => {
    if (!isOpen || !doc || !layers) return;
    clearTimeout(estimateTimer.current);
    estimateTimer.current = setTimeout(() => {
      try {
        const bg     = format === 'jpeg' ? bgColor : null;
        const canvas = buildExportCanvas(doc, layers, bg);
        setSizeKB(estimateSizeKB(canvas, format, quality / 100));
      } catch {
        setSizeKB(null);
      }
    }, 350);
    return () => clearTimeout(estimateTimer.current);
  }, [isOpen, doc, layers, format, quality, bgColor]);

  const handleExport = useCallback(async () => {
    if (!doc) return;
    setExporting(true);
    setError('');
    try {
      await exportDocument(doc, layers, format, {
        filename,
        quality: quality / 100,
        bgColor: format === 'jpeg' ? bgColor : null,
      });
      onClose?.();
    } catch (err) {
      setError(err.message ?? 'Export failed.');
    } finally {
      setExporting(false);
    }
  }, [doc, layers, format, filename, quality, bgColor, onClose]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
  };

  if (!isOpen || !doc) return null;

  const visibleCount = layers?.filter(l => l.visible).length ?? 0;
  const ext = format === 'jpeg' ? 'jpg' : format;
  const canExport = SUPPORTED_EXPORT_FORMATS.includes(format);

  return (
    <div className="app-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="app-dialog-card"
        style={{ maxWidth: 420, width: '90vw' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        <div className="app-dialog-header">
          <h3 className="app-dialog-title" id="export-dialog-title">Export Image</h3>
          <button className="app-dialog-close-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        <div className="app-dialog-body">
          {/* Doc summary */}
          <div className="modal-info-box">
            <div className="modal-info-row">
              <span className="modal-info-label">Document</span>
              <span className="modal-info-val">{doc.name}</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-info-label">Dimensions</span>
              <span className="modal-info-val">{doc.width} × {doc.height} px</span>
            </div>
            <div className="modal-info-row">
              <span className="modal-info-label">Visible layers</span>
              <span className="modal-info-val">{visibleCount}</span>
            </div>
          </div>

          {/* Format */}
          <div className="modal-form-row">
            <label className="modal-form-label" htmlFor="export-format-sel">Format:</label>
            <div className="modal-form-input-group">
              <select
                id="export-format-sel"
                className="modal-input"
                style={{ width: '100%', textAlign: 'left', paddingRight: 4 }}
                value={format}
                onChange={e => { setFormat(e.target.value); setError(''); }}
              >
                {FORMAT_OPTIONS.map(opt => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={!SUPPORTED_EXPORT_FORMATS.includes(opt.value)}
                  >
                    {opt.label}{!SUPPORTED_EXPORT_FORMATS.includes(opt.value) ? ' (browser unsupported)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quality slider (JPEG / WebP) */}
          {(format === 'jpeg' || format === 'webp') && (
            <div className="modal-form-row">
              <label className="modal-form-label" htmlFor="export-quality-num">Quality:</label>
              <div className="modal-form-input-group">
                <input
                  type="range"
                  min={10} max={100}
                  value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  id="export-quality-num"
                  type="number"
                  min={10} max={100}
                  value={quality}
                  onChange={e => setQuality(Math.max(10, Math.min(100, Number(e.target.value))))}
                  className="modal-input"
                  style={{ width: 54 }}
                  onClick={e => e.stopPropagation()}
                />
                <span className="modal-input-unit">%</span>
              </div>
            </div>
          )}

          {/* Background color (JPEG only — fills transparent pixels) */}
          {format === 'jpeg' && (
            <div className="modal-form-row">
              <label className="modal-form-label" htmlFor="export-bg-col">Background:</label>
              <div className="modal-form-input-group">
                <input
                  id="export-bg-col"
                  type="color"
                  value={bgColor}
                  onChange={e => setBgColor(e.target.value)}
                  style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--border-standard)', borderRadius: 4, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fills transparent areas</span>
              </div>
            </div>
          )}

          {/* Filename */}
          <div className="modal-form-row">
            <label className="modal-form-label" htmlFor="export-filename-inp">Filename:</label>
            <div className="modal-form-input-group">
              <input
                id="export-filename-inp"
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                className="modal-input"
                style={{ flex: 1, width: 'auto', textAlign: 'left' }}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              />
              <span className="modal-input-unit">.{ext}</span>
            </div>
          </div>

          {/* Size estimate */}
          {sizeKB !== null && (
            <p className="modal-hint-text" style={{ textAlign: 'right' }}>
              Estimated file size: ~{sizeKB} KB
            </p>
          )}

          {/* PNG transparency note */}
          {format === 'png' && (
            <p className="modal-hint-text">✓ Transparent pixels are preserved in PNG output.</p>
          )}

          {!canExport && (
            <p className="modal-error-text">
              {format.toUpperCase()} is not supported by this browser.
            </p>
          )}

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
            onClick={handleExport}
            disabled={exporting || !canExport}
          >
            {exporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
