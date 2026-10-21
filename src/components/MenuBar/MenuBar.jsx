import React, { useState, useEffect, useRef } from 'react';
import './MenuBar.css';

export default function MenuBar({
  onMenuAction,
  hasDocument = false,
  hasActiveLayer = false,
  hasSelection = false,
  canDeleteLayer = false,
  canUndo = false,
  canRedo = false,
}) {
  const [activeMenuId, setActiveMenuId] = useState(null);
  const menuBarRef = useRef(null);

  const menuStructure = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'open',         label: 'Open Image...',    shortcut: 'Ctrl+O',        action: 'open' },
        { id: 'open-recent',  label: 'Open Recent',      disabled: true },
        { type: 'divider' },
        { id: 'save',         label: 'Save Project',     shortcut: 'Ctrl+S',        disabled: true },
        { id: 'export-png',   label: 'Export as PNG...', shortcut: 'Ctrl+Shift+E',  action: 'export-png',  disabled: !hasDocument },
        { id: 'export-jpeg',  label: 'Export as JPEG...', action: 'export-jpeg', disabled: !hasDocument },
        { id: 'export-webp',  label: 'Export as WebP...', action: 'export-webp', disabled: !hasDocument },
        { type: 'divider' },
        { id: 'close',        label: 'Close Document',   shortcut: 'Ctrl+W',        action: 'close',       disabled: !hasDocument },
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z',       action: 'undo', disabled: !canUndo },
        { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y',       action: 'redo', disabled: !canRedo },
        { type: 'divider' },
        { id: 'clear-selection', label: 'Clear Selected Pixels', shortcut: 'Delete', action: 'clear-selection', disabled: !hasSelection || !hasActiveLayer },
        { type: 'divider' },
        { id: 'cut',       label: 'Cut',            shortcut: 'Ctrl+X', disabled: true },
        { id: 'copy',      label: 'Copy',           shortcut: 'Ctrl+C', disabled: true },
        { id: 'paste',     label: 'Paste',          shortcut: 'Ctrl+V', disabled: true },
        { type: 'divider' },
        { id: 'transform', label: 'Free Transform', shortcut: 'Ctrl+T', disabled: true },
      ]
    },
    {
      id: 'image',
      label: 'Image',
      items: [
        { id: 'canvas-size', label: 'Canvas Size...', shortcut: 'Alt+Ctrl+C', action: 'canvas-size', disabled: !hasDocument },
        { id: 'image-size', label: 'Image Size...', shortcut: 'Alt+Ctrl+I', action: 'image-size', disabled: !hasDocument },
        { id: 'crop-selection', label: 'Crop', action: 'crop-selection', disabled: !hasDocument },
        { type: 'divider' },
        { id: 'adjust-brightness', label: 'Brightness & Contrast...', action: 'filter-brightness-contrast', disabled: !hasActiveLayer },
        { id: 'adjust-huesat', label: 'Hue & Saturation...', action: 'filter-hue-saturation', disabled: !hasActiveLayer },
        { id: 'adjust-invert', label: 'Invert Colors', shortcut: 'Ctrl+I', action: 'filter-invert', disabled: !hasActiveLayer }
      ]
    },
    {
      id: 'layer',
      label: 'Layer',
      items: [
        { id: 'new-layer', label: 'New Layer', shortcut: 'Ctrl+Shift+N', action: 'new-layer', disabled: !hasDocument },
        { id: 'dup-layer', label: 'Duplicate Layer', shortcut: 'Ctrl+J', action: 'dup-layer', disabled: !hasActiveLayer },
        { id: 'del-layer', label: 'Delete Layer', action: 'del-layer', disabled: !canDeleteLayer },
        { type: 'divider' },
        { id: 'toggle-vis', label: 'Hide / Show Layer', action: 'toggle-vis', disabled: !hasActiveLayer },
        { id: 'merge-down', label: 'Merge Down', shortcut: 'Ctrl+E', disabled: true }
      ]
    },
    {
      id: 'select',
      label: 'Select',
      items: [
        { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', action: 'select-all', disabled: !hasDocument },
        { id: 'deselect', label: 'Deselect', shortcut: 'Ctrl+D', action: 'deselect', disabled: !hasSelection },
        { id: 'invert-sel', label: 'Inverse Selection', shortcut: 'Ctrl+Shift+I', action: 'invert-sel', disabled: !hasSelection }
      ]
    },
    {
      id: 'filter',
      label: 'Filter',
      items: [
        { id: 'blur-gaussian', label: 'Gaussian Blur...', action: 'filter-blur', disabled: !hasActiveLayer },
        { id: 'sharpen', label: 'Sharpen...', action: 'filter-sharpen', disabled: !hasActiveLayer },
        { type: 'divider' },
        { id: 'grayscale', label: 'Grayscale...', action: 'filter-grayscale', disabled: !hasActiveLayer },
        { id: 'sepia', label: 'Sepia...', action: 'filter-sepia', disabled: !hasActiveLayer },
        { id: 'invert', label: 'Invert Colors', shortcut: 'Ctrl+I', action: 'filter-invert', disabled: !hasActiveLayer },
        { type: 'divider' },
        { id: 'brightness-contrast', label: 'Brightness & Contrast...', action: 'filter-brightness-contrast', disabled: !hasActiveLayer },
        { id: 'hue-saturation', label: 'Hue & Saturation...', action: 'filter-hue-saturation', disabled: !hasActiveLayer }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'zoom-in', label: 'Zoom In', shortcut: 'Ctrl++', action: 'zoom-in' },
        { id: 'zoom-out', label: 'Zoom Out', shortcut: 'Ctrl+-', action: 'zoom-out' },
        { id: 'fit-screen', label: 'Fit to Screen', shortcut: 'Ctrl+0', action: 'fit-screen' },
        { id: 'actual-size', label: '100% Actual Size', shortcut: 'Ctrl+1', action: 'actual-size' }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'shortcuts', label: 'Keyboard Shortcuts', action: 'shortcuts' },
        { type: 'divider' },
        { id: 'about', label: 'About ChromaStudio', action: 'about' }
      ]
    }
  ];

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menuId) => {
    setActiveMenuId(prev => prev === menuId ? null : menuId);
  };

  const handleMenuHover = (menuId) => {
    if (activeMenuId !== null && activeMenuId !== menuId) {
      setActiveMenuId(menuId);
    }
  };

  const handleItemClick = (item) => {
    if (item.disabled) return;
    setActiveMenuId(null);
    if (onMenuAction) {
      onMenuAction(item);
    }
  };

  return (
    <header className="menu-bar" ref={menuBarRef}>
      <div className="menu-bar-left">
        <div className="brand-badge">
          <div className="brand-icon">CS</div>
          <span>ChromaStudio</span>
        </div>

        {menuStructure.map(menu => {
          const isOpen = activeMenuId === menu.id;
          return (
            <div key={menu.id} className="menu-item-container">
              <button
                className={`menu-trigger-btn ${isOpen ? 'active' : ''}`}
                onClick={() => handleMenuClick(menu.id)}
                onMouseEnter={() => handleMenuHover(menu.id)}
                aria-expanded={isOpen}
              >
                {menu.label}
              </button>

              {isOpen && (
                <div className="dropdown-menu" role="menu">
                  {menu.items.map((item, idx) => {
                    if (item.type === 'divider') {
                      return <div key={`div-${idx}`} className="dropdown-divider" />;
                    }
                    return (
                      <button
                        key={item.id}
                        className={`dropdown-item ${item.disabled ? 'disabled' : ''}`}
                        onClick={() => handleItemClick(item)}
                        disabled={item.disabled}
                        role="menuitem"
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <span className="dropdown-shortcut">{item.shortcut}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="menu-bar-right">
        <span className="version-tag">Phase 6 • Undo/Redo & Export</span>
      </div>
    </header>
  );
}
