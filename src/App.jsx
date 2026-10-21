import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import MenuBar from './components/MenuBar/MenuBar';
import ToolOptionsBar from './components/ToolOptionsBar/ToolOptionsBar';
import ToolBar from './components/ToolBar/ToolBar';
import Viewport from './components/Viewport/Viewport';
import Dock from './components/Dock/Dock';
import StatusBar from './components/StatusBar/StatusBar';
import ImageSizeModal from './components/Modals/ImageSizeModal';
import CanvasSizeModal from './components/Modals/CanvasSizeModal';
import FilterModal from './components/Modals/FilterModal';
import ExportModal from './components/Modals/ExportModal';
import { TOOLS } from './constants/tools';
import { useDocument } from './store/useDocument';

export default function App() {
  const [activeTool, setActiveTool] = useState(TOOLS.MOVE);

  // zoomPercent is reported upward by the Viewport engine via onZoomChange.
  // App holds it only for display in StatusBar / ToolOptionsBar.
  const [zoomPercent, setZoomPercent] = useState(100);

  // cursorCoords in document space, reported by Viewport.
  const [cursorCoords, setCursorCoords] = useState(null);

  // externalAction is a stamped action object; changing it signals the
  // Viewport to execute a viewport action without lifting zoom state.
  const [externalAction, setExternalAction] = useState(null);
  const actionSeqRef = useRef(0);

  const [infoModal,         setInfoModal]         = useState(null);
  const [isImageSizeOpen,   setIsImageSizeOpen]   = useState(false);
  const [isCanvasSizeOpen,  setIsCanvasSizeOpen]  = useState(false);
  const [activeFilterModal, setActiveFilterModal] = useState(null);
  const [isExportOpen,      setIsExportOpen]      = useState(false);
  const [exportInitialFmt,  setExportInitialFmt]  = useState('png');

  const fileInputRef = useRef(null);

  // ─── Document Store with Integrated History Engine ───────────────────────
  const {
    doc,
    layers,
    activeLayerId,
    selection,
    openImageFile,
    selectLayer,
    toggleVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    renameLayer,
    addTransparentLayer,
    addAdjustmentLayer,
    addTextLayer,
    addShapeLayer,
    duplicateLayer,
    deleteLayer,
    reorderLayer,
    closeDocument,
    cropDocument,
    resizeImage,
    resizeCanvas,
    setLayerPreview,
    clearLayerPreview,
    applyLayerFilter,
    commitLayerStroke,
    updateTextData,
    updateShapeData,
    updateLayerTransform,
    updateAdjustmentData,
    setSelection,
    deselect,
    invertSelection,
    selectAll,
    clearSelectionPixels,
    moveSelectionPixels,
    history,
    undo,
    redo,
    jumpToHistory,
  } = useDocument();

  const handleUndo          = undo;
  const handleRedo          = redo;
  const handleJumpToHistory = jumpToHistory;

  const activeLayer = layers.find(l => l.id === activeLayerId) || null;

  // ─── Brush & Eraser State (Milestone: Brush & Eraser) ────────────────────
  const [brushSize, setBrushSize]         = useState(20);
  const [brushOpacity, setBrushOpacity]   = useState(100);
  const [brushColor, setBrushColor]       = useState('#ffffff');
  const [eraserSize, setEraserSize]       = useState(30);
  const [eraserOpacity, setEraserOpacity] = useState(100);
  const [fgColor, setFgColor]             = useState('#ffffff');
  const [bgColor, setBgColor]             = useState('#18181b');

  // ─── Text Tool State ─────────────────────────────────────────────────────
  const [textFont, setTextFont]           = useState('Inter');
  const [textSize, setTextSize]           = useState(32);
  const [textColor, setTextColor]         = useState('#ffffff');
  const [textBold, setTextBold]           = useState(false);
  const [textItalic, setTextItalic]       = useState(false);
  const [textAlign, setTextAlign]         = useState('left');
  const [textLineSpacing, setTextLineSpacing] = useState(1.3);

  // ─── Shape Tool State ────────────────────────────────────────────────────
  const [shapeFill, setShapeFill]           = useState('#3b82f6');
  const [shapeStroke, setShapeStroke]       = useState('none');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState(2);

  const handleCommitStroke = useCallback(async (layerId, newBitmap, label) => {
    await commitLayerStroke(layerId, newBitmap, label);
  }, [commitLayerStroke]);

  const handleSwapColors = useCallback(() => {
    setFgColor(currentFg => {
      setBgColor(currentBg => {
        setBrushColor(currentBg);
        return currentFg;
      });
      return bgColor;
    });
  }, [bgColor]);

  const handleResetColors = useCallback(() => {
    setFgColor('#ffffff');
    setBgColor('#18181b');
    setBrushColor('#ffffff');
  }, []);

  const handleChangeFgColor = useCallback((color) => {
    setFgColor(color);
    setBrushColor(color);
  }, []);

  const handleChangeBrushColor = useCallback((color) => {
    setBrushColor(color);
    setFgColor(color);
  }, []);

  const isModalOpen = Boolean(
    isImageSizeOpen || isCanvasSizeOpen || activeFilterModal || isExportOpen || infoModal
  );

  // ─── Crop Tool State (Phase 4) ───────────────────────────────────────────
  const [cropRatio, setCropRatio] = useState('free');
  const [cropRect, setCropRect] = useState(null);

  // Initialize or reset cropRect whenever document dimensions change
  useEffect(() => {
    if (doc) {
      setCropRect({ x: 0, y: 0, width: doc.width, height: doc.height });
    } else {
      setCropRect(null);
    }
  }, [doc?.width, doc?.height]);

  // Ensure cropRect is set when switching to crop tool
  useEffect(() => {
    if (activeTool.id === TOOLS.CROP.id && doc && !cropRect) {
      setCropRect({ x: 0, y: 0, width: doc.width, height: doc.height });
    }
  }, [activeTool.id, doc, cropRect]);

  // ─── Dispatch a viewport action ─────────────────────────────────────────

  const dispatchViewportAction = useCallback((type, extra = {}) => {
    actionSeqRef.current += 1;
    setExternalAction({ type, seq: actionSeqRef.current, ...extra });
  }, []);

  // ─── Zoom convenience wrappers ──────────────────────────────────────────

  const handleZoomFit = useCallback(() => dispatchViewportAction('fit'),    [dispatchViewportAction]);
  const handleZoom100 = useCallback(() => dispatchViewportAction('actual'), [dispatchViewportAction]);
  const handleZoomIn  = useCallback(() => dispatchViewportAction('in'),     [dispatchViewportAction]);
  const handleZoomOut = useCallback(() => dispatchViewportAction('out'),    [dispatchViewportAction]);

  /**
   * Called from StatusBar zoom buttons ('fit' | number).
   */
  const handleZoomChange = useCallback((value) => {
    if (value === 'fit') {
      handleZoomFit();
    } else if (typeof value === 'number') {
      dispatchViewportAction('setPercent', { value });
    }
  }, [handleZoomFit, dispatchViewportAction]);

  // ─── File Loading ────────────────────────────────────────────────────────

  const handleTriggerOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const hasUnsavedChanges = Boolean(doc && history.currentIndex > 0);
  const confirmDiscardChanges = useCallback(() => (
    !hasUnsavedChanges || window.confirm('Discard unsaved changes to the current document?')
  ), [hasUnsavedChanges]);

  const handleCloseDocument = useCallback(() => {
    if (confirmDiscardChanges()) closeDocument();
  }, [confirmDiscardChanges, closeDocument]);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (!confirmDiscardChanges()) return;
    const result = await openImageFile(file);
    if (result?.error) {
      setInfoModal({
        title: 'Cannot Open Image',
        content: result.error,
      });
    } else {
      // Auto-fit document inside viewport on initial load
      dispatchViewportAction('fit');
    }
  }, [openImageFile, dispatchViewportAction, confirmDiscardChanges]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleFileInputChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      e.target.value = ''; // Reset so the same file can be opened again
      await processFile(file);
    }
  }, [processFile]);

  const handleDropFiles = useCallback(async (fileList) => {
    const file = fileList?.[0];
    if (file) {
      await processFile(file);
    }
  }, [processFile]);

  // ─── Crop Handlers (Phase 4) ─────────────────────────────────────────────

  const handleApplyCrop = useCallback(async () => {
    if (!doc || !cropRect) return;
    await cropDocument(cropRect);
    dispatchViewportAction('fit');
  }, [doc, cropRect, cropDocument, dispatchViewportAction]);

  const handleCancelCrop = useCallback(() => {
    if (doc) {
      setCropRect({ x: 0, y: 0, width: doc.width, height: doc.height });
    }
    setActiveTool(TOOLS.MOVE);
  }, [doc]);

  const handleResetCrop = useCallback(() => {
    if (doc) {
      setCropRect({ x: 0, y: 0, width: doc.width, height: doc.height });
    }
  }, [doc]);

  // ─── Image & Canvas Resize Handlers (Phase 4) ───────────────────────────

  const handleApplyImageSize = useCallback(async (newW, newH) => {
    await resizeImage(newW, newH);
    dispatchViewportAction('fit');
  }, [resizeImage, dispatchViewportAction]);

  const handleApplyCanvasSize = useCallback(async (newW, newH, anchor) => {
    await resizeCanvas(newW, newH, anchor);
    dispatchViewportAction('fit');
  }, [resizeCanvas, dispatchViewportAction]);

  // ─── Filter Adjustment Handlers (Phase 5) ─────────────────────────────────
  const handleFilterPreview = useCallback((previewBitmap) => {
    if (activeLayerId) {
      setLayerPreview(activeLayerId, previewBitmap);
    }
  }, [activeLayerId, setLayerPreview]);

  const handleClearFilterPreview = useCallback(() => {
    if (activeLayerId) {
      clearLayerPreview(activeLayerId);
    }
  }, [activeLayerId, clearLayerPreview]);

  const handleApplyFilter = useCallback(async (newBitmap) => {
    if (activeLayerId) {
      const title = activeFilterModal?.title || 'Apply Filter';
      await applyLayerFilter(activeLayerId, newBitmap, title);
    }
  }, [activeLayerId, activeFilterModal, applyLayerFilter]);

  // ─── Menu actions ───────────────────────────────────────────────────────
  const handleMenuAction = useCallback((item) => {
    switch (item.action) {
      case 'open':         handleTriggerOpen(); break;
      case 'close':        handleCloseDocument(); break;
      case 'export-png':
        if (doc) { setExportInitialFmt('png');  setIsExportOpen(true); }
        break;
      case 'export-jpeg':
        if (doc) { setExportInitialFmt('jpeg'); setIsExportOpen(true); }
        break;
      case 'export-webp':
        if (doc) { setExportInitialFmt('webp'); setIsExportOpen(true); }
        break;
      case 'undo': handleUndo(); break;
      case 'redo': handleRedo(); break;
      case 'new-layer':
        if (doc) addTransparentLayer();
        break;
      case 'dup-layer':
        if (activeLayerId) duplicateLayer(activeLayerId);
        break;
      case 'del-layer':
        if (activeLayerId && layers.length > 1) deleteLayer(activeLayerId);
        break;
      case 'toggle-vis':
        if (activeLayerId) toggleVisibility(activeLayerId);
        break;
      case 'image-size':        if (doc) setIsImageSizeOpen(true);  break;
      case 'canvas-size':       if (doc) setIsCanvasSizeOpen(true); break;
      case 'crop-selection':
        if (activeTool.id === TOOLS.CROP.id) {
          handleApplyCrop();
        } else {
          setActiveTool(TOOLS.CROP);
        }
        break;
      case 'filter-blur':               if (activeLayer) setActiveFilterModal({ type: 'blur',               title: 'Gaussian Blur' }); break;
      case 'filter-sharpen':            if (activeLayer) setActiveFilterModal({ type: 'sharpen',            title: 'Sharpen' }); break;
      case 'filter-grayscale':          if (activeLayer) setActiveFilterModal({ type: 'grayscale',          title: 'Grayscale' }); break;
      case 'filter-sepia':              if (activeLayer) setActiveFilterModal({ type: 'sepia',              title: 'Sepia' }); break;
      case 'filter-invert':             if (activeLayer) setActiveFilterModal({ type: 'invert',             title: 'Invert Colors' }); break;
      case 'filter-brightness-contrast':if (activeLayer) setActiveFilterModal({ type: 'brightness-contrast',title: 'Brightness & Contrast' }); break;
      case 'filter-hue-saturation':     if (activeLayer) setActiveFilterModal({ type: 'hue-saturation',     title: 'Hue & Saturation' }); break;
      case 'fit-screen':  handleZoomFit();  break;
      case 'actual-size': handleZoom100();  break;
      case 'zoom-in':     handleZoomIn();   break;
      case 'zoom-out':    handleZoomOut();  break;
      case 'select-all':        if (doc) selectAll(); break;
      case 'deselect':          deselect();           break;
      case 'invert-sel':        invertSelection();    break;
      case 'clear-selection':   clearSelectionPixels(); break;
      case 'shortcuts':
        setInfoModal({
          title: 'Keyboard Shortcuts',
          content:
            'Tools: V Move · M Marquee (Rect/Ellipse) · C Crop · B Brush · E Eraser · T Text · H Hand · Z Zoom\n' +
            'Selection: Ctrl+A Select All · Ctrl+D Deselect · Ctrl+Shift+I Invert · Del Clear Pixels\n' +
            'Undo/Redo: Ctrl+Z Undo · Ctrl+Y / Ctrl+Shift+Z Redo\n' +
            'Filters: Ctrl+I Invert Colors\n' +
            'Export: Ctrl+Shift+E Export PNG\n' +
            'Crop: Enter Apply · Esc Cancel\n' +
            'Image: Alt+Ctrl+I Image Size · Alt+Ctrl+C Canvas Size\n' +
            'Layers: Ctrl+Shift+N New Layer · Ctrl+J Duplicate · Del Delete\n' +
            'Viewport: Ctrl+0 Fit · Ctrl+1 100% · Ctrl+= Zoom In · Ctrl+– Zoom Out\n' +
            'Pan: H or Space + Drag · Zoom: Ctrl + Mouse Wheel',
        });
        break;
      case 'about':
        setInfoModal({
          title: 'About ChromaStudio',
          content: 'ChromaStudio — Milestone 8: Text & Shape Tools. Built with React + Vite.',
        });
        break;
      default:
        break;
    }
  }, [
    handleTriggerOpen, handleCloseDocument,
    addTransparentLayer, activeLayerId, activeLayer, layers.length,
    duplicateLayer, deleteLayer, toggleVisibility,
    doc, activeTool.id, handleApplyCrop,
    handleZoomFit, handleZoom100, handleZoomIn, handleZoomOut,
    handleUndo, handleRedo,
    selectAll, deselect, invertSelection, clearSelectionPixels,
  ]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.target.isContentEditable) return;

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Redo: Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Redo: Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Image Size: Alt+Ctrl+I
      if (e.altKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        if (doc) setIsImageSizeOpen(true);
        return;
      }
      // Canvas Size: Alt+Ctrl+C
      if (e.altKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (doc) setIsCanvasSizeOpen(true);
        return;
      }
      // Export PNG: Ctrl+Shift+E
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (doc) { setExportInitialFmt('png'); setIsExportOpen(true); }
        return;
      }
      // Invert Colors: Ctrl+I (without Alt or Shift)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        if (activeLayer) setActiveFilterModal({ type: 'invert', title: 'Invert Colors' });
        return;
      }

      // Inverse Selection: Ctrl+Shift+I
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        invertSelection();
        return;
      }

      // Deselect: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        deselect();
        return;
      }

      // Select All: Ctrl+A
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (doc) selectAll();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          handleTriggerOpen();
          return;
        }
        if (e.shiftKey && e.key.toLowerCase() === 'n') {
          e.preventDefault();
          if (doc) addTransparentLayer();
          return;
        }
        if (e.key.toLowerCase() === 'j') {
          e.preventDefault();
          if (activeLayerId) duplicateLayer(activeLayerId);
          return;
        }
        return; // let Viewport handle Ctrl+0/1/+/-
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        if (selection) {
          e.preventDefault();
          deselect();
          return;
        }
      }

      // Clear selected pixels, or delete active layer if no selection
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection) {
          e.preventDefault();
          clearSelectionPixels();
          return;
        }
        if (activeLayerId && layers.length > 1) {
          e.preventDefault();
          deleteLayer(activeLayerId);
          return;
        }
      }

      // Color swap: X
      if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleSwapColors();
        return;
      }

      // Color reset: D
      if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleResetColors();
        return;
      }

      // Tool shortcuts (V, M, C, B, E, T, U, H, Z)
      const key = e.key.toUpperCase();
      if (key === 'M' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveTool(prev => prev.id === TOOLS.SELECT.id ? TOOLS.SELECT_ELLIPSE : TOOLS.SELECT);
        return;
      }
      if (key === 'U' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActiveTool(prev => {
          if (prev.id === TOOLS.SHAPE_RECT.id) return TOOLS.SHAPE_ELLIPSE;
          if (prev.id === TOOLS.SHAPE_ELLIPSE.id) return TOOLS.SHAPE_LINE;
          return TOOLS.SHAPE_RECT;
        });
        return;
      }
      const matched = Object.values(TOOLS).find(t => t.shortcut === key);
      if (matched) setActiveTool(matched);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [doc, activeLayerId, activeLayer, layers.length, selection,
      handleTriggerOpen, addTransparentLayer, duplicateLayer, deleteLayer,
      handleUndo, handleRedo, handleSwapColors, handleResetColors,
      deselect, invertSelection, selectAll, clearSelectionPixels]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="app-workspace-layout">
      {/* Hidden file input for local image loading */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* 1. Menu Bar */}
      <MenuBar
        onMenuAction={handleMenuAction}
        hasDocument={Boolean(doc)}
        hasActiveLayer={Boolean(activeLayerId)}
        hasSelection={Boolean(selection)}
        canDeleteLayer={layers.length > 1}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
      />

      {/* 2. Tool Options Bar */}
        <ToolOptionsBar
        activeTool={activeTool}
        zoomLevel={zoomPercent}
        onZoomFit={handleZoomFit}
        onZoom100={handleZoom100}
        cropRatio={cropRatio}
        onCropRatioChange={setCropRatio}
        onApplyCrop={handleApplyCrop}
        onCancelCrop={handleCancelCrop}
        onResetCrop={handleResetCrop}
        cropDimensions={cropRect}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        brushOpacity={brushOpacity}
        onBrushOpacityChange={setBrushOpacity}
        brushColor={brushColor}
        onBrushColorChange={handleChangeBrushColor}
        eraserSize={eraserSize}
        onEraserSizeChange={setEraserSize}
        eraserOpacity={eraserOpacity}
        onEraserOpacityChange={setEraserOpacity}
        selection={selection}
        onSelectTool={setActiveTool}
        onDeselect={deselect}
        onInvertSelection={invertSelection}
        onClearSelectionPixels={clearSelectionPixels}
        onSelectAll={selectAll}
        // Text tool props
        textFont={textFont}
        onTextFontChange={setTextFont}
        textSize={textSize}
        onTextSizeChange={setTextSize}
        textColor={textColor}
        onTextColorChange={setTextColor}
        textBold={textBold}
        onTextBoldChange={setTextBold}
        textItalic={textItalic}
        onTextItalicChange={setTextItalic}
        textAlign={textAlign}
        onTextAlignChange={setTextAlign}
        textLineSpacing={textLineSpacing}
        onTextLineSpacingChange={setTextLineSpacing}
        // Shape tool props
        shapeFill={shapeFill}
        onShapeFillChange={setShapeFill}
        shapeStroke={shapeStroke}
        onShapeStrokeChange={setShapeStroke}
        shapeStrokeWidth={shapeStrokeWidth}
          onShapeStrokeWidthChange={setShapeStrokeWidth}
          activeLayer={activeLayer}
          onUpdateLayerTransform={updateLayerTransform}
          onUpdateAdjustmentData={updateAdjustmentData}
      />

      {/* 3. Center Workspace */}
      <div className="app-center-stage">
        <ToolBar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          fgColor={fgColor}
          bgColor={bgColor}
          onChangeFgColor={handleChangeFgColor}
          onChangeBgColor={setBgColor}
          onSwapColors={handleSwapColors}
          onResetColors={handleResetColors}
        />

        <Viewport
          activeTool={activeTool}
          document={doc}
          layers={layers}
          activeLayerId={activeLayerId}
          onCommitStroke={handleCommitStroke}
          isModalOpen={isModalOpen}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          brushColor={brushColor}
          eraserSize={eraserSize}
          eraserOpacity={eraserOpacity}
          onBrushSizeChange={setBrushSize}
          onEraserSizeChange={setEraserSize}
          onZoomChange={setZoomPercent}
          onCursorChange={setCursorCoords}
          externalAction={externalAction}
          onOpenImage={handleTriggerOpen}
          onDropFiles={handleDropFiles}
          cropRect={cropRect}
          onChangeCropRect={setCropRect}
          cropRatio={cropRatio}
          onApplyCrop={handleApplyCrop}
          onCancelCrop={handleCancelCrop}
          selection={selection}
          onSetSelection={setSelection}
          onDeselect={deselect}
          onMoveSelectionPixels={moveSelectionPixels}
          // Text tool props
          textFont={textFont}
          textSize={textSize}
          textColor={textColor}
          textBold={textBold}
          textItalic={textItalic}
          textAlign={textAlign}
          textLineSpacing={textLineSpacing}
          onAddTextLayer={addTextLayer}
          onUpdateTextData={updateTextData}
          // Shape tool props
          shapeFill={shapeFill}
          shapeStroke={shapeStroke}
          shapeStrokeWidth={shapeStrokeWidth}
          onAddShapeLayer={addShapeLayer}
          onUpdateShapeData={updateShapeData}
          onSelectLayer={selectLayer}
        />

        <Dock
          doc={doc}
          layers={layers}
          activeLayerId={activeLayerId}
          onSelectLayer={selectLayer}
          onToggleLayerVisibility={toggleVisibility}
          onSetLayerOpacity={setLayerOpacity}
          onSetLayerBlendMode={setLayerBlendMode}
          onRenameLayer={renameLayer}
          onAddTransparentLayer={addTransparentLayer}
          onDuplicateLayer={duplicateLayer}
          onDeleteLayer={deleteLayer}
          onReorderLayer={reorderLayer}
          onAddAdjustmentLayer={addAdjustmentLayer}
          historyEntries={history.entries}
          historyCurrentIndex={history.currentIndex}
          onJumpToHistory={handleJumpToHistory}
        />
      </div>

      {/* 4. Status Bar */}
      <StatusBar
        zoomLevel={zoomPercent}
        onZoomChange={handleZoomChange}
        documentDimensions={doc ? { width: doc.width, height: doc.height, dpi: 72 } : null}
        cursorCoords={cursorCoords}
      />

      {/* Image Size Modal */}
      <ImageSizeModal
        doc={doc}
        isOpen={isImageSizeOpen}
        onClose={() => setIsImageSizeOpen(false)}
        onApply={handleApplyImageSize}
      />

      {/* Canvas Size Modal */}
      <CanvasSizeModal
        doc={doc}
        isOpen={isCanvasSizeOpen}
        onClose={() => setIsCanvasSizeOpen(false)}
        onApply={handleApplyCanvasSize}
      />

      {/* Filter Adjustment Modal (Phase 5) */}
      <FilterModal
        isOpen={Boolean(activeFilterModal)}
        filterType={activeFilterModal?.type}
        filterTitle={activeFilterModal?.title}
        activeLayer={activeLayer}
        doc={doc}
        selection={selection}
        onClose={() => setActiveFilterModal(null)}
        onApply={handleApplyFilter}
        onPreview={handleFilterPreview}
        onClearPreview={handleClearFilterPreview}
      />

      {/* Export Modal (Phase 6) */}
      <ExportModal
        isOpen={isExportOpen}
        doc={doc}
        layers={layers}
        initialFormat={exportInitialFmt}
        onClose={() => setIsExportOpen(false)}
      />

      {/* Feedback / Error Modal */}
      {infoModal && (
        <div className="app-modal-backdrop" onClick={() => setInfoModal(null)}>
          <div className="app-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="app-dialog-header">
              <h3 className="app-dialog-title">{infoModal.title}</h3>
              <button
                className="app-dialog-close-btn"
                onClick={() => setInfoModal(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div className="app-dialog-body">
              <p style={{ whiteSpace: 'pre-line' }}>{infoModal.content}</p>
            </div>
            <div className="app-dialog-footer">
              <button className="app-dialog-btn" onClick={() => setInfoModal(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
