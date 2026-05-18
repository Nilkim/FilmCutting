import paper from 'paper';

// 도형 하나의 **local bounds**(원점 기준, scaleX/Y와 rotation 적용된 후의
// path 외곽 박스)를 계산. shape.x/y는 더하지 않는다 — 호출처가 필요 시
// 더해서 world coord으로 변환. Paper.js로 정확한 회전·스케일 후 bounds를
// 뽑으므로 회전된 도형도 정확. pathData 없는 primitive shape엔 fallback
// (width/height 또는 radius 기반 단순 박스).
export const computeLocalBounds = (shape) => {
    const sx = shape.scaleX || 1;
    const sy = shape.scaleY || 1;
    const data = shape.pathData || shape.data;
    if (data) {
        if (!paper.project) paper.setup(new paper.Size(1, 1));
        const item = paper.PathItem.create(data);
        item.scale(sx, sy, new paper.Point(0, 0));
        if (shape.rotation) item.rotate(shape.rotation, new paper.Point(0, 0));
        const b = item.bounds;
        const out = { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
        item.remove();
        return out;
    }
    // pathData 없는 legacy primitive 폴백 — 중심 정렬 단순 박스
    const w = (shape.width || (shape.radius || 0) * 2 || 100) * sx;
    const h = (shape.height || (shape.radius || 0) * 2 || 100) * sy;
    return { left: -w / 2, right: w / 2, top: -h / 2, bottom: h / 2 };
};

// 여러 도형의 world bounds union — 각 shape의 local bounds에 x/y offset을
// 더한 뒤 4면 min/max로 합친다. shapes가 비어 있거나 모두 bounds 계산 실패면
// null. OrderThumbnail에서 viewBox 계산용.
export const computeUnionBounds = (shapes) => {
    if (!Array.isArray(shapes) || shapes.length === 0) return null;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    let found = false;
    for (const shape of shapes) {
        const b = computeLocalBounds(shape);
        if (!b) continue;
        const x = shape.x || 0;
        const y = shape.y || 0;
        left = Math.min(left, x + b.left);
        right = Math.max(right, x + b.right);
        top = Math.min(top, y + b.top);
        bottom = Math.max(bottom, y + b.bottom);
        found = true;
    }
    if (!found) return null;
    return { left, right, top, bottom };
};
