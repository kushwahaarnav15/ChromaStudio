import React, { useState, useRef, useCallback } from 'react';
import './Dock.css';
import {
  Layers,
  History,
  Sliders,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  X,
} from 'lucide-react';

const BLEND_MODES = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply',    label: 'Multiply' },
  { value: 'screen',      label: 'Screen' },
  { value: 'overlay',     label: 'Overlay' },
  { value: 'darken',      label: 'Darken' },
  { value: 'lighten',     label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn',  label: 'Color Burn' },
  { value: 'hard-light',  label: 'Hard Light' },
  { value: 'soft-light',  label: 'Soft Light' },
  { value: 'difference',  label: 'Difference' },
  { value: 'exclusion',   label: 'Exclusion' },
  { value: 'hue',         label: 'Hue' },
  { value: 'saturation',  label: 'Saturation' },
  { value: 'color',       label: 'Color' },
  { value: 'luminosity',  label: 'Luminosity' },
];

// ─── Inline rename field ───────────────────────────────────────────────────────

function LayerNameEditor({ layer, onRename, onCancel }) {
  const [value, setValue] = useState(layer.name);
  const inputRef = useRef(null);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onRename(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      className="layer-rename-input"
      value={value}
      autoFocus
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        e.stopPropagation(); // prevent tool shortcuts from firing
      }}
      onClick={e => e.stopPropagation()}
    />
  );
}

// ─── Single layer row ──────────────────────────────────────────────────────────

