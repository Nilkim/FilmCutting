// shapeGenerators.js
// Pure parametric shape generators for the modal-based shape creation flow.
// All measurements are in millimeters. Returned pathData is an SVG `d` string
// with coordinates centered at (0, 0). Returned width/height is the final
// bounding-box size (should equal the input width/height unless the shape is
// degenerate).
//
// Implementation notes:
// - Rectangles use `makerjs.models.RoundRectangle` then flattened via Paper.js
//   for a clean rounded-rectangle path.
// - All other shapes are built directly in Paper.js by constructing the raw
//   polygon, then replacing sharp corners with quadratic-bezier fillets by
//   computing arc endpoints on the two adjacent edges (true corner fillet,
//   not a generic smooth()).
// - `flatten(0.1)` is applied so the resulting path is composed of short
//   linear segments, making it fully DXF-compatible via the existing
//   `exportShapesToDXF` pipeline (which expects point-based Paper paths).

import paper from 'paper';
import makerjs from 'makerjs';
import { loadFont } from './fontLoader.js';

// ------------------------------------------------------------------
// Paper.js headless setup (reuses global project if already initialized
// elsewhere, e.g. shapeBoolean.js).
// ------------------------------------------------------------------
function ensurePaperSetup() {
    if (!paper.project) {
        const canvas = typeof document !== 'undefined'
            ? document.createElement('canvas')
            : null;
        if (canvas) paper.setup(canvas);
    }
}

// ------------------------------------------------------------------
// Fillet utilities
// ------------------------------------------------------------------
export function clampFillet(fillet, width, height) {
    const f = Number(fillet) || 0;
    if (f <= 0) return 0;
    const maxF = Math.min(Math.abs(width), Math.abs(height)) / 2;
    if (!isFinite(maxF) || maxF <= 0) return 0;
    return Math.min(f, maxF);
}

// Finalize a Paper.js path: center it on the origin, flatten to linear
// segments, and extract the SVG pathData + bounds.
function finalizePath(path) {
    // Center path on origin.
    const b = path.bounds;
    path.translate(new paper.Point(-b.center.x, -b.center.y));
    // Flatten so DXF export can read clean polylines.
    path.flatten(0.1);
    const bounds = path.bounds;
    const pathData = path.pathData;
    path.remove();
    return {
        pathData,
        width: bounds.width,
        height: bounds.height
    };
}

// Build a filleted polygon from an array of {x,y} vertices.
// For each vertex, we cut back by `r` along each adjacent edge (clamped to
// half the shorter adjacent edge) and replace the corner with a quadratic
// bezier whose control point is the original sharp corner. This produces
// circular-ish fillets that approximate true arcs after flatten().
function buildFilletedPolygon(vertices, radius) {
    ensurePaperSetup();
    const path = new paper.Path({ insert: false });
    const n = vertices.length;

    if (radius <= 0) {
        vertices.forEach(v => path.add(new paper.Point(v.x, v.y)));
        path.closePath();
        return path;
    }

    for (let i = 0; i < n; i++) {
        const prev = vertices[(i - 1 + n) % n];
        const curr = vertices[i];
        const next = vertices[(i + 1) % n];

        const v1x = prev.x - curr.x;
        const v1y = prev.y - curr.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;

        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 === 0 || len2 === 0) {
            path.add(new paper.Point(curr.x, curr.y));
            continue;
        }

        // Clamp fillet to half of the shorter adjacent edge.
        const r = Math.min(radius, len1 / 2, len2 / 2);

        const p1 = {
            x: curr.x + (v1x / len1) * r,
            y: curr.y + (v1y / len1) * r
        };
        const p2 = {
            x: curr.x + (v2x / len2) * r,
            y: curr.y + (v2y / len2) * r
        };

        // Entry point on previous edge.
        path.add(new paper.Point(p1.x, p1.y));
        // Quadratic bezier through sharp corner as control, landing on p2.
        // Paper.js cubic conversion of quadratic: cp1 = p1 + 2/3(C - p1), cp2 = p2 + 2/3(C - p2).
        const cp1 = new paper.Point(
            p1.x + (2 / 3) * (curr.x - p1.x),
            p1.y + (2 / 3) * (curr.y - p1.y)
        );
        const cp2 = new paper.Point(
            p2.x + (2 / 3) * (curr.x - p2.x),
            p2.y + (2 / 3) * (curr.y - p2.y)
        );
        path.cubicCurveTo(cp1, cp2, new paper.Point(p2.x, p2.y));
    }
    path.closePath();
    return path;
}

