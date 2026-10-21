import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react';
import './Viewport.css';
import { FolderOpen, FilePlus2 } from 'lucide-react';
import { useViewport } from '../../hooks/useViewport';
import { TOOLS } from '../../constants/tools';
import { compositeToCanvas } from '../../store/useDocument';
import CropOverlay from './CropOverlay';
import SelectionOverlay from './SelectionOverlay';
import {
  normalizeSelection,
  isPointInSelection,
  applySelectionClip,
} from '../../utils/selectionUtils';
import { constrainShapePoint, moveVectorData, pointInVectorLayer } from '../../utils/vectorLayer';

/**
 * DEMO DOCUMENT – shown behind the welcome overlay when no real image is open.
 * Lets users test zoom/pan before loading an image.
 */
const DEMO_DOC = { width: 800, height: 600 };

function DemoDocument({ width, height }) {
  return (
    <div
      style={{ width, height, position: 'relative', overflow: 'hidden' }}
      className="demo-document"
    >
      <div className="demo-doc-checker" />
      <div className="demo-doc-content">
        <div className="demo-doc-badge">CS</div>
        <p className="demo-doc-label">Demo Canvas</p>
        <p className="demo-doc-sub">{width} × {height} px — zoom &amp; pan to test</p>
        <div className="demo-doc-crosshair">
          <span className="crosshair-h" />
          <span className="crosshair-v" />
        </div>
      </div>
      <div className="demo-corner top-left"    />
      <div className="demo-corner top-right"   />
      <div className="demo-corner bottom-left" />
      <div className="demo-corner bottom-right"/>
    </div>
  );
}

// ─── Main Viewport component ──────────────────────────────────────────────────

