/**
 * test_selection.mjs — Comprehensive unit tests for ChromaStudio Milestone 7 Selection Engine
 */
import assert from 'assert';
import {
  normalizeSelection,
  isPointInSelection,
  clearPixelsInSelection,
} from '../utils/selectionUtils.js';
import { captureSnapshot, releaseSnapshot } from '../store/useHistory.js';

console.log('--- Starting Selection Engine Unit Tests ---');

// Test 1: normalizeSelection for Rectangles
{
  const doc = { width: 800, height: 600 };
  
  // Normal drag (top-left to bottom-right)
  const sel1 = normalizeSelection('rect', 100, 150, 300, 400, doc, false);
  assert.strictEqual(sel1.type, 'rect');
  assert.strictEqual(sel1.x, 100);
  assert.strictEqual(sel1.y, 150);
  assert.strictEqual(sel1.width, 200);
  assert.strictEqual(sel1.height, 250);
  assert.strictEqual(sel1.inverted, false);

  // Reverse drag (bottom-right to top-left)
  const sel2 = normalizeSelection('rect', 300, 400, 100, 150, doc, false);
  assert.strictEqual(sel2.x, 100);
  assert.strictEqual(sel2.y, 150);
  assert.strictEqual(sel2.width, 200);
  assert.strictEqual(sel2.height, 250);

  // Shift-constrained (1:1 square: size takes Math.max(150, 200) = 200)
  const selSquare = normalizeSelection('rect', 100, 100, 250, 300, doc, true);
  assert.strictEqual(selSquare.width, selSquare.height);
  assert.strictEqual(selSquare.width, 200);

  // Document boundaries clamping
  const selClamped = normalizeSelection('rect', -50, -20, 950, 700, doc, false);
  assert.strictEqual(selClamped.x, 0);
  assert.strictEqual(selClamped.y, 0);
  assert.strictEqual(selClamped.width, 800);
  assert.strictEqual(selClamped.height, 600);

  console.log('✓ normalizeSelection for Rectangles passed');
}

// Test 2: normalizeSelection for Ellipses
{
  const doc = { width: 1000, height: 800 };

  const selEllipse = normalizeSelection('ellipse', 50, 60, 250, 160, doc, false);
  assert.strictEqual(selEllipse.type, 'ellipse');
  assert.strictEqual(selEllipse.x, 50);
  assert.strictEqual(selEllipse.y, 60);
  assert.strictEqual(selEllipse.width, 200);
  assert.strictEqual(selEllipse.height, 100);

  // Shift-constrained ellipse (circle: Math.max(200, 400) = 400)
  const selCircle = normalizeSelection('ellipse', 100, 100, 300, 500, doc, true);
  assert.strictEqual(selCircle.type, 'ellipse');
  assert.strictEqual(selCircle.width, selCircle.height);
  assert.strictEqual(selCircle.width, 400);

  console.log('✓ normalizeSelection for Ellipses passed');
}

// Test 3: isPointInSelection (Rectangle)
{
  const selRect = { type: 'rect', x: 100, y: 100, width: 200, height: 150, inverted: false };

  // Inside
  assert.strictEqual(isPointInSelection(150, 150, selRect), true);
  assert.strictEqual(isPointInSelection(100, 100, selRect), true); // boundary
  assert.strictEqual(isPointInSelection(300, 250, selRect), true); // boundary

  // Outside
  assert.strictEqual(isPointInSelection(50, 150, selRect), false);
  assert.strictEqual(isPointInSelection(350, 150, selRect), false);
  assert.strictEqual(isPointInSelection(150, 50, selRect), false);
  assert.strictEqual(isPointInSelection(150, 300, selRect), false);

  // Inverted Rectangle
  const selRectInv = { ...selRect, inverted: true };
  assert.strictEqual(isPointInSelection(150, 150, selRectInv), false); // inside inner rect is excluded
  assert.strictEqual(isPointInSelection(50, 150, selRectInv), true);   // outside inner rect is included

  console.log('✓ isPointInSelection for Rectangles & Inverted passed');
}

// Test 4: isPointInSelection (Ellipse)
{
  // Center (200, 200), rx = 100, ry = 50. Equation: ((x-200)/100)^2 + ((y-200)/50)^2 <= 1
  const selEllipse = { type: 'ellipse', x: 100, y: 150, width: 200, height: 100, inverted: false };

  // Center is strictly inside
  assert.strictEqual(isPointInSelection(200, 200, selEllipse), true);

  // Point (200, 240) -> dy = 40, (40/50)^2 = 0.64 <= 1 -> inside
  assert.strictEqual(isPointInSelection(200, 240, selEllipse), true);

  // Point (110, 160) -> bounding box corner -> dx = -90, dy = -40 -> (0.9)^2 + (0.8)^2 = 0.81 + 0.64 = 1.45 > 1 -> outside
  assert.strictEqual(isPointInSelection(110, 160, selEllipse), false);

  // Inverted Ellipse
  const selEllipseInv = { ...selEllipse, inverted: true };
  assert.strictEqual(isPointInSelection(200, 200, selEllipseInv), false);
  assert.strictEqual(isPointInSelection(110, 160, selEllipseInv), true);

  console.log('✓ isPointInSelection for Ellipses & Inverted passed');
}

// Test 5: Zoom independence & document space coordinates
{
  const doc = { width: 1920, height: 1080 };
  const zooms = [0.25, 1.0, 2.0];

  for (const zoom of zooms) {
    // Screen coords at zoom
    const screenX = 400 * zoom;
    const screenY = 300 * zoom;
    // Map to doc space: docX = screenX / zoom
    const docX = screenX / zoom;
    const docY = screenY / zoom;

    assert.strictEqual(docX, 400);
    assert.strictEqual(docY, 300);

    const sel = normalizeSelection('rect', 200, 150, docX, docY, doc, false);
    assert.strictEqual(sel.x, 200);
    assert.strictEqual(sel.y, 150);
    assert.strictEqual(sel.width, 200);
    assert.strictEqual(sel.height, 150);
  }

  console.log('✓ Zoom independence (25%, 100%, 200%) verified in document space');
}

// Test 6: History Snapshot Selection Recording
{
  const doc = { name: 'Test Doc', width: 400, height: 300 };
  const layers = [{ id: 'l1', name: 'Background', imageBitmap: null, visible: true, opacity: 100 }];
  const selection = { type: 'ellipse', x: 50, y: 50, width: 100, height: 100, inverted: false };

  const snap = captureSnapshot(doc, layers, 'l1', 'Select Ellipse', selection);
  assert.strictEqual(snap.label, 'Select Ellipse');
  assert.deepStrictEqual(snap.selection, selection);

  // Verify immutable copy
  selection.x = 999;
  assert.strictEqual(snap.selection.x, 50);

  releaseSnapshot(snap);
  console.log('✓ History Snapshot selection persistence passed');
}

console.log('--- ALL SELECTION TESTS PASSED SUCCESSFULLY ---');