// ------------------------------------------------------------------
// Rectangle (with optional fillet)
// ------------------------------------------------------------------
export function generateRectPath({ width, height, fillet = 0 }) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const r = clampFillet(fillet, w, h);

    let paperPath;
    if (r > 0) {
        // Use makerjs RoundRectangle to build the model, then convert to SVG
        // path via its exporter, then reparse in Paper.js for flatten/center.
        const model = new makerjs.models.RoundRectangle(w, h, r);
        const svgPathData = makerjs.exporter.toSVGPathData(model, {
            byLayers: false,
            fillRule: 'evenodd',
            origin: [0, 0]
        });
        const d = typeof svgPathData === 'string'
            ? svgPathData
            : Object.values(svgPathData).join(' ');
        paperPath = new paper.CompoundPath({ pathData: d, insert: false });
    } else {
        paperPath = new paper.Path.Rectangle({
            point: [0, 0],
            size: [w, h],
            insert: false
        });
    }

    return finalizePath(paperPath);
}

// ------------------------------------------------------------------
// Circle / Ellipse (no fillet concept)
// ------------------------------------------------------------------
export function generateCirclePath({ width, height }) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const path = new paper.Path.Ellipse({
        point: [-w / 2, -h / 2],
        size: [w, h],
        insert: false
    });
    return finalizePath(path);
}

// ------------------------------------------------------------------
// Triangle (isoceles, apex at top, base at bottom), optional fillet
// ------------------------------------------------------------------
export function generateTrianglePath({ width, height, fillet = 0 }) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const r = clampFillet(fillet, w, h);

    const vertices = [
        { x: 0, y: -h / 2 },       // apex (top)
        { x: w / 2, y: h / 2 },    // bottom-right
        { x: -w / 2, y: h / 2 }    // bottom-left
    ];
    const path = buildFilletedPolygon(vertices, r);
    return finalizePath(path);
}

// ------------------------------------------------------------------
// Star (N-pointed, elliptical envelope)
// ------------------------------------------------------------------
export function generateStarPath({
    width,
    height,
    points = 5,
    innerRatio = 0.5,
    fillet = 0
}) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const n = Math.max(3, Math.min(12, Math.round(points)));
    const ir = Math.max(0.05, Math.min(0.95, Number(innerRatio) || 0.5));
    const r = clampFillet(fillet, w, h);

    const vertices = [];
    const totalPts = n * 2;
    for (let i = 0; i < totalPts; i++) {
        const theta = -Math.PI / 2 + i * (Math.PI / n);
        const isOuter = i % 2 === 0;
        const rx = isOuter ? w / 2 : (w / 2) * ir;
        const ry = isOuter ? h / 2 : (h / 2) * ir;
        vertices.push({
            x: rx * Math.cos(theta),
            y: ry * Math.sin(theta)
        });
    }
    const path = buildFilletedPolygon(vertices, r);
    return finalizePath(path);
}