export default function Viewport({
  onOpenImage,        // () => void — triggers file picker from App
  onDropFiles,        // (FileList) => void — hand dropped files to App
  activeTool,
  // Real document dimensions, or null while no image is open.
  document: doc,
  // Layer stack from useDocument
  layers = [],
  activeLayerId,
  // Brush & Eraser stroke commit callback
  onCommitStroke,
  // Guard flag when dialogs/modals are open
  isModalOpen = false,
  // Brush options
  brushSize = 20,
  brushOpacity = 100,
  brushColor = '#ffffff',
  // Eraser options
  eraserSize = 30,
  eraserOpacity = 100,
  onBrushSizeChange,
  onEraserSizeChange,
  // Callbacks to report state upward.
  onZoomChange,
  onCursorChange,
  // External zoom action bus from App.
  externalAction,
  // Crop tool integration (Phase 4)
  cropRect = null,
  onChangeCropRect,
  cropRatio = 'free',
  onApplyCrop,
  onCancelCrop,
  // Selection integration (Milestone 7)
  selection = null,
  onSetSelection,
  onDeselect,
  onMoveSelectionPixels,
  textFont, textSize, textColor, textBold, textItalic, textAlign, textLineSpacing,
  onAddTextLayer, onUpdateTextData,
  shapeFill, shapeStroke, shapeStrokeWidth, onAddShapeLayer, onUpdateShapeData, onSelectLayer,
}) {
  const containerRef = useRef(null);
  const compositeCanvasRef = useRef(null);
  const cursorIndicatorRef = useRef(null);

  // Dedicated offscreen canvases for live stroke interaction (zero-allocation during move)
  const strokeCanvasRef = useRef(null);
  const liveLayerCanvasRef = useRef(null);

  // Selection interaction state
  const [activeSelectionDrag, setActiveSelectionDrag] = useState(null);
  const [isOverSelection, setIsOverSelection] = useState(false);
  const marqueeDragRef = useRef(null);
  const vectorDragRef = useRef(null);
  const [vectorPreview, setVectorPreview] = useState(null);
  const [textEditor, setTextEditor] = useState(null);

  const hasDocument = Boolean(doc);
  const activeLayer = layers.find(l => l.id === activeLayerId) || null;
  const isCropActive = activeTool.id === TOOLS.CROP.id && hasDocument;
  const isBrushOrEraser = activeTool.id === TOOLS.BRUSH.id || activeTool.id === TOOLS.ERASER.id;

  // Use real doc dims for viewport math; fall back to demo dims.
  const effectiveDoc = doc ?? DEMO_DOC;

  const {
    zoom,
    panX,
    panY,
    zoomPercent,
    stepZoom,
    setZoomPercent,
    fitToScreen,
    actualSize,
    panBy,
    handleWheel,
  } = useViewport(containerRef, effectiveDoc);

  // ─── Report zoom upward ──────────────────────────────────────────────────

  useEffect(() => {
    onZoomChange?.(zoomPercent);
  }, [zoomPercent, onZoomChange]);

  // ─── External action bus ─────────────────────────────────────────────────

  useEffect(() => {
    if (!externalAction) return;
    switch (externalAction.type) {
      case 'fit':        fitToScreen();                       break;
      case 'actual':     actualSize();                        break;
      case 'in':         stepZoom(+1);                        break;
      case 'out':        stepZoom(-1);                        break;
      case 'setPercent': setZoomPercent(externalAction.value); break;
      default: break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAction]);

  // ─── Initial fit & re-fit on new document ────────────────────────────────

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current) return;
    const id = requestAnimationFrame(() => {
      fitToScreen();
      didInitialFit.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [fitToScreen]);

  useEffect(() => {
    if (doc) fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // ─── Pan state ───────────────────────────────────────────────────────────

  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const isHandMode = activeTool.id === TOOLS.HAND.id || spaceDown;

  // ─── Drawing stroke state (kept in refs for 60fps/120fps painting) ────────

  const isDrawingRef = useRef(false);
  const strokeToolRef = useRef(null);   // 'brush' | 'eraser'
  const strokeLayerRef = useRef(null);  // layer reference at start of stroke
  const lastPointRef = useRef({ x: 0, y: 0 }); // local layer coordinates
  const pointsCountRef = useRef(0);
  const rafIdRef = useRef(null);

  // Initialize persistent drawing offscreen canvases
  if (!strokeCanvasRef.current && typeof document !== 'undefined') {
    strokeCanvasRef.current = document.createElement('canvas');
  }
  if (!liveLayerCanvasRef.current && typeof document !== 'undefined') {
    liveLayerCanvasRef.current = document.createElement('canvas');
  }

  // ─── Re-render composite canvas when document or layers change ───────────

  useEffect(() => {
    // If a live stroke is currently in progress, do not overwrite the live stroke canvas
    if (isDrawingRef.current) return;
    const canvas = compositeCanvasRef.current;
    if (!canvas || !doc) return;
    compositeToCanvas(canvas, doc, vectorPreview ? [...layers, vectorPreview] : layers);
  }, [doc, layers, vectorPreview]);

  // ─── Live stroke compositing loop ─────────────────────────────────────────

  const renderLiveStroke = useCallback(() => {
    const compCanvas = compositeCanvasRef.current;
    if (!compCanvas || !doc) return;
    const compCtx = compCanvas.getContext('2d');
    compCtx.clearRect(0, 0, doc.width, doc.height);

    const strokeCanvas = strokeCanvasRef.current;
    const liveLayerCanvas = liveLayerCanvasRef.current;
    const activeL = strokeLayerRef.current;
    const tool = strokeToolRef.current;

    if (activeL && liveLayerCanvas && strokeCanvas) {
      const lCtx = liveLayerCanvas.getContext('2d');
      lCtx.clearRect(0, 0, activeL.width, activeL.height);
      if (activeL.imageBitmap) {
        lCtx.drawImage(activeL.imageBitmap, 0, 0);
      }
      if (tool === TOOLS.BRUSH.id) {
        lCtx.save();
        lCtx.globalAlpha = brushOpacity / 100;
        lCtx.globalCompositeOperation = 'source-over';
        if (selection) {
          applySelectionClip(lCtx, selection, doc, { x: activeL.x, y: activeL.y });
        }
        lCtx.drawImage(strokeCanvas, 0, 0);
        lCtx.restore();
      } else if (tool === TOOLS.ERASER.id) {
        lCtx.save();
        lCtx.globalAlpha = eraserOpacity / 100;
        lCtx.globalCompositeOperation = 'destination-out';
        if (selection) {
          applySelectionClip(lCtx, selection, doc, { x: activeL.x, y: activeL.y });
        }
        lCtx.drawImage(strokeCanvas, 0, 0);
        lCtx.restore();
      }
    }

    // Composite all layers to the composite canvas
    for (const l of layers) {
      if (!l.visible) continue;
      compCtx.save();
      compCtx.globalAlpha = l.opacity / 100;
      compCtx.globalCompositeOperation = l.blendMode;
      if (activeL && l.id === activeL.id && liveLayerCanvas) {
        compCtx.drawImage(liveLayerCanvas, l.x, l.y);
      } else {
        const bmp = l.previewBitmap || l.imageBitmap;
        if (bmp) compCtx.drawImage(bmp, l.x, l.y);
      }
      compCtx.restore();
    }
  }, [doc, layers, brushOpacity, eraserOpacity, selection]);

  // ─── Live pixel-move compositing loop ──────────────────────────────────────
  const renderLivePixelMove = useCallback((drag) => {
    const compCanvas = compositeCanvasRef.current;
    if (!compCanvas || !doc) return;
    const compCtx = compCanvas.getContext('2d');
    compCtx.clearRect(0, 0, doc.width, doc.height);

    for (const l of layers) {
      if (!l.visible) continue;
      compCtx.save();
      compCtx.globalAlpha = l.opacity / 100;
      compCtx.globalCompositeOperation = l.blendMode;
      if (l.id === drag.activeLayer.id) {
        compCtx.drawImage(drag.holeCanvas, l.x, l.y);
        compCtx.drawImage(drag.patchCanvas, l.x + drag.dx, l.y + drag.dy);
      } else {
        const bmp = l.previewBitmap || l.imageBitmap;
        if (bmp) compCtx.drawImage(bmp, l.x, l.y);
      }
      compCtx.restore();
    }
  }, [doc, layers]);

  // ─── Drag-and-drop state ─────────────────────────────────────────────────

  const [isDragOver, setIsDragOver] = useState(false);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e) {
      const tag = e.target.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.target.isContentEditable) return;

      // Escape cancels any in-progress stroke, marquee drag, or deselects
      if (e.key === 'Escape') {
        if (isDrawingRef.current) {
          e.preventDefault();
          isDrawingRef.current = false;
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          strokeLayerRef.current = null;
          strokeToolRef.current = null;
          compositeToCanvas(compositeCanvasRef.current, doc, layers);
          return;
        }
        if (marqueeDragRef.current) {
          e.preventDefault();
          marqueeDragRef.current = null;
          setActiveSelectionDrag(null);
          compositeToCanvas(compositeCanvasRef.current, doc, layers);
          return;
        }
        if (selection) {
          e.preventDefault();
          onDeselect?.();
          return;
        }
      }

      // Bracket keys [ and ] change brush/eraser size
      if (e.key === '[') {
        e.preventDefault();
        if (activeTool.id === TOOLS.BRUSH.id) {
          onBrushSizeChange?.(Math.max(1, brushSize - 5));
        } else if (activeTool.id === TOOLS.ERASER.id) {
          onEraserSizeChange?.(Math.max(1, eraserSize - 5));
        }
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        if (activeTool.id === TOOLS.BRUSH.id) {
          onBrushSizeChange?.(Math.min(500, brushSize + 5));
        } else if (activeTool.id === TOOLS.ERASER.id) {
          onEraserSizeChange?.(Math.min(500, eraserSize + 5));
        }
        return;
      }

      if (isCropActive) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onApplyCrop?.();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancelCrop?.();
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(+1); }
        if (e.key === '-')                  { e.preventDefault(); stepZoom(-1); }
        if (e.key === '0')                  { e.preventDefault(); fitToScreen(); }
        if (e.key === '1')                  { e.preventDefault(); actualSize(); }
      }
    }
    function onKeyUp(e)  { if (e.code === 'Space') setSpaceDown(false); }
    function onBlur()    { setSpaceDown(false); }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    window.addEventListener('blur',    onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      window.removeEventListener('blur',    onBlur);
    };
  }, [
    stepZoom,
    fitToScreen,
    actualSize,
    isCropActive,
    onApplyCrop,
    onCancelCrop,
    activeTool.id,
    brushSize,
    eraserSize,
    onBrushSizeChange,
    onEraserSizeChange,
    doc,
    layers,
    selection,
    onDeselect,
  ]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // ─── Wheel ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e) {
      const rect = el.getBoundingClientRect();
      handleWheel(e, rect);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handleWheel]);

  // ─── Pointer events ──────────────────────────────────────────────────────

  const onPointerDown = useCallback((e) => {
    if (isModalOpen) return;

    // Hand mode panning
    if (isHandMode) {
      e.currentTarget.setPointerCapture(e.pointerId);
      isPanning.current = true;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    const isMarquee = activeTool.id === TOOLS.SELECT.id || activeTool.id === TOOLS.SELECT_ELLIPSE.id;
    const isMove = activeTool.id === TOOLS.MOVE.id;
    const isBrush = activeTool.id === TOOLS.BRUSH.id;
    const isEraser = activeTool.id === TOOLS.ERASER.id;
    const isText = activeTool.id === TOOLS.TEXT.id;
    const shapeType = activeTool.id === TOOLS.SHAPE_RECT.id ? 'rect' : activeTool.id === TOOLS.SHAPE_ELLIPSE.id ? 'ellipse' : activeTool.id === TOOLS.SHAPE_LINE.id ? 'line' : null;

    if (!isMarquee && !isMove && !isBrush && !isEraser && !isText && !shapeType) return;
    if (!hasDocument) return;
    if (e.button !== 0) return; // Only primary mouse button

    const rect = containerRef.current.getBoundingClientRect();
    const docX = (e.clientX - rect.left - panX) / zoom;
    const docY = (e.clientY - rect.top  - panY) / zoom;

    if (isText) {
      e.preventDefault();
      const existing = [...layers].reverse().find(layer => layer.visible && layer.type === 'text' && pointInVectorLayer(layer, docX, docY));
      if (existing) {
        onSelectLayer?.(existing.id);
        setTextEditor({ layerId: existing.id, x: existing.textData.originX ?? 0, y: existing.textData.originY ?? 0, value: existing.textData.text ?? '' });
      } else {
        setTextEditor({ layerId: null, x: Math.max(0, docX), y: Math.max(0, docY), value: '' });
      }
      return;
    }

    if (shapeType) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      vectorDragRef.current = { mode: 'shape', shapeType, x1: docX, y1: docY, x2: docX, y2: docY };
      setVectorPreview({ id: '__vector-preview__', type: 'shape', imageBitmap: null, visible: true, opacity: 100, blendMode: 'source-over', x: 0, y: 0, width: doc.width, height: doc.height, shapeData: { shapeType, fill: shapeType === 'line' ? 'none' : shapeFill, stroke: shapeStroke, strokeWidth: shapeStrokeWidth, x1: docX, y1: docY, x2: docX, y2: docY } });
      return;
    }

    // 1. Marquee Tool Interactions
    if (isMarquee) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      // Check if clicking inside an existing selection to move its boundary
      if (selection && isPointInSelection(docX, docY, selection)) {
        marqueeDragRef.current = {
          mode: 'move-boundary',
          startDocX: docX,
          startDocY: docY,
          initialSelection: { ...selection },
          hasDragged: false,
        };
      } else {
        // Start dragging a new selection
        const selType = activeTool.id === TOOLS.SELECT_ELLIPSE.id ? 'ellipse' : 'rect';
        marqueeDragRef.current = {
          mode: 'new',
          type: selType,
          startDocX: docX,
          startDocY: docY,
          hasDragged: false,
        };
      }
      return;
    }

    // 2. Move Tool: Move selected pixels if dragging inside active selection on active layer
    if (isMove) {
      const vector = [...layers].reverse().find(layer => layer.visible && (layer.type === 'text' || layer.type === 'shape') && pointInVectorLayer(layer, docX, docY));
      if (vector) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onSelectLayer?.(vector.id);
        vectorDragRef.current = { mode: 'move-vector', layer: vector, startX: docX, startY: docY };
        return;
      }
      if (selection && activeLayer?.imageBitmap && activeLayer.visible && isPointInSelection(docX, docY, selection)) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);

        // Extract selected pixels to patchCanvas
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = activeLayer.width;
        patchCanvas.height = activeLayer.height;
        const pCtx = patchCanvas.getContext('2d');
        pCtx.save();
        applySelectionClip(pCtx, selection, doc, { x: activeLayer.x, y: activeLayer.y });
        pCtx.drawImage(activeLayer.imageBitmap, 0, 0);
        pCtx.restore();

        // Create hole in holeCanvas
        const holeCanvas = document.createElement('canvas');
        holeCanvas.width = activeLayer.width;
        holeCanvas.height = activeLayer.height;
        const hCtx = holeCanvas.getContext('2d');
        hCtx.drawImage(activeLayer.imageBitmap, 0, 0);
        hCtx.save();
        applySelectionClip(hCtx, selection, doc, { x: activeLayer.x, y: activeLayer.y });
        hCtx.clearRect(0, 0, activeLayer.width, activeLayer.height);
        hCtx.restore();

        marqueeDragRef.current = {
          mode: 'move-pixels',
          startDocX: docX,
          startDocY: docY,
          initialSelection: { ...selection },
          activeLayer,
          patchCanvas,
          holeCanvas,
          dx: 0,
          dy: 0,
          hasDragged: false,
        };
        return;
      }
      return;
    }

    // 3. Brush / Eraser
    if (!activeLayer?.imageBitmap || !activeLayer.visible) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const localX = docX - activeLayer.x;
    const localY = docY - activeLayer.y;

    isDrawingRef.current = true;
    strokeToolRef.current = activeTool.id;
    strokeLayerRef.current = activeLayer;
    lastPointRef.current = { x: localX, y: localY };
    pointsCountRef.current = 1;

    const sCanvas = strokeCanvasRef.current;
    if (sCanvas.width !== activeLayer.width || sCanvas.height !== activeLayer.height) {
      sCanvas.width = activeLayer.width;
      sCanvas.height = activeLayer.height;
    }
    const sCtx = sCanvas.getContext('2d');
    sCtx.clearRect(0, 0, activeLayer.width, activeLayer.height);
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';

    const toolSize = isBrush ? brushSize : eraserSize;
    sCtx.lineWidth = toolSize;

    if (isBrush) {
      sCtx.strokeStyle = brushColor;
      sCtx.fillStyle = brushColor;
    } else {
      sCtx.strokeStyle = '#ffffff';
      sCtx.fillStyle = '#ffffff';
    }

    // Draw initial dot (clipped to selection if active)
    sCtx.save();
    if (selection) {
      applySelectionClip(sCtx, selection, doc, { x: activeLayer.x, y: activeLayer.y });
    }
    sCtx.beginPath();
    sCtx.arc(localX, localY, toolSize / 2, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.restore();

    const lCanvas = liveLayerCanvasRef.current;
    if (lCanvas.width !== activeLayer.width || lCanvas.height !== activeLayer.height) {
      lCanvas.width = activeLayer.width;
      lCanvas.height = activeLayer.height;
    }

    renderLiveStroke();
  }, [
    isModalOpen,
    isHandMode,
    activeTool.id,
    hasDocument,
    activeLayer,
    panX,
    panY,
    zoom,
    doc,
    selection,
    brushSize,
    brushColor,
    eraserSize,
    renderLiveStroke,
  ]);

  const onPointerMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const docX = (e.clientX - rect.left - panX) / zoom;
    const docY = (e.clientY - rect.top  - panY) / zoom;

    if (onCursorChange) {
      onCursorChange({ x: Math.round(docX), y: Math.round(docY) });
    }

    // Update hover over selection
    const overSel = Boolean(selection && isPointInSelection(docX, docY, selection));
    if (overSel !== isOverSelection) {
      setIsOverSelection(overSel);
    }

    // Update circular brush cursor indicator in document coordinates
    const indicator = cursorIndicatorRef.current;
    if (indicator) {
      const isBrush = activeTool.id === TOOLS.BRUSH.id;
      const isEraser = activeTool.id === TOOLS.ERASER.id;
      const inside = doc && docX >= 0 && docX <= doc.width && docY >= 0 && docY <= doc.height;
      if (inside && (isBrush || isEraser) && !isHandMode && !isModalOpen) {
        const size = isBrush ? brushSize : eraserSize;
        indicator.style.display = 'block';
        indicator.style.left = `${docX}px`;
        indicator.style.top = `${docY}px`;
        indicator.style.width = `${size}px`;
        indicator.style.height = `${size}px`;
      } else {
        indicator.style.display = 'none';
      }
    }

    if (isPanning.current) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      panBy(dx, dy);
      return;
    }

    if (vectorDragRef.current) {
      const drag = vectorDragRef.current;
      if (drag.mode === 'shape') {
        const point = constrainShapePoint(drag.shapeType, drag.x1, drag.y1, docX, docY, e.shiftKey);
        drag.x2 = point.x2; drag.y2 = point.y2;
        setVectorPreview({ id: '__vector-preview__', type: 'shape', imageBitmap: null, visible: true, opacity: 100, blendMode: 'source-over', x: 0, y: 0, width: doc.width, height: doc.height, shapeData: { shapeType: drag.shapeType, fill: drag.shapeType === 'line' ? 'none' : shapeFill, stroke: shapeStroke, strokeWidth: shapeStrokeWidth, x1: drag.x1, y1: drag.y1, x2: drag.x2, y2: drag.y2 } });
      } else if (drag.mode === 'move-vector') {
        const dx = docX - drag.startX; const dy = docY - drag.startY;
        const data = moveVectorData(drag.layer, dx, dy);
        setVectorPreview({ ...drag.layer, id: '__vector-preview__', visible: true, textData: drag.layer.type === 'text' ? data : null, shapeData: drag.layer.type === 'shape' ? data : null });
      }
      return;
    }

    // Handle marquee or moved-pixels drag
    if (marqueeDragRef.current) {
      const drag = marqueeDragRef.current;
      if (drag.mode === 'new') {
        const cand = normalizeSelection(drag.type, drag.startDocX, drag.startDocY, docX, docY, doc, e.shiftKey);
        drag.hasDragged = true;
        setActiveSelectionDrag(cand);
      } else if (drag.mode === 'move-boundary') {
        const dx = Math.round(docX - drag.startDocX);
        const dy = Math.round(docY - drag.startDocY);
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.hasDragged = true;
        const newX = Math.max(0, Math.min(doc.width - drag.initialSelection.width, drag.initialSelection.x + dx));
        const newY = Math.max(0, Math.min(doc.height - drag.initialSelection.height, drag.initialSelection.y + dy));
        setActiveSelectionDrag({
          ...drag.initialSelection,
          x: newX,
          y: newY,
        });
      } else if (drag.mode === 'move-pixels') {
        const dx = Math.round(docX - drag.startDocX);
        const dy = Math.round(docY - drag.startDocY);
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) drag.hasDragged = true;
        drag.dx = dx;
        drag.dy = dy;
        setActiveSelectionDrag({
          ...drag.initialSelection,
          x: drag.initialSelection.x + dx,
          y: drag.initialSelection.y + dy,
        });
        renderLivePixelMove(drag);
      }
      return;
    }

    if (isDrawingRef.current) {
      const activeL = strokeLayerRef.current;
      if (!activeL) return;
      const localX = docX - activeL.x;
      const localY = docY - activeL.y;

      const sCanvas = strokeCanvasRef.current;
      const sCtx = sCanvas.getContext('2d');
      sCtx.save();
      if (selection) {
        applySelectionClip(sCtx, selection, doc, { x: activeL.x, y: activeL.y });
      }
      sCtx.beginPath();
      sCtx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      sCtx.lineTo(localX, localY);
      sCtx.stroke();
      sCtx.restore();

      lastPointRef.current = { x: localX, y: localY };
      pointsCountRef.current += 1;

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          renderLiveStroke();
        });
      }
    }
  }, [
    panX,
    panY,
    zoom,
    onCursorChange,
    activeTool.id,
    doc,
    selection,
    isOverSelection,
    isHandMode,
    isModalOpen,
    brushSize,
    eraserSize,
    panBy,
    renderLiveStroke,
    renderLivePixelMove,
  ]);

  const onPointerUp = useCallback((e) => {
    if (isPanning.current) {
      isPanning.current = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    if (vectorDragRef.current) {
      const drag = vectorDragRef.current;
      vectorDragRef.current = null;
      setVectorPreview(null);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      const rect = containerRef.current.getBoundingClientRect();
      const endX = (e.clientX - rect.left - panX) / zoom;
      const endY = (e.clientY - rect.top - panY) / zoom;
      if (drag.mode === 'shape') {
        const end = constrainShapePoint(drag.shapeType, drag.x1, drag.y1, endX, endY, e.shiftKey);
        if (Math.hypot(end.x2 - drag.x1, end.y2 - drag.y1) >= 2) onAddShapeLayer?.({ shapeType: drag.shapeType, fill: drag.shapeType === 'line' ? 'none' : shapeFill, stroke: shapeStroke, strokeWidth: shapeStrokeWidth, x1: drag.x1, y1: drag.y1, x2: end.x2, y2: end.y2 });
      } else if (drag.mode === 'move-vector') {
        const data = moveVectorData(drag.layer, endX - drag.startX, endY - drag.startY);
        if (drag.layer.type === 'text') onUpdateTextData?.(drag.layer.id, data);
        else onUpdateShapeData?.(drag.layer.id, data);
      }
      return;
    }

    if (marqueeDragRef.current) {
      const drag = marqueeDragRef.current;
      marqueeDragRef.current = null;
      setActiveSelectionDrag(null);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}

      const rect = containerRef.current.getBoundingClientRect();
      const docX = (e.clientX - rect.left - panX) / zoom;
      const docY = (e.clientY - rect.top  - panY) / zoom;

      if (drag.mode === 'new') {
        const cand = normalizeSelection(drag.type, drag.startDocX, drag.startDocY, docX, docY, doc, e.shiftKey);
        if (!drag.hasDragged || cand.width < 3 || cand.height < 3) {
          onDeselect?.();
        } else {
          onSetSelection?.(cand);
        }
      } else if (drag.mode === 'move-boundary') {
        if (drag.hasDragged) {
          const dx = Math.round(docX - drag.startDocX);
          const dy = Math.round(docY - drag.startDocY);
          const newX = Math.max(0, Math.min(doc.width - drag.initialSelection.width, drag.initialSelection.x + dx));
          const newY = Math.max(0, Math.min(doc.height - drag.initialSelection.height, drag.initialSelection.y + dy));
          onSetSelection?.({
            ...drag.initialSelection,
            x: newX,
            y: newY,
          });
        }
      } else if (drag.mode === 'move-pixels') {
        if (drag.hasDragged && (drag.dx !== 0 || drag.dy !== 0)) {
          const commitCanvas = document.createElement('canvas');
          commitCanvas.width = drag.activeLayer.width;
          commitCanvas.height = drag.activeLayer.height;
          const cCtx = commitCanvas.getContext('2d');
          cCtx.drawImage(drag.holeCanvas, 0, 0);
          cCtx.drawImage(drag.patchCanvas, drag.dx, drag.dy);
          createImageBitmap(commitCanvas).then((newBitmap) => {
            const newSelection = {
              ...drag.initialSelection,
              x: drag.initialSelection.x + drag.dx,
              y: drag.initialSelection.y + drag.dy,
            };
            onMoveSelectionPixels?.(newBitmap, newSelection);
          });
        } else {
          compositeToCanvas(compositeCanvasRef.current, doc, layers);
        }
      }
      return;
    }

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}

      const activeL = strokeLayerRef.current;
      const tool = strokeToolRef.current;
      const pointsCount = pointsCountRef.current;
      strokeLayerRef.current = null;
      strokeToolRef.current = null;

      if (activeL && pointsCount > 0 && onCommitStroke) {
        const commitCanvas = document.createElement('canvas');
        commitCanvas.width = activeL.width;
        commitCanvas.height = activeL.height;
        const cCtx = commitCanvas.getContext('2d');
        cCtx.clearRect(0, 0, activeL.width, activeL.height);
        if (activeL.imageBitmap) {
          cCtx.drawImage(activeL.imageBitmap, 0, 0);
        }
        const strokeCanvas = strokeCanvasRef.current;
        if (tool === TOOLS.BRUSH.id) {
          cCtx.save();
          cCtx.globalAlpha = brushOpacity / 100;
          cCtx.globalCompositeOperation = 'source-over';
          if (selection) {
            applySelectionClip(cCtx, selection, doc, { x: activeL.x, y: activeL.y });
          }
          cCtx.drawImage(strokeCanvas, 0, 0);
          cCtx.restore();
        } else if (tool === TOOLS.ERASER.id) {
          cCtx.save();
          cCtx.globalAlpha = eraserOpacity / 100;
          cCtx.globalCompositeOperation = 'destination-out';
          if (selection) {
            applySelectionClip(cCtx, selection, doc, { x: activeL.x, y: activeL.y });
          }
          cCtx.drawImage(strokeCanvas, 0, 0);
          cCtx.restore();
        }

        createImageBitmap(commitCanvas).then((newBitmap) => {
          const label = tool === TOOLS.BRUSH.id ? 'Brush Stroke' : 'Eraser';
          onCommitStroke(activeL.id, newBitmap, label);
        });
      } else {
        compositeToCanvas(compositeCanvasRef.current, doc, layers);
      }
    }
  }, [
    doc,
    layers,
    brushOpacity,
    eraserOpacity,
    onCommitStroke,
    panX,
    panY,
    zoom,
    selection,
    onDeselect,
    onSetSelection,
    onMoveSelectionPixels,
  ]);

  const onPointerCancel = useCallback((e) => {
    if (isPanning.current) {
      isPanning.current = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    if (marqueeDragRef.current) {
      marqueeDragRef.current = null;
      setActiveSelectionDrag(null);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      compositeToCanvas(compositeCanvasRef.current, doc, layers);
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      strokeLayerRef.current = null;
      strokeToolRef.current = null;
      compositeToCanvas(compositeCanvasRef.current, doc, layers);
    }
  }, [doc, layers]);

  const onPointerLeave = useCallback(() => {
    if (cursorIndicatorRef.current) {
      cursorIndicatorRef.current.style.display = 'none';
    }
  }, []);

  // ─── Zoom click ──────────────────────────────────────────────────────────

  const onViewportClick = useCallback((e) => {
    if (activeTool.id !== TOOLS.ZOOM.id) return;
    stepZoom(e.altKey ? -1 : +1);
  }, [activeTool.id, stepZoom]);

  // ─── Drag-and-drop ───────────────────────────────────────────────────────

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length > 0 && onDropFiles) {
      onDropFiles(e.dataTransfer.files);
    }
  }, [onDropFiles]);

  // ─── Cursor style ────────────────────────────────────────────────────────

  let cursorStyle = 'default';
  if (isDragOver)                           cursorStyle = 'copy';
  else if (isHandMode)                      cursorStyle = isPanning.current ? 'grabbing' : 'grab';
  else if (activeTool.id === TOOLS.ZOOM.id)  cursorStyle = 'zoom-in';
  else if (activeTool.id === TOOLS.CROP.id)  cursorStyle = 'crosshair';
  else if (activeTool.id === TOOLS.SELECT.id || activeTool.id === TOOLS.SELECT_ELLIPSE.id) {
    cursorStyle = isOverSelection ? 'move' : 'crosshair';
  }
  else if (activeTool.id === TOOLS.MOVE.id) {
    cursorStyle = (selection && isOverSelection) ? 'move' : 'default';
  }
  else if (isBrushOrEraser)                 cursorStyle = 'crosshair';

  const commitTextEditor = () => {
    if (!textEditor) return;
    const text = textEditor.value;
    if (text.trim()) {
      const data = { text, fontFamily: textFont, fontSize: textSize, color: textColor, bold: textBold, italic: textItalic, align: textAlign, lineSpacing: textLineSpacing, originX: textEditor.x, originY: textEditor.y };
      if (textEditor.layerId) onUpdateTextData?.(textEditor.layerId, data);
      else onAddTextLayer?.(data);
    }
    setTextEditor(null);
  };

  return (
    <main
      ref={containerRef}
      className={`viewport-container checkerboard-pattern${isDragOver ? ' viewport-drag-over' : ''}`}
      aria-label="Canvas Viewport"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onClick={onViewportClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Single transform surface — zoom/pan applied here via CSS transform */}
      <div
        className="viewport-doc-surface checkerboard-pattern"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width:  effectiveDoc.width,
          height: effectiveDoc.height,
          cursor: (isBrushOrEraser && !isHandMode && !isModalOpen) ? 'none' : undefined,
        }}
      >
        {hasDocument ? (
          <>
            {/* Real document: render the composited canvas */}
            <canvas
              ref={compositeCanvasRef}
              width={doc.width}
              height={doc.height}
              style={{ display: 'block', imageRendering: 'pixelated' }}
            />

            {textEditor && (
              <textarea
                autoFocus
                value={textEditor.value}
                onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })}
                onBlur={commitTextEditor}
                onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setTextEditor(null); } if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); commitTextEditor(); } }}
                aria-label="Text layer content"
                style={{ position: 'absolute', left: textEditor.x, top: textEditor.y, minWidth: 180, minHeight: Math.max(48, textSize * textLineSpacing * 2), zIndex: 110, resize: 'both', fontFamily: textFont, fontSize: textSize, lineHeight: textLineSpacing, color: textColor, fontWeight: textBold ? 'bold' : 'normal', fontStyle: textItalic ? 'italic' : 'normal', textAlign, background: 'rgba(20,20,24,.82)', border: '1px solid #60a5fa', outline: 'none', padding: 2 }}
              />
            )}

            {/* Selection Marching-Ants Overlay in Document Coordinates */}
            <SelectionOverlay
              doc={doc}
              zoom={zoom}
              selection={selection}
              activeSelectionDrag={activeSelectionDrag}
            />

            {/* Brush / Eraser Circular Preview Cursor in Document Space */}
            <div
              ref={cursorIndicatorRef}
              className="brush-cursor-indicator"
              style={{
                display: 'none',
                position: 'absolute',
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: '1.5px solid rgba(255, 255, 255, 0.9)',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.75)',
                zIndex: 100,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 2,
                  height: 2,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: activeTool.id === TOOLS.BRUSH.id ? brushColor : '#ffffff',
                  borderRadius: '50%',
                  boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.8)',
                }}
              />
            </div>

            {/* Interactive Crop Boundary & Handles */}
            {isCropActive && cropRect && (
              <CropOverlay
                doc={doc}
                zoom={zoom}
                cropRect={cropRect}
                onChangeCropRect={onChangeCropRect}
                cropRatio={cropRatio}
                onApply={onApplyCrop}
                onCancel={onCancelCrop}
              />
            )}
          </>
        ) : (
          /* Demo fixture while no image is open */
          <DemoDocument width={effectiveDoc.width} height={effectiveDoc.height} />
        )}
      </div>

      {/* Zoom HUD */}
      <div className="viewport-zoom-hud" aria-live="polite" aria-atomic="true">
        {zoomPercent}%
      </div>

      {/* Drag-and-drop overlay indicator */}
      {isDragOver && (
        <div className="viewport-drop-overlay">
          <div className="viewport-drop-hint">
            <FolderOpen size={32} />
            <span>Drop image to open</span>
          </div>
        </div>
      )}

      {/* Welcome overlay — shown only when no real document is open */}
      {!hasDocument && !isDragOver && (
        <div className="viewport-welcome-overlay">
          <div className="welcome-card">
            <div className="welcome-logo-badge">CS</div>
            <h1 className="welcome-title">ChromaStudio</h1>
            <p className="welcome-subtitle">
              Original, lightweight image editor with non-destructive layers,
              filters, and pixel manipulation.
            </p>

            <div className="welcome-actions-row">
              <button
                className="welcome-btn-primary"
                onClick={(e) => { e.stopPropagation(); onOpenImage?.(); }}
                title="Open image from disk"
              >
                <FolderOpen size={16} />
                <span>Open Image…</span>
              </button>
              <button
                className="welcome-btn-secondary"
                onClick={(e) => { e.stopPropagation(); alert('New Canvas — Phase 4'); }}
                title="Create a new empty document"
              >
                <FilePlus2 size={16} />
                <span>New Canvas</span>
              </button>
            </div>

            <div className="format-badges-container">
              {['PNG', 'JPEG', 'WEBP'].map(f => (
                <span key={f} className="format-badge">{f}</span>
              ))}
            </div>

            <div className="welcome-shortcuts-grid">
              <div className="shortcut-row"><span>Move Tool</span><kbd className="kbd-badge">V</kbd></div>
              <div className="shortcut-row"><span>Marquee</span><kbd className="kbd-badge">M</kbd></div>
              <div className="shortcut-row"><span>Crop</span><kbd className="kbd-badge">C</kbd></div>
              <div className="shortcut-row"><span>Brush</span><kbd className="kbd-badge">B</kbd></div>
              <div className="shortcut-row"><span>Eraser</span><kbd className="kbd-badge">E</kbd></div>
              <div className="shortcut-row"><span>Fit Screen</span><kbd className="kbd-badge">Ctrl+0</kbd></div>
              <div className="shortcut-row"><span>Undo / Redo</span><kbd className="kbd-badge">Ctrl+Z / Y</kbd></div>
            </div>

            <p className="welcome-hint">
              Drag an image here, or use <kbd className="kbd-badge">Ctrl+O</kbd> to open.
              The demo canvas behind is live — press <kbd className="kbd-badge">H</kbd> + drag to pan.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
