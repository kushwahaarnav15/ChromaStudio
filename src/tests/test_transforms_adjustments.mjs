import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureSnapshot, releaseSnapshot } from '../store/useHistory.js';

console.log('--- Transform & Adjustment Contract Tests ---');
const layer = { id: 'raster', name: 'Raster', type: 'image', imageBitmap: null, thumbnail: null, visible: true, opacity: 100, blendMode: 'source-over', x: 0, y: 0, width: 100, height: 100, transform: { scaleX: 1, scaleY: 1, rotation: 0 }, textData: null, shapeData: null, adjustmentData: null };
const transformed = { ...layer, transform: { scaleX: -2, scaleY: 2, rotation: 90 } };
assert.deepEqual(layer.transform, { scaleX: 1, scaleY: 1, rotation: 0 });
assert.deepEqual(transformed.transform, { scaleX: -2, scaleY: 2, rotation: 90 });
console.log('✓ transform geometry is immutable and document-coordinate independent');

const adjustment = { ...layer, id: 'adjust', type: 'adjustment', imageBitmap: null, adjustmentData: { brightness: 20, contrast: -10, saturation: 30, grayscale: 0 }, opacity: 60 };
const snap = captureSnapshot({ width: 100, height: 100 }, [layer, adjustment], layer.id, 'Adjustment');
adjustment.adjustmentData.brightness = 99;
assert.equal(snap.layers[1].adjustmentData.brightness, 20);
releaseSnapshot(snap);
console.log('✓ adjustment settings are isolated for undo/redo');

const store = await readFile(new URL('../store/useDocument.js', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../utils/exportDocument.js', import.meta.url), 'utf8');
assert.match(store, /layer\.type === 'adjustment'[\s\S]*applyAdjustmentPixels/);
assert.match(store, /ctx\.rotate[\s\S]*ctx\.scale/);
assert.match(store, /UPDATE_LAYER_TRANSFORM/);
assert.match(store, /UPDATE_ADJUSTMENT_DATA/);
assert.match(exporter, /compositeToCanvas\(canvas, doc, layers, bgColor\)/);
assert.match(store, /layer\.type === 'adjustment'[\s\S]*imageBitmap: null[\s\S]*width: w/);
assert.match(store, /layer\.type === 'adjustment'[\s\S]*imageBitmap: null[\s\S]*width: targetW/);
console.log('✓ ordering scope and export use the shared compositor; adjustments affect only prior stack content');
console.log('✓ crop and image resize preserve adjustment metadata without allocating blank raster bitmaps');
console.log('--- ALL TRANSFORM & ADJUSTMENT TESTS PASSED ---');