// ------------------------------------------------------------------
// Speech Bubble (rounded rect + triangular tail at any 0–360° angle)
// ------------------------------------------------------------------
// `tailAngle` uses the same convention as the rotation handle:
//   0° = up (12 o'clock), 90° = right, 180° = down, 270° = left.
// The tail tip sits OUTSIDE the rectangle along that direction; the base
// of the tail lies on whichever rectangle edge the angle ray hits.
export function generateBubblePath({
    width,
    height,
    tailAngle = 180,
    tailSize = 20,
    fillet = 0
}) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const ts = Math.max(0, Number(tailSize) || 0);

    // Normalize angle to [0, 360) and convert to radians.
    const angleDeg = ((Number(tailAngle) || 0) % 360 + 360) % 360;
    const angleRad = (angleDeg * Math.PI) / 180;

    // Direction vector with our convention: 0°=up, clockwise.
    const dx = Math.sin(angleRad);
    const dy = -Math.cos(angleRad);

    const L = -w / 2;
    const R = w / 2;
    const T = -h / 2;
    const B = h / 2;

    // Ray-rectangle intersection from origin in direction (dx, dy).
    // Pick the smallest positive t among the four edges where the ray exits.
    let t = Infinity;
    let edge = 'bottom'; // fallback for degenerate angles
    if (dy < -1e-9) {
        const tc = T / dy;
        if (tc > 0 && tc < t) { t = tc; edge = 'top'; }
    }
    if (dy > 1e-9) {
        const tc = B / dy;
        if (tc > 0 && tc < t) { t = tc; edge = 'bottom'; }
    }
    if (dx > 1e-9) {
        const tc = R / dx;
        if (tc > 0 && tc < t) { t = tc; edge = 'right'; }
    }
    if (dx < -1e-9) {
        const tc = L / dx;
        if (tc > 0 && tc < t) { t = tc; edge = 'left'; }
    }

    const intersectX = t * dx;
    const intersectY = t * dy;
    const tipX = intersectX + dx * ts;
    const tipY = intersectY + dy * ts;

    // Tail base half-width along whichever edge it sits on, clamped so it
    // never reaches a corner (-1 px gap keeps fillet math well-defined).
    const edgeLen = (edge === 'top' || edge === 'bottom') ? w : h;
    const baseHalf = Math.min(ts, edgeLen / 2 - 1);

    // Two base points on the edge, ordered to match the clockwise walk
    // around the rectangle (so insertion order base1 → tip → base2 is correct).
    let base1, base2;
    switch (edge) {
        case 'top':    // walking TL→TR (x increasing)
            base1 = { x: intersectX - baseHalf, y: T };
            base2 = { x: intersectX + baseHalf, y: T };
            break;
        case 'right':  // walking TR→BR (y increasing)
            base1 = { x: R, y: intersectY - baseHalf };
            base2 = { x: R, y: intersectY + baseHalf };
            break;
        case 'bottom': // walking BR→BL (x decreasing)
            base1 = { x: intersectX + baseHalf, y: B };
            base2 = { x: intersectX - baseHalf, y: B };
            break;
        case 'left':   // walking BL→TL (y decreasing)
            base1 = { x: L, y: intersectY + baseHalf };
            base2 = { x: L, y: intersectY - baseHalf };
            break;
    }

    const corners = [
        { x: L, y: T }, // TL
        { x: R, y: T }, // TR
        { x: R, y: B }, // BR
        { x: L, y: B }  // BL
    ];
    const edgeIndex = { top: 0, right: 1, bottom: 2, left: 3 }[edge];

    const vertices = [];
    for (let i = 0; i < 4; i++) {
        vertices.push(corners[i]);
        if (i === edgeIndex) {
            vertices.push(base1);
            vertices.push({ x: tipX, y: tipY });
            vertices.push(base2);
        }
    }

    // Fillet only the rectangle corners, NOT the tail tip/base (sharp tail).
    const r = clampFillet(fillet, w, h);
    const path = buildBubblePath(vertices, corners, r);
    return finalizePath(path);
}

