import React, { useState } from 'react';
import './ToolBar.css';
import { TOOLS } from '../../constants/tools';
import {
  Move,
  BoxSelect,
  Circle,
  Crop,
  Paintbrush,
  Eraser,
  Type,
  RectangleHorizontal,
  CircleDot,
  Minus,
  Hand,
  ZoomIn,
  ArrowRightLeft,
  RotateCcw
} from 'lucide-react';

const TOOL_ICONS = {
  [TOOLS.MOVE.id]: Move,
  [TOOLS.SELECT.id]: BoxSelect,
  [TOOLS.SELECT_ELLIPSE.id]: Circle,
  [TOOLS.CROP.id]: Crop,
  [TOOLS.BRUSH.id]: Paintbrush,
  [TOOLS.ERASER.id]: Eraser,
  [TOOLS.TEXT.id]: Type,
  [TOOLS.SHAPE_RECT.id]: RectangleHorizontal,
  [TOOLS.SHAPE_ELLIPSE.id]: CircleDot,
  [TOOLS.SHAPE_LINE.id]: Minus,
  [TOOLS.HAND.id]: Hand,
  [TOOLS.ZOOM.id]: ZoomIn
};

export default function ToolBar({
  activeTool,
  onSelectTool,
  fgColor: controlledFgColor,
  bgColor: controlledBgColor,
  onChangeFgColor,
  onChangeBgColor,
  onSwapColors,
  onResetColors,
}) {
  const [internalFg, setInternalFg] = useState('#ffffff');
  const [internalBg, setInternalBg] = useState('#18181b');

  const fgColor = controlledFgColor ?? internalFg;
  const bgColor = controlledBgColor ?? internalBg;

  const fgInputRef = React.useRef(null);
  const bgInputRef = React.useRef(null);

  const handleSwapColors = () => {
    if (onSwapColors) {
      onSwapColors();
    } else {
      setInternalFg(bgColor);
      setInternalBg(fgColor);
    }
  };

  const handleResetColors = () => {
    if (onResetColors) {
      onResetColors();
    } else {
      setInternalFg('#ffffff');
      setInternalBg('#18181b');
    }
  };

  const handleFgChange = (e) => {
    const val = e.target.value;
    if (onChangeFgColor) onChangeFgColor(val);
    else setInternalFg(val);
  };

  const handleBgChange = (e) => {
    const val = e.target.value;
    if (onChangeBgColor) onChangeBgColor(val);
    else setInternalBg(val);
  };

  return (
    <aside className="toolbar-container" aria-label="Tools">
      {Object.values(TOOLS).map(tool => {
        const Icon = TOOL_ICONS[tool.id] || Move;
        const isActive = activeTool.id === tool.id;

        return (
          <button
            key={tool.id}
            className={`tool-button ${isActive ? 'active' : ''}`}
            onClick={() => onSelectTool(tool)}
            title={`${tool.name} (${tool.shortcut})\n${tool.description}`}
            aria-label={tool.name}
            aria-pressed={isActive}
          >
            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="tool-shortcut-badge">{tool.shortcut}</span>
          </button>
        );
      })}

      <div className="toolbar-divider" />

      {/* Foreground / Background Color Swatches */}
      <div className="color-swatches-section" title="Color Picker & Palette">
        <input
          ref={fgInputRef}
          type="color"
          value={fgColor}
          onChange={handleFgChange}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          aria-hidden="true"
        />
        <input
          ref={bgInputRef}
          type="color"
          value={bgColor}
          onChange={handleBgChange}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          aria-hidden="true"
        />

        <button
          className="swatch-swap-btn"
          onClick={handleSwapColors}
          title="Switch Foreground and Background Colors (X)"
          aria-label="Swap colors"
        >
          <ArrowRightLeft size={10} />
        </button>

        <div
          className="swatch-box swatch-foreground"
          style={{ backgroundColor: fgColor, cursor: 'pointer' }}
          onClick={() => fgInputRef.current?.click()}
          title={`Foreground Color: ${fgColor} (Click to change)`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fgInputRef.current?.click(); }}
        />

        <div
          className="swatch-box swatch-background"
          style={{ backgroundColor: bgColor, cursor: 'pointer' }}
          onClick={() => bgInputRef.current?.click()}
          title={`Background Color: ${bgColor} (Click to change)`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') bgInputRef.current?.click(); }}
        />

        <button
          className="swatch-reset-btn"
          onClick={handleResetColors}
          title="Default Colors: White/Black (D)"
          aria-label="Reset colors"
        >
          <RotateCcw size={9} />
        </button>
      </div>
    </aside>
  );
}
