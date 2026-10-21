/** Pure helpers shared by viewport interactions and focused vector tests. */
export function moveVectorData(layer, dx, dy) {
  if (layer.type === 'text' && layer.textData) {
    return { ...layer.textData, originX: (layer.textData.originX ?? 0) + dx, originY: (layer.textData.originY ?? 0) + dy };
  }
  if (layer.type === 'shape' && layer.shapeData) {
    const s = layer.shapeData;
    return { ...s, x1: (s.x1 ?? 0) + dx, y1: (s.y1 ?? 0) + dy, x2: (s.x2 ?? 0) + dx, y2: (s.y2 ?? 0) + dy };
  }
  return null;
}

export function constrainShapePoint(shapeType, x1, y1, x2, y2, constrain) {
  if (!constrain) return { x2, y2 };
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (shapeType === 'line') {
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x2: x1 + Math.cos(angle) * length, y2: y1 + Math.sin(angle) * length };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x2: x1 + Math.sign(dx || 1) * side, y2: y1 + Math.sign(dy || 1) * side };
}

export function pointInVectorLayer(layer, x, y) {
  if (layer.type === 'shape' && layer.shapeData) {
    const s = layer.shapeData;
    const minX = Math.min(s.x1 ?? 0, s.x2 ?? 0) + layer.x;
    const maxX = Math.max(s.x1 ?? 0, s.x2 ?? 0) + layer.x;
    const minY = Math.min(s.y1 ?? 0, s.y2 ?? 0) + layer.y;
    const maxY = Math.max(s.y1 ?? 0, s.y2 ?? 0) + layer.y;
    return x >= minX - 6 && x <= maxX + 6 && y >= minY - 6 && y <= maxY + 6;
  }
  if (layer.type === 'text' && layer.textData) {
    const t = layer.textData;
    const size = t.fontSize ?? 32;
    const lines = String(t.text ?? '').split('\n');
    const width = Math.max(...lines.map(line => line.length), 1) * size * 0.65;
    const height = lines.length * size * (t.lineSpacing ?? 1.3);
    const left = (t.originX ?? 0) + layer.x - (t.align === 'center' ? width / 2 : t.align === 'right' ? width : 0);
    const top = (t.originY ?? 0) + layer.y;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }
  return false;
}