// ------------------------------------------------------------------
// Arch (rectangle body + arc top — like an architectural niche/door)
// ------------------------------------------------------------------
// Parameters:
//   width, height     — overall bounding box
//   archHeight        — height of the arc portion at top
//                       (= width/2 → perfect semicircle; > width/2 → tall
//                       elliptical; < width/2 → shallow)
//   fillet            — applied ONLY to the bottom two corners (top is
//                       already smooth). Clamped by body height so the
//                       fillet can't eat into the arch.
export function generateArchPath({ width, height, archHeight = 0, fillet = 0 }) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const ah = Math.max(0, Math.min(h, Number(archHeight) || 0));

    // No arch portion → fall back to plain rounded rectangle.
    if (ah <= 0) {
        return generateRectPath({ width: w, height: h, fillet });
    }

    const bodyH = h - ah;
    const r = Math.max(0, Math.min(Number(fillet) || 0, w / 2, bodyH));

    const L = -w / 2;
    const R = w / 2;
    const T = -h / 2;
    const B = h / 2;
    const archStartY = T + ah;

    const path = new paper.Path({ insert: false });

    // Build clockwise from a stable starting vertex. The bottom edge gets
    // optional fillet at its two corners; the top is a single arcTo through
    // the apex (0, T).
    // Top arc as a true HALF-ELLIPSE (rx = w/2, ry = ah), built from two
    // cubic Béziers (one per quadrant). We avoid Paper.js's arcTo(through,to)
    // because it fits a single CIRCLE through the three points — when ah
    // exceeds w/2 the resulting circle has radius > w/2 and bulges OUTSIDE
    // the body's vertical sides. Ellipse keeps the top strictly within
    // [-w/2, w/2] regardless of ah, giving "bullet head" geometry when ah
    // is tall and a flat dome when ah is short.
    const KAPPA = 0.5522847498; // 4/3 * tan(π/8) — Bézier ⇄ quarter ellipse

    const ellipticalTop = () => {
        // (R, archStartY) → (0, T)
        path.cubicCurveTo(
            new paper.Point(R, archStartY - KAPPA * ah),
            new paper.Point(KAPPA * R, T),
            new paper.Point(0, T)
        );
        // (0, T) → (L, archStartY)
        path.cubicCurveTo(
            new paper.Point(-KAPPA * R, T),
            new paper.Point(L, archStartY - KAPPA * ah),
            new paper.Point(L, archStartY)
        );
    };

    if (r > 0) {
        path.moveTo(new paper.Point(L + r, B));
        path.lineTo(new paper.Point(R - r, B));
        // Bottom-right fillet (quadratic via cubic conversion)
        path.cubicCurveTo(
            new paper.Point(R - r + (2 / 3) * r, B),
            new paper.Point(R, B - r + (2 / 3) * r),
            new paper.Point(R, B - r)
        );
        path.lineTo(new paper.Point(R, archStartY));
        ellipticalTop();
        path.lineTo(new paper.Point(L, B - r));
        // Bottom-left fillet
        path.cubicCurveTo(
            new paper.Point(L, B - r + (2 / 3) * r),
            new paper.Point(L + r - (2 / 3) * r, B),
            new paper.Point(L + r, B)
        );
    } else {
        path.moveTo(new paper.Point(L, B));
        path.lineTo(new paper.Point(R, B));
        path.lineTo(new paper.Point(R, archStartY));
        ellipticalTop();
        path.lineTo(new paper.Point(L, B));
    }

    path.closePath();
    return finalizePath(path);
}

// Builds the bubble path, applying fillet only at vertices that match one of
// the four original rectangle corners.
function buildBubblePath(vertices, corners, radius) {
    ensurePaperSetup();
    const path = new paper.Path({ insert: false });
    const n = vertices.length;

    const isCorner = (v) =>
        corners.some(c => Math.abs(c.x - v.x) < 1e-6 && Math.abs(c.y - v.y) < 1e-6);

    if (radius <= 0) {
        vertices.forEach(v => path.add(new paper.Point(v.x, v.y)));
        path.closePath();
        return path;
    }

    for (let i = 0; i < n; i++) {
        const prev = vertices[(i - 1 + n) % n];
        const curr = vertices[i];
        const next = vertices[(i + 1) % n];

        if (!isCorner(curr)) {
            path.add(new paper.Point(curr.x, curr.y));
            continue;
        }

        const v1x = prev.x - curr.x;
        const v1y = prev.y - curr.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 === 0 || len2 === 0) {
            path.add(new paper.Point(curr.x, curr.y));
            continue;
        }
        const r = Math.min(radius, len1 / 2, len2 / 2);

        const p1 = {
            x: curr.x + (v1x / len1) * r,
            y: curr.y + (v1y / len1) * r
        };
        const p2 = {
            x: curr.x + (v2x / len2) * r,
            y: curr.y + (v2y / len2) * r
        };
        path.add(new paper.Point(p1.x, p1.y));
        const cp1 = new paper.Point(
            p1.x + (2 / 3) * (curr.x - p1.x),
            p1.y + (2 / 3) * (curr.y - p1.y)
        );
        const cp2 = new paper.Point(
            p2.x + (2 / 3) * (curr.x - p2.x),
            p2.y + (2 / 3) * (curr.y - p2.y)
        );
        path.cubicCurveTo(cp1, cp2, new paper.Point(p2.x, p2.y));
    }
    path.closePath();
    return path;
}

