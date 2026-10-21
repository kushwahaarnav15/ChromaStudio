import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureSnapshot, releaseSnapshot } from '../store/useHistory.js';
import { constrainShapePoint, moveVectorData, pointInVectorLayer } from '../utils/vectorLayer.js';

console.log('--- Starting Vector Layer Contract Tests ---');

const text = { id: 'text-1', type: 'text', imageBitmap: null, visible: true, opacity: 75, blendMode: 'source-over', x: 0, y: 0, width: 800, height: 600, textData: { text: 'Hello\nWorld', originX: 30, originY: 40, fontSize: 20, lineSpacing: 1.2, align: 'left' }, shapeData: null };
const shape = { id: 'shape-1', type: 'shape', imageBitmap: null, visible: true, opacity: 100, blendMode: 'source-over', x: 0, y: 0, width: 800, height: 600, textData: null, shapeData: { shapeType: 'rect', x1: 10, y1: 20, x2: 110, y2: 70, fill: '#f00', stroke: '#000', strokeWidth: 2 } };

const movedText = moveVectorData(text, 15, -5);
assert.deepEqual([movedText.originX, movedText.originY], [45, 35]);
assert.deepEqual([text.textData.originX, text.textData.originY], [30, 40], 'movement must not mutate source metadata');
const movedShape = moveVectorData(shape, 5, 10);
assert.deepEqual([movedShape.x1, movedShape.y1, movedShape.x2, movedShape.y2], [15, 30, 115, 80]);
assert(pointInVectorLayer(text, 35, 45));
assert(pointInVectorLayer(shape, 50, 40));
assert(!pointInVectorLayer(shape, 200, 200));
console.log('✓ creation geometry, hit testing, and movement are document-space and immutable');

assert.deepEqual(constrainShapePoint('rect', 0, 0, 20, 40, true), { x2: 40, y2: 40 });
const line = constrainShapePoint('line', 0, 0, 20, 12, true);
assert(Math.abs(Math.abs(line.x2) - Math.abs(line.y2)) < 0.0001, 'Shift constrains lines to 45° increments');
console.log('✓ Shift constraints preserve square/circle and snapped-line geometry');

const snapshot = captureSnapshot({ width: 800, height: 600 }, [text, shape], text.id, 'Vector state');
text.textData.originX = 999; // emulate a bad later in-place write; snapshot must stay isolated.
shape.shapeData.x1 = 999;
assert.equal(snapshot.layers[0].textData.originX, 30);
assert.equal(snapshot.layers[1].shapeData.x1, 10);
releaseSnapshot(snapshot);
console.log('✓ vector metadata is isolated in history snapshots');

const documentStore = await readFile(new URL('../store/useDocument.js', import.meta.url), 'utf8');
const exportPipeline = await readFile(new URL('../utils/exportDocument.js', import.meta.url), 'utf8');
assert.match(documentStore, /layer\.type === 'text'.*renderTextToCanvas/s);
assert.match(documentStore, /layer\.type === 'shape'.*renderShapeToCanvas/s);
assert.match(exportPipeline, /compositeToCanvas\(canvas, doc, layers, bgColor\)/);
console.log('✓ source-level contract confirms editable vectors use the shared composite/export pipeline');

assert.equal(text.imageBitmap, null);
assert.equal(shape.imageBitmap, null);
console.log('✓ raster-only boundary is representable: vector layers have no bitmap and must be guarded by callers');
console.log('--- ALL VECTOR LAYER CONTRACT TESTS PASSED ---');
