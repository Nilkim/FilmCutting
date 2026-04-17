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
// Speech Bubble (rounded rect + triangular tail on one side)
// ------------------------------------------------------------------
export function generateBubblePath({
    width,
    height,
    tailDir = 'down',
    tailSize = 20,
    fillet = 0
}) {
    ensurePaperSetup();
    const w = Math.abs(width);
    const h = Math.abs(height);
    const ts = Math.max(0, Number(tailSize) || 0);

    // Build the body vertex list walking around the rectangle clockwise.
    // At the chosen side's center we inject three tail points:
    //   base-left, tip, base-right. The tail extends OUTSIDE the
    //   rectangle, so the total bounding box grows in the tail direction.
    //
    // Tail base width along the side:
    const baseHalf = Math.min(ts, (tailDir === 'up' || tailDir === 'down' ? w : h) / 2 - 1);
    const tipOffset = ts; // distance from side to tail tip

    const L = -w / 2;
    const R = w / 2;
    const T = -h / 2;
    const B = h / 2;

    // Rectangle corners (TL, TR, BR, BL), clockwise.
    const corners = [
        { x: L, y: T }, // TL
        { x: R, y: T }, // TR
        { x: R, y: B }, // BR
        { x: L, y: B }  // BL
    ];

    // Which edge to inject tail on: index 0=top (TL->TR), 1=right (TR->BR),
    // 2=bottom (BR->BL), 3=left (BL->TL).
    const edgeIndex = { up: 0, right: 1, down: 2, left: 3 }[tailDir] ?? 2;

    const vertices = [];
    for (let i = 0; i < 4; i++) {
        vertices.push(corners[i]);
        if (i === edgeIndex) {
            // Inject tail along this edge (from corners[i] toward corners[(i+1)%4]).
            if (edgeIndex === 0) {
                // top edge, going L->R, tail points upward (y negative).
                vertices.push({ x: -baseHalf, y: T });
                vertices.push({ x: 0, y: T - tipOffset });
                vertices.push({ x: baseHalf, y: T });
            } else if (edgeIndex === 1) {
                // right edge, going T->B, tail points right.
                vertices.push({ x: R, y: -baseHalf });
                vertices.push({ x: R + tipOffset, y: 0 });
                vertices.push({ x: R, y: baseHalf });
            } else if (edgeIndex === 2) {
                // bottom edge, going R->L, tail points down.
                vertices.push({ x: baseHalf, y: B });
                vertices.push({ x: 0, y: B + tipOffset });
                vertices.push({ x: -baseHalf, y: B });
            } else if (edgeIndex === 3) {
                // left edge, going B->T, tail points left.
                vertices.push({ x: L, y: baseHalf });
                vertices.push({ x: L - tipOffset, y: 0 });
                vertices.push({ x: L, y: -baseHalf });
            }
        }
    }

    // Fillet only the rectangle corners, NOT the tail tip/base (those must
    // stay sharp for a proper pointy bubble tail). We do this by building
    // the polygon manually and only rounding the four original corners.
    const r = clampFillet(fillet, w, h);
    const path = buildBubblePath(vertices, corners, r);
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
