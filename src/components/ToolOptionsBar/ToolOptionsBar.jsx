import React, { useState } from 'react';
import './ToolOptionsBar.css';
import { TOOLS } from '../../constants/tools';

export default function ToolOptionsBar({
  activeTool,
  zoomLevel = 100,
  onZoomFit,
  onZoom100,
  cropRatio = 'free',
  onCropRatioChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
  cropDimensions,
  // Brush props
  brushSize = 20,
  onBrushSizeChange,
  brushOpacity = 100,
  onBrushOpacityChange,
  brushColor = '#ffffff',
  onBrushColorChange,
  // Eraser props
  eraserSize = 30,
  onEraserSizeChange,
  // Selection props
  selection = null,
  onSelectTool,
  onDeselect,
  onInvertSelection,
  onClearSelectionPixels,
  onSelectAll,
  textFont = 'Inter', onTextFontChange, textSize = 32, onTextSizeChange, textColor = '#ffffff', onTextColorChange,
  textBold = false, onTextBoldChange, textItalic = false, onTextItalicChange, textAlign = 'left', onTextAlignChange,
  textLineSpacing = 1.3, onTextLineSpacingChange,
  shapeFill = '#3b82f6', onShapeFillChange, shapeStroke = 'none', onShapeStrokeChange,
  shapeStrokeWidth = 2, onShapeStrokeWidthChange,
  activeLayer, onUpdateLayerTransform, onUpdateAdjustmentData,
}) {
  const [autoSelect, setAutoSelect] = useState(true);
  const [zoomMode, setZoomMode] = useState('in');
  const brushColorInputRef = React.useRef(null);

  return (
    <div className="tool-options-bar">
      <div className="tool-badge">
        <span className="tool-badge-dot" />
        <span>{activeTool.name}</span>
      </div>

      {activeTool.id === TOOLS.MOVE.id && (
        <div className="options-group">
          <label className="option-checkbox-label">
            <input
              type="checkbox"
              checked={autoSelect}
              onChange={(e) => setAutoSelect(e.target.checked)}
            />
            <span>Auto-Select Layer</span>
          </label>
          <label className="option-checkbox-label">
            <input type="checkbox" defaultChecked={false} />
            <span>Show Transform Controls</span>
          </label>
        </div>
      )}

      {activeTool.id === TOOLS.MOVE.id && activeLayer && (
        <div className="options-group">
          <span className="options-label">Transform:</span>
          <button className="option-btn" onClick={() => onUpdateLayerTransform?.(activeLayer.id, { ...(activeLayer.transform ?? {}), rotation: ((activeLayer.transform?.rotation ?? 0) - 90) % 360 })}>↶ 90°</button>
          <button className="option-btn" onClick={() => onUpdateLayerTransform?.(activeLayer.id, { ...(activeLayer.transform ?? {}), rotation: ((activeLayer.transform?.rotation ?? 0) + 90) % 360 })}>↷ 90°</button>
          <button className="option-btn" onClick={() => onUpdateLayerTransform?.(activeLayer.id, { ...(activeLayer.transform ?? {}), scaleX: -(activeLayer.transform?.scaleX ?? 1) })}>Flip H</button>
          <button className="option-btn" onClick={() => onUpdateLayerTransform?.(activeLayer.id, { ...(activeLayer.transform ?? {}), scaleY: -(activeLayer.transform?.scaleY ?? 1) })}>Flip V</button>
          <span className="options-label">Scale:</span><input type="number" min={10} max={400} value={Math.round(Math.abs(activeLayer.transform?.scaleX ?? 1) * 100)} className="option-control-input" title="Uniform scale percentage" onChange={(e) => { const factor=(Math.max(10, Math.min(400, Number(e.target.value)||100))/100); onUpdateLayerTransform?.(activeLayer.id, { ...(activeLayer.transform ?? {}), scaleX: Math.sign(activeLayer.transform?.scaleX ?? 1)*factor, scaleY: Math.sign(activeLayer.transform?.scaleY ?? 1)*factor }); }} />
        </div>
      )}

      {activeLayer?.type === 'adjustment' && (
        <div className="options-group">
          {['brightness', 'contrast', 'saturation', 'grayscale'].map((key) => <React.Fragment key={key}><span className="options-label">{key}:</span><input type="range" min={key === 'grayscale' ? 0 : -100} max={100} value={activeLayer.adjustmentData?.[key] ?? 0} onChange={(e) => onUpdateAdjustmentData?.(activeLayer.id, { ...activeLayer.adjustmentData, [key]: Number(e.target.value) })} className="option-control-slider" /></React.Fragment>)}
        </div>
      )}

      {(activeTool.id === TOOLS.SELECT.id || activeTool.id === TOOLS.SELECT_ELLIPSE.id) && (
        <div className="options-group">
          <span className="options-label">Shape:</span>
          <select
            className="option-control-select"
            value={activeTool.id}
            onChange={(e) => {
              if (e.target.value === TOOLS.SELECT.id) onSelectTool?.(TOOLS.SELECT);
              else onSelectTool?.(TOOLS.SELECT_ELLIPSE);
            }}
          >
            <option value={TOOLS.SELECT.id}>Rectangular Marquee</option>
            <option value={TOOLS.SELECT_ELLIPSE.id}>Elliptical Marquee</option>
          </select>

          {selection ? (
            <>
              <span className="options-label" style={{ fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
                {Math.round(selection.width)} × {Math.round(selection.height)} px {selection.inverted ? '(Inverted)' : ''}
              </span>
              <button
                className="option-btn"
                onClick={onDeselect}
                title="Deselect (Ctrl+D)"
                style={{ marginLeft: 6 }}
              >
                Deselect
              </button>
              <button
                className="option-btn"
                onClick={onInvertSelection}
                title="Inverse Selection (Ctrl+Shift+I)"
                style={{ marginLeft: 4 }}
              >
                Invert
              </button>
              <button
                className="option-btn"
                onClick={onClearSelectionPixels}
                title="Clear selected pixels on active layer (Delete)"
                style={{ marginLeft: 4, color: '#f87171' }}
              >
                Clear Pixels
              </button>
            </>
          ) : (
            <>
              <span className="options-label" style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                No active selection
              </span>
              <button
                className="option-btn"
                onClick={onSelectAll}
                title="Select All (Ctrl+A)"
                style={{ marginLeft: 6 }}
              >
                Select All
              </button>
            </>
          )}
        </div>
      )}

      {activeTool.id === TOOLS.CROP.id && (
        <div className="options-group">
          <span className="options-label">Aspect:</span>
          <select
            className="option-control-select"
            value={cropRatio}
            onChange={(e) => onCropRatioChange?.(e.target.value)}
          >
            <option value="free">Freeform</option>
            <option value="original">Original Ratio</option>
            <option value="1:1">1:1 Square</option>
            <option value="16:9">16:9 Widescreen</option>
            <option value="4:3">4:3 Standard</option>
          </select>
          {cropDimensions && (
            <span className="options-label" style={{ fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
              {Math.round(cropDimensions.width)} × {Math.round(cropDimensions.height)} px
            </span>
          )}
          <button
            className="option-btn"
            onClick={onResetCrop}
            title="Reset crop box to full document"
            style={{ marginLeft: 6 }}
          >
            Reset
          </button>
          <button
            className="option-btn"
            onClick={onCancelCrop}
            title="Cancel crop (Esc)"
            style={{ marginLeft: 4 }}
          >
            Cancel
          </button>
          <button
            className="option-btn"
            onClick={onApplyCrop}
            title="Apply crop (Enter)"
            style={{
              marginLeft: 4,
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            Apply Crop
          </button>
        </div>
      )}

      {activeTool.id === TOOLS.BRUSH.id && (
        <div className="options-group">
          <span className="options-label">Size:</span>
          <input
            type="range"
            min={1}
            max={200}
            value={brushSize}
            onChange={(e) => onBrushSizeChange?.(Math.max(1, Math.min(500, Number(e.target.value))))}
            className="option-control-slider"
            title="Brush Size (1–200 px)"
          />
          <input
            type="number"
            min={1}
            max={500}
            value={brushSize}
            onChange={(e) => onBrushSizeChange?.(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            className="option-control-input"
            title="Brush Size in pixels (1–500)"
          />
          <span className="options-label">px</span>

          <span className="options-label" style={{ marginLeft: 10 }}>Opacity:</span>
          <input
            type="range"
            min={1}
            max={100}
            value={brushOpacity}
            onChange={(e) => onBrushOpacityChange?.(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="option-control-slider"
            title="Brush Opacity (1–100%)"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={brushOpacity}
            onChange={(e) => onBrushOpacityChange?.(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className="option-control-input"
            title="Brush Opacity % (1–100)"
          />
          <span className="options-label">%</span>

          <span className="options-label" style={{ marginLeft: 10 }}>Color:</span>
          <input
            ref={brushColorInputRef}
            type="color"
            value={brushColor}
            onChange={(e) => onBrushColorChange?.(e.target.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            aria-hidden="true"
          />
          <button
            type="button"
            className="option-btn"
            onClick={() => brushColorInputRef.current?.click()}
            title={`Brush Color: ${brushColor} (Click to change)`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px' }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: brushColor,
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'inline-block',
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{brushColor.toUpperCase()}</span>
          </button>
        </div>
      )}

      {activeTool.id === TOOLS.ERASER.id && (
        <div className="options-group">
          <span className="options-label">Size:</span>
          <input
            type="range"
            min={1}
            max={200}
            value={eraserSize}
            onChange={(e) => onEraserSizeChange?.(Math.max(1, Math.min(500, Number(e.target.value))))}
            className="option-control-slider"
            title="Eraser Size (1–200 px)"
          />
          <input
            type="number"
            min={1}
            max={500}
            value={eraserSize}
            onChange={(e) => onEraserSizeChange?.(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            className="option-control-input"
            title="Eraser Size in pixels (1–500)"
          />
          <span className="options-label">px</span>

          <span className="options-label" style={{ marginLeft: 10 }}>Opacity:</span>
          <input
            type="range"
            min={1}
            max={100}
            value={eraserOpacity}
            onChange={(e) => onEraserOpacityChange?.(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="option-control-slider"
            title="Eraser Opacity (1–100%)"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={eraserOpacity}
            onChange={(e) => onEraserOpacityChange?.(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className="option-control-input"
            title="Eraser Opacity % (1–100)"
          />
          <span className="options-label">%</span>
        </div>
      )}

      {activeTool.id === TOOLS.TEXT.id && (
        <div className="options-group">
          <span className="options-label">Font:</span>
          <select className="option-control-select" value={textFont} onChange={(e) => onTextFontChange?.(e.target.value)}>
            <option value="Inter">Inter</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
          </select>
          <span className="options-label">Size:</span>
          <input
            type="number"
            value={textSize}
            min={6}
            max={288}
            className="option-control-input"
            onChange={(e) => onTextSizeChange?.(Math.max(6, Math.min(288, Number(e.target.value) || 6)))}
          />
          <span className="options-label">pt</span>
          <input type="color" value={textColor} onChange={(e) => onTextColorChange?.(e.target.value)} title="Text color" />
          <button className={`option-btn ${textBold ? 'active' : ''}`} onClick={() => onTextBoldChange?.(!textBold)}>B</button>
          <button className={`option-btn ${textItalic ? 'active' : ''}`} onClick={() => onTextItalicChange?.(!textItalic)}>I</button>
          <select className="option-control-select" value={textAlign} onChange={(e) => onTextAlignChange?.(e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
          <input type="number" min={0.8} max={3} step={0.1} value={textLineSpacing} className="option-control-input" title="Line spacing" onChange={(e) => onTextLineSpacingChange?.(Math.max(0.8, Math.min(3, Number(e.target.value) || 1)))} />
        </div>
      )}

      {[TOOLS.SHAPE_RECT.id, TOOLS.SHAPE_ELLIPSE.id, TOOLS.SHAPE_LINE.id].includes(activeTool.id) && (
        <div className="options-group">
          <span className="options-label">Fill:</span><input type="color" value={shapeFill} onChange={(e) => onShapeFillChange?.(e.target.value)} />
          <span className="options-label">Stroke:</span><input type="color" value={shapeStroke === 'none' ? '#000000' : shapeStroke} onChange={(e) => onShapeStrokeChange?.(e.target.value)} />
          <span className="options-label">Width:</span><input type="number" min={0} max={100} value={shapeStrokeWidth} className="option-control-input" onChange={(e) => onShapeStrokeWidthChange?.(Math.max(0, Number(e.target.value) || 0))} />
        </div>
      )}

      {activeTool.id === TOOLS.HAND.id && (
        <div className="options-group">
          <button className="option-btn" onClick={onZoomFit}>Fit on Screen</button>
          <button className="option-btn" onClick={onZoom100}>100% Actual Size</button>
        </div>
      )}

      {activeTool.id === TOOLS.ZOOM.id && (
        <div className="options-group">
          <button
            className={`option-btn ${zoomMode === 'in' ? 'active' : ''}`}
            onClick={() => setZoomMode('in')}
          >
            Zoom In (+)
          </button>
          <button
            className={`option-btn ${zoomMode === 'out' ? 'active' : ''}`}
            onClick={() => setZoomMode('out')}
          >
            Zoom Out (-)
          </button>
          <button className="option-btn" onClick={onZoomFit}>Fit Screen</button>
          <button className="option-btn" onClick={onZoom100}>100%</button>
        </div>
      )}
    </div>
  );
}