// ------------------------------------------------------------------
// Text (vector outline of string, using opentype.js + makerjs)
// ------------------------------------------------------------------
// NOTE: Async — unlike other generators, this waits for the font file to
// lazy-load. Consumers must `await` the returned Promise.
//
// `size` is the em size in mm. Actual bounding-box height ends up roughly
// equal to `size` for Latin caps; Hangul tends to be slightly taller due to
// accent/jongseong metrics. The returned width/height reflects the true
// bounds after flattening.
//
// `fontId` selects from curated fonts or user-uploaded ones (IndexedDB).
// `weight` is only meaningful for curated fonts that ship multiple weights;
// custom uploaded fonts ignore it (single file per upload).
export async function generateTextPath({
    text,
    size = 30,
    fontId,
    weight = 'regular',
}) {
    const str = String(text ?? '');
    if (!str.trim()) throw new Error('텍스트가 비어있습니다');

    ensurePaperSetup();
    const font = await loadFont(fontId, weight);

    // makerjs.models.Text signature:
    //   Text(font, text, fontSize, combine?, centerCharacterOrigin?, bezierAccuracy?)
    // combine=true: makerjs가 인접 글리프 외곽을 union으로 합쳐줌. 필기체나
    // 좁은 자간 폰트에서 글자가 겹쳐 evenodd 규칙상 구멍처럼 보이는 현상을
    // 막는다. makerjs는 글리프 단위로 outer/hole을 구분해 boolean을 수행하므로
    // "o", "ㅇ", "A" 안쪽의 진짜 구멍은 그대로 유지됨.
    const textModel = new makerjs.models.Text(font, str, size, true, false);

    const svgPathData = makerjs.exporter.toSVGPathData(textModel, {
        byLayers: false,
        fillRule: 'evenodd',
        origin: [0, 0],
    });
    const d = typeof svgPathData === 'string'
        ? svgPathData
        : Object.values(svgPathData).join(' ');

    // `makerjs.exporter.toSVGPathData` already flips Y internally so the
    // pathData is in SVG-standard (Y-down) coords — same as the other
    // generators above. Do NOT apply an additional scale(1,-1) here or the
    // glyphs will render upside-down.
    const paperPath = new paper.CompoundPath({ pathData: d, insert: false });

    return finalizePath(paperPath);
}

/*
 * ------------------------------------------------------------------
 * Self-test expectations (not executable — visual reference only)
 * ------------------------------------------------------------------
 * generateRectPath({ width: 100, height: 60, fillet: 10 })
 *   -> rounded rectangle, bbox 100x60, centered at (0,0).
 *
 * generateCirclePath({ width: 80, height: 80 })
 *   -> perfect circle, bbox 80x80.
 * generateCirclePath({ width: 120, height: 60 })
 *   -> ellipse, wider horizontally.
 *
 * generateTrianglePath({ width: 100, height: 80, fillet: 0 })
 *   -> isoceles triangle, apex top, base bottom, bbox 100x80.
 * generateTrianglePath({ width: 100, height: 80, fillet: 10 })
 *   -> same with rounded corners.
 *
 * generateStarPath({ width: 100, height: 100, points: 5, innerRatio: 0.5, fillet: 0 })
 *   -> classic 5-point star, bbox 100x100.
 * generateStarPath({ width: 120, height: 80, points: 6, innerRatio: 0.6, fillet: 5 })
 *   -> 6-point elliptical star with softened points.
 *
 * generateBubblePath({ width: 120, height: 80, tailDir: 'down', tailSize: 15, fillet: 10 })
 *   -> rounded-rectangle speech bubble with downward tail centered on bottom edge.
 *   Final bbox extends below by tailSize (so height becomes 80 + 15).
 * generateBubblePath({ width: 120, height: 80, tailDir: 'right', tailSize: 20, fillet: 10 })
 *   -> bubble with rightward tail; bbox width grows by 20.
 *
 * All returned pathData strings are ready for <Path d={...}/> in Konva and
 * for the existing DXF pipeline (paths are flattened and closed).
 */