function LayerRow({
  layer,
  isActive,
  isFirst,
  isLast,
  onSelect,
  onToggleVisibility,
  onStartRename,
  isRenaming,
  onRename,
  onCancelRename,
  onMoveUp,
  onMoveDown,
}) {
  return (
    <div
      className={`layer-item${isActive ? ' active' : ''}${!layer.visible ? ' layer-hidden' : ''}`}
      onClick={() => onSelect(layer.id)}
      title={layer.name}
    >
      {/* Visibility toggle */}
      <button
        className="layer-vis-btn"
        onClick={e => { e.stopPropagation(); onToggleVisibility(layer.id); }}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        aria-label="Toggle visibility"
      >
        {layer.visible
          ? <Eye size={13} />
          : <EyeOff size={13} style={{ color: 'var(--text-muted)' }} />
        }
      </button>

      {/* Thumbnail */}
      <div className="layer-thumb-box checkerboard-pattern">
        {layer.thumbnail && (
          <img
            src={layer.thumbnail}
            alt=""
            className="layer-thumb-img"
            draggable={false}
          />
        )}
      </div>

      {/* Name / rename */}
      <div className="layer-name-wrapper">
        {isRenaming ? (
          <LayerNameEditor
            layer={layer}
            onRename={name => onRename(layer.id, name)}
            onCancel={onCancelRename}
          />
        ) : (
          <span
            className="layer-name-text"
            onDoubleClick={e => { e.stopPropagation(); onStartRename(layer.id); }}
          >
            {layer.name}
          </span>
        )}
      </div>

      {/* Opacity badge */}
      <span className="layer-badge-dim" title="Layer opacity">
        {layer.opacity}%
      </span>

      {/* Reorder arrows (show only on active layer) */}
      {isActive && (
        <div className="layer-reorder-btns" onClick={e => e.stopPropagation()}>
          <button
            className="layer-reorder-btn"
            disabled={isLast}
            onClick={() => onMoveUp(layer.id)}
            title="Move layer up"
          >
            <ChevronUp size={11} />
          </button>
          <button
            className="layer-reorder-btn"
            disabled={isFirst}
            onClick={() => onMoveDown(layer.id)}
            title="Move layer down"
          >
            <ChevronDown size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Dock component ───────────────────────────────────────────────────────

export default function Dock({
  // Document state
  doc = null,
  layers = [],
  activeLayerId = null,
  // Layer action callbacks
  onSelectLayer,
  onToggleLayerVisibility,
  onSetLayerOpacity,
  onSetLayerBlendMode,
  onRenameLayer,
  onAddTransparentLayer,
  onAddAdjustmentLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onReorderLayer,
  // History props (Phase 6)
  historyEntries = [],
  historyCurrentIndex = -1,
  onJumpToHistory,
}) {
  const [activeTab, setActiveTab] = useState('layers');
  const [renamingId, setRenamingId] = useState(null);

  const activeLayer = layers.find(l => l.id === activeLayerId) ?? null;

  // The Layers panel shows layers top-to-bottom (reversed from the stack).
  // layers[last] = top; layers[0] = bottom.
  const displayedLayers = [...layers].reverse();

  // ─── Reorder helpers ──────────────────────────────────────────────────────
  // "Move up" in the panel = higher index in the stack array.

  const handleMoveUp = useCallback((layerId) => {
    const idx = layers.findIndex(l => l.id === layerId);
    if (idx < layers.length - 1) onReorderLayer?.(layerId, idx + 1);
  }, [layers, onReorderLayer]);

  const handleMoveDown = useCallback((layerId) => {
    const idx = layers.findIndex(l => l.id === layerId);
    if (idx > 0) onReorderLayer?.(layerId, idx - 1);
  }, [layers, onReorderLayer]);

  // ─── Active-layer blend/opacity controls ─────────────────────────────────

  const handleBlendChange = (e) => {
    if (activeLayer) onSetLayerBlendMode?.(activeLayer.id, e.target.value);
  };

  const handleOpacityChange = (val) => {
    const v = Math.max(0, Math.min(100, Number(val)));
    if (activeLayer) onSetLayerOpacity?.(activeLayer.id, v);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <aside className="dock-container" aria-label="Inspector Panels">
      {/* Tab bar */}
      <div className="dock-header-tabs" role="tablist">
        <button
          className={`dock-tab-btn ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => setActiveTab('layers')}
          role="tab"
          aria-selected={activeTab === 'layers'}
        >
          <Layers size={14} />
          <span>Layers</span>
        </button>
        <button
          className={`dock-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          role="tab"
          aria-selected={activeTab === 'history'}
        >
          <History size={14} />
          <span>History</span>
        </button>
        <button
          className={`dock-tab-btn ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
          role="tab"
          aria-selected={activeTab === 'properties'}
        >
          <Sliders size={14} />
          <span>Properties</span>
        </button>
      </div>

      <div className="dock-body">

        {/* ── LAYERS TAB ── */}
        {activeTab === 'layers' && (
          <div className="layers-panel">

            {/* Blend mode + opacity for active layer */}
            <div className="layers-controls-bar">
              <select
                className="layers-blend-select"
                value={activeLayer?.blendMode ?? 'source-over'}
                onChange={handleBlendChange}
                disabled={!activeLayer}
                title="Layer blend mode"
              >
                {BLEND_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <div className="layers-opacity-control">
                <span>Op:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={activeLayer?.opacity ?? 100}
                  onChange={e => handleOpacityChange(e.target.value)}
                  disabled={!activeLayer}
                  className="layers-opacity-input"
                  title="Layer opacity (%)"
                  onClick={e => e.stopPropagation()}
                />
                <span>%</span>
              </div>
            </div>

            {/* Layer list */}
            <div className="layers-list">
              {layers.length === 0 ? (
                <div className="layers-empty-hint">
                  Open an image to start working with layers.
                </div>
              ) : (
                displayedLayers.map((layer, displayIdx) => {
                  // displayedLayers is reversed: displayIdx 0 = top of panel = last in array
                  const stackIdx = layers.findIndex(l => l.id === layer.id);
                  const isFirst = stackIdx === 0;              // bottom of stack
                  const isLast  = stackIdx === layers.length - 1; // top of stack
                  return (
                    <LayerRow
                      key={layer.id}
                      layer={layer}
                      isActive={layer.id === activeLayerId}
                      isFirst={isFirst}
                      isLast={isLast}
                      onSelect={id => { onSelectLayer?.(id); setRenamingId(null); }}
                      onToggleVisibility={onToggleLayerVisibility}
                      isRenaming={renamingId === layer.id}
                      onStartRename={setRenamingId}
                      onRename={(id, name) => { onRenameLayer?.(id, name); setRenamingId(null); }}
                      onCancelRename={() => setRenamingId(null)}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  );
                })
              )}
            </div>

            {/* Footer toolbar */}
            <div className="layers-footer-toolbar">
              <button className="layer-footer-btn" onClick={() => onAddAdjustmentLayer?.()} title="New non-destructive adjustment layer" aria-label="New Adjustment Layer" disabled={!doc}>◐</button>
              <button
                className="layer-footer-btn"
                onClick={() => onAddTransparentLayer?.()}
                title="New transparent layer"
                aria-label="New Layer"
                disabled={!doc}
              >
                <Plus size={14} />
              </button>
              <button
                className="layer-footer-btn"
                onClick={() => activeLayer && onDuplicateLayer?.(activeLayer.id)}
                title="Duplicate layer"
                aria-label="Duplicate Layer"
                disabled={!activeLayer}
              >
                <Copy size={13} />
              </button>
              <button
                className="layer-footer-btn layer-footer-btn--danger"
                onClick={() => activeLayer && onDeleteLayer?.(activeLayer.id)}
                title="Delete layer"
                aria-label="Delete Layer"
                disabled={!activeLayer || layers.length <= 1}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="history-panel">
            {historyEntries.length === 0 ? (
              <div className="layers-empty-hint">
                No history yet. Open an image or make an edit.
              </div>
            ) : (
              historyEntries.map((entry) => {
                const isCurrent = entry.index === historyCurrentIndex;
                const isFuture  = entry.index > historyCurrentIndex;
                return (
                  <button
                    key={entry.index}
                    className={`history-item${isCurrent ? ' active' : ''}${isFuture ? ' future' : ''}`}
                    onClick={() => onJumpToHistory?.(entry.index)}
                    title={`Jump to: ${entry.label}`}
                  >
                    <span className="history-index-badge">
                      {entry.index + 1}
                    </span>
                    <span className="history-label-text">{entry.label}</span>
                    {isCurrent && <span className="history-active-indicator" />}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── PROPERTIES TAB ── */}
        {activeTab === 'properties' && (
          <div className="properties-panel">
            <div className="property-group">
              <span className="property-group-title">Document</span>
              <div className="property-row">
                <span className="property-label">Dimensions</span>
                <span className="property-value">
                  {doc ? `${doc.width} × ${doc.height} px` : 'No document open'}
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Name</span>
                <span className="property-value" title={doc?.name}>
                  {doc ? doc.name : '—'}
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Color Space</span>
                <span className="property-value">
                  {doc ? `${doc.colorSpace} / ${doc.bitsPerChannel}-bit` : '—'}
                </span>
              </div>
            </div>

            {activeLayer && (
              <div className="property-group">
                <span className="property-group-title">Active Layer</span>
                <div className="property-row">
                  <span className="property-label">Name</span>
                  <span className="property-value">{activeLayer.name}</span>
                </div>
                <div className="property-row">
                  <span className="property-label">Size</span>
                  <span className="property-value">{activeLayer.width} × {activeLayer.height} px</span>
                </div>
                <div className="property-row">
                  <span className="property-label">Type</span>
                  <span className="property-value">{activeLayer.type}</span>
                </div>
                <div className="property-row">
                  <span className="property-label">Opacity</span>
                  <span className="property-value">{activeLayer.opacity}%</span>
                </div>
                <div className="property-row">
                  <span className="property-label">Blend</span>
                  <span className="property-value">
                    {BLEND_MODES.find(m => m.value === activeLayer.blendMode)?.label ?? activeLayer.blendMode}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
