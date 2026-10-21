import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Modal.css';
import { executeFilter } from '../../utils/filterEngine';

export default function FilterModal({
  isOpen,
  filterType,
  filterTitle,
  activeLayer,
  doc,
  selection,
  onClose,
  onApply,
  onPreview,
  onClearPreview,
}) {
  // ─── Filter parameters state ───────────────────────────────────────────────
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [lightness, setLightness] = useState(0);
  const [blurRadius, setBlurRadius] = useState(3);
  const [sharpenStrength, setSharpenStrength] = useState(1.0);
  const [grayscaleAmount, setGrayscaleAmount] = useState(100);
  const [sepiaAmount, setSepiaAmount] = useState(100);

  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  // Keep track of the latest rendered bitmap so Apply can commit immediately
  const latestProcessedBitmapRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const computationIdRef = useRef(0);

  // Reset parameters when opening a filter
  useEffect(() => {
    if (isOpen) {
      setBrightness(0);
      setContrast(0);
      setHue(0);
      setSaturation(0);
      setLightness(0);
      setBlurRadius(3);
      setSharpenStrength(1.0);
      setGrayscaleAmount(100);
      setSepiaAmount(100);
      setPreviewEnabled(true);
      setError('');
      latestProcessedBitmapRef.current = null;
    } else {
      // Clear preview when closing modal
      if (onClearPreview) {
        onClearPreview();
      }
    }
  }, [isOpen, filterType, onClearPreview]);

  // Construct options payload for current filter
  const getFilterOptions = useCallback(() => {
    switch (filterType) {
      case 'brightness-contrast':
        return { brightness, contrast };
      case 'hue-saturation':
        return { hue, saturation, lightness };
      case 'blur':
        return { radius: blurRadius };
      case 'sharpen':
        return { strength: sharpenStrength };
      case 'grayscale':
        return { amount: grayscaleAmount / 100 };
      case 'sepia':
        return { amount: sepiaAmount / 100 };
      case 'invert':
      default:
        return {};
    }
  }, [
    filterType,
    brightness,
    contrast,
    hue,
    saturation,
    lightness,
    blurRadius,
    sharpenStrength,
    grayscaleAmount,
    sepiaAmount,
  ]);

  // Run filter calculation and optionally dispatch to preview
  const runFilterComputation = useCallback(
    async (shouldUpdatePreview = true) => {
      if (!activeLayer || !activeLayer.imageBitmap) return null;

      const currentComputationId = ++computationIdRef.current;
      setIsProcessing(true);
      setError('');

      try {
        const options = {
          ...getFilterOptions(),
          selection,
          doc,
          layerOffset: { x: activeLayer.x, y: activeLayer.y },
        };
        const resultBitmap = await executeFilter(
          activeLayer.imageBitmap,
          filterType,
          options
        );

        // Check if a newer computation has already been triggered
        if (currentComputationId !== computationIdRef.current) {
          resultBitmap.close?.();
          return null;
        }

        latestProcessedBitmapRef.current = resultBitmap;
        setIsProcessing(false);

        if (shouldUpdatePreview && previewEnabled && onPreview) {
          onPreview(resultBitmap);
        }

        return resultBitmap;
      } catch (err) {
        if (currentComputationId === computationIdRef.current) {
          setIsProcessing(false);
          setError(err.message || 'Error processing filter');
        }
        return null;
      }
    },
    [activeLayer, filterType, getFilterOptions, previewEnabled, onPreview, doc, selection]
  );

  // Trigger debounced preview update whenever options or preview toggle change
  useEffect(() => {
    if (!isOpen || !activeLayer?.imageBitmap) return;

    if (!previewEnabled) {
      if (onClearPreview) onClearPreview();
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce preview computation to keep UI completely responsive
    debounceTimerRef.current = setTimeout(() => {
      runFilterComputation(true);
    }, 60);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    isOpen,
    previewEnabled,
    activeLayer,
    brightness,
    contrast,
    hue,
    saturation,
    lightness,
    blurRadius,
    sharpenStrength,
    grayscaleAmount,
    sepiaAmount,
    onClearPreview,
    runFilterComputation,
  ]);

  if (!isOpen || !activeLayer) return null;

  const handleApply = async () => {
    let finalBitmap = latestProcessedBitmapRef.current;
    if (!finalBitmap) {
      finalBitmap = await runFilterComputation(false);
    }

    if (finalBitmap && onApply) {
      onApply(finalBitmap);
    }
    onClose();
  };

  const handleCancel = () => {
    if (onClearPreview) {
      onClearPreview();
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="app-modal-backdrop" onClick={handleCancel} onKeyDown={handleKeyDown}>
      <div className="app-dialog-card" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        {/* Header */}
        <div className="app-dialog-header">
          <h3 className="app-dialog-title">{filterTitle || 'Filter Adjustment'}</h3>
          <button
            className="app-dialog-close-btn"
            onClick={handleCancel}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="app-dialog-body">
          {/* Target Layer Info */}
          <div className="modal-info-box">
            <div className="modal-info-row">
              <span className="modal-info-label">Active Layer:</span>
              <span className="modal-info-val">{activeLayer.name}</span>
            </div>
            {activeLayer.imageBitmap && (
              <div className="modal-info-row">
                <span className="modal-info-label">Dimensions:</span>
                <span className="modal-info-val">
                  {activeLayer.width} × {activeLayer.height} px
                </span>
              </div>
            )}
          </div>

          {!activeLayer.imageBitmap ? (
            <p className="modal-hint-text">
              This layer contains no pixel data. Filters can only be applied to layers with pixel content.
            </p>
          ) : (
            <>
              {/* Filter-specific Controls */}
              <div className="filter-control-group">
                {/* 1. Brightness & Contrast */}
                {filterType === 'brightness-contrast' && (
                  <>
                    <div className="filter-slider-row">
                      <div className="filter-slider-header">
                        <span className="filter-slider-label">Brightness:</span>
                        <span className="filter-slider-val">
                          {brightness > 0 ? `+${brightness}` : brightness}
                        </span>
                      </div>
                      <div className="filter-slider-input-wrap">
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={brightness}
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="filter-slider"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="filter-slider-row">
                      <div className="filter-slider-header">
                        <span className="filter-slider-label">Contrast:</span>
                        <span className="filter-slider-val">
                          {contrast > 0 ? `+${contrast}` : contrast}
                        </span>
                      </div>
                      <div className="filter-slider-input-wrap">
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={contrast}
                          onChange={(e) => setContrast(Number(e.target.value))}
                          className="filter-slider"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Hue & Saturation */}
                {filterType === 'hue-saturation' && (
                  <>
                    <div className="filter-slider-row">
                      <div className="filter-slider-header">
                        <span className="filter-slider-label">Hue:</span>
                        <span className="filter-slider-val">
                          {hue > 0 ? `+${hue}°` : `${hue}°`}
                        </span>
                      </div>
                      <div className="filter-slider-input-wrap">
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          value={hue}
                          onChange={(e) => setHue(Number(e.target.value))}
                          className="filter-slider"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="filter-slider-row">
                      <div className="filter-slider-header">
                        <span className="filter-slider-label">Saturation:</span>
                        <span className="filter-slider-val">
                          {saturation > 0 ? `+${saturation}%` : `${saturation}%`}
                        </span>
                      </div>
                      <div className="filter-slider-input-wrap">
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={saturation}
                          onChange={(e) => setSaturation(Number(e.target.value))}
                          className="filter-slider"
                        />
                      </div>
                    </div>

                    <div className="filter-slider-row">
                      <div className="filter-slider-header">
                        <span className="filter-slider-label">Lightness:</span>
                        <span className="filter-slider-val">
                          {lightness > 0 ? `+${lightness}%` : `${lightness}%`}
                        </span>
                      </div>
                      <div className="filter-slider-input-wrap">
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={lightness}
                          onChange={(e) => setLightness(Number(e.target.value))}
                          className="filter-slider"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 3. Gaussian Blur */}
                {filterType === 'blur' && (
                  <div className="filter-slider-row">
                    <div className="filter-slider-header">
                      <span className="filter-slider-label">Radius:</span>
                      <span className="filter-slider-val">{blurRadius} px</span>
                    </div>
                    <div className="filter-slider-input-wrap">
                      <input
                        type="range"
                        min={1}
                        max={25}
                        value={blurRadius}
                        onChange={(e) => setBlurRadius(Number(e.target.value))}
                        className="filter-slider"
                        autoFocus
                      />
                    </div>
                    <p className="modal-hint-text">
                      Separable 2-pass Gaussian kernel with alpha weighting to prevent dark edge fringes.
                    </p>
                  </div>
                )}

                {/* 4. Sharpen */}
                {filterType === 'sharpen' && (
                  <div className="filter-slider-row">
                    <div className="filter-slider-header">
                      <span className="filter-slider-label">Amount:</span>
                      <span className="filter-slider-val">
                        {Math.round(sharpenStrength * 100)}%
                      </span>
                    </div>
                    <div className="filter-slider-input-wrap">
                      <input
                        type="range"
                        min={0.2}
                        max={3.0}
                        step={0.1}
                        value={sharpenStrength}
                        onChange={(e) => setSharpenStrength(Number(e.target.value))}
                        className="filter-slider"
                        autoFocus
                      />
                    </div>
                    <p className="modal-hint-text">
                      3×3 normalized Laplacian unsharp convolution kernel preserving overall scene luminance.
                    </p>
                  </div>
                )}

                {/* 5. Grayscale */}
                {filterType === 'grayscale' && (
                  <div className="filter-slider-row">
                    <div className="filter-slider-header">
                      <span className="filter-slider-label">Intensity:</span>
                      <span className="filter-slider-val">{grayscaleAmount}%</span>
                    </div>
                    <div className="filter-slider-input-wrap">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={grayscaleAmount}
                        onChange={(e) => setGrayscaleAmount(Number(e.target.value))}
                        className="filter-slider"
                        autoFocus
                      />
                    </div>
                    <p className="modal-hint-text">
                      ITU-R BT.601 standard photometric luminance conversion (0.299R + 0.587G + 0.114B).
                    </p>
                  </div>
                )}

                {/* 6. Sepia */}
                {filterType === 'sepia' && (
                  <div className="filter-slider-row">
                    <div className="filter-slider-header">
                      <span className="filter-slider-label">Intensity:</span>
                      <span className="filter-slider-val">{sepiaAmount}%</span>
                    </div>
                    <div className="filter-slider-input-wrap">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sepiaAmount}
                        onChange={(e) => setSepiaAmount(Number(e.target.value))}
                        className="filter-slider"
                        autoFocus
                      />
                    </div>
                    <p className="modal-hint-text">
                      Warm tone photographic sepia matrix transformation.
                    </p>
                  </div>
                )}

                {/* 7. Invert */}
                {filterType === 'invert' && (
                  <div>
                    <p className="modal-hint-text" style={{ marginTop: 0 }}>
                      Inverts all RGB color channels (255 - Channel) on the selected layer.
                      Alpha transparency is strictly preserved.
                    </p>
                  </div>
                )}
              </div>

              {/* Preview Toggle & Processing Status */}
              <div className="filter-preview-row">
                <label className="filter-preview-label">
                  <input
                    type="checkbox"
                    checked={previewEnabled}
                    onChange={(e) => setPreviewEnabled(e.target.checked)}
                  />
                  <span>Preview on canvas</span>
                </label>

                {isProcessing && (
                  <span className="filter-preview-status">Processing...</span>
                )}
              </div>
            </>
          )}

          {error && <p className="modal-error-text">{error}</p>}
        </div>

        {/* Footer actions */}
        <div className="app-dialog-footer">
          <button
            type="button"
            className="app-dialog-btn-secondary"
            onClick={handleCancel}
          >
            {activeLayer.imageBitmap ? 'Cancel' : 'Close'}
          </button>
          {activeLayer.imageBitmap && (
            <button
              type="button"
              className="app-dialog-btn-primary"
              onClick={handleApply}
              disabled={isProcessing}
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
