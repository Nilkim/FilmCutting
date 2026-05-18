import makerjs from 'makerjs';
import * as dxf from 'dxf';
import DxfParser from 'dxf-parser';
import paper from 'paper';
import { v4 as uuidv4 } from 'uuid';
import { konvaShapeToPaperPath } from './shapeBoolean';

// LWPOLYLINE의 vertex.bulge가 0이 아니면 그 정점에서 다음 정점까지를
// 직선이 아닌 호로 이어야 한다. DXF 사양: bulge = tan(sweepAngle / 4),
// 부호 양수 = 시작→끝 방향 기준 왼쪽으로 둥글게(CCW).
//
// 호의 중간점(through point)을 chord 중점에서 sagitta = chord*bulge/2 만큼
// chord에 수직인 방향(왼쪽)으로 이동시킨 위치로 계산하면 paper.js의
// path.arcTo(through, to) API에 바로 넣을 수 있다.
function bulgeThroughPoint(v1, v2, bulge) {
    const cx = (v1.x + v2.x) / 2;
    const cy = (v1.y + v2.y) / 2;
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chord = Math.sqrt(dx * dx + dy * dy);
    if (chord === 0) return new paper.Point(cx, cy);
    // chord 방향에서 90° 왼쪽으로 회전한 단위 벡터: (-dy, dx) / chord
    const px = -dy / chord;
    const py = dx / chord;
    const sagitta = (chord * bulge) / 2;
    return new paper.Point(cx + px * sagitta, cy + py * sagitta);
}

// DXF는 외곽선을 LINE/ARC/SPLINE 등 여러 entity로 쪼개 표현하는 경우가
// 많다. 각 entity별로 만든 paper.Path 들을 단순 string join하면 SVG는
// 'M...M...M...'처럼 별개의 sub-path로 해석해 fill 시 ring이 끊긴 채로
// 그려진다. 인접 path들의 끝점이 tolerance(mm) 이내라면 paper.js의
// path.join API로 하나의 연속 path로 묶어 닫힌 ring을 형성한다.
//
// path.join(other, tolerance)는 끝점 매칭(시작-시작/시작-끝/끝-시작/끝-끝)
// 4가지 케이스를 자동 처리한다. greedy하게 진행하다 더 이상 합쳐지지
// 않으면 종료. 남은 path들은 별도 ring으로 남겨 CompoundPath에서 자연스럽게
// evenodd 채움 룰의 대상이 된다.
function joinPathsWithTolerance(paths, tolerance) {
    if (!paths || paths.length <= 1) return paths || [];
    const result = [paths[0]];
    const remaining = paths.slice(1);

    let progressed = true;
    while (remaining.length > 0 && progressed) {
        progressed = false;
        outer: for (let i = 0; i < result.length; i++) {
            for (let j = 0; j < remaining.length; j++) {
                const before = result[i].segments ? result[i].segments.length : 0;
                result[i].join(remaining[j], tolerance);
                const after = result[i].segments ? result[i].segments.length : 0;
                if (after > before) {
                    remaining.splice(j, 1);
                    progressed = true;
                    break outer;
                }
            }
        }
    }
    result.push(...remaining);

    // 끝점이 거의 일치하는 path는 닫힘으로 표시 → fill 시 한 ring으로 인식
    result.forEach(p => {
        if (!p.closed && p.firstSegment && p.lastSegment) {
            const d = p.firstSegment.point.getDistance(p.lastSegment.point);
            if (d <= tolerance) {
                p.closed = true;
            }
        }
    });
    return result;
}

function addPolylineSegments(p, vertices, closed) {
    if (!vertices || vertices.length === 0) return;
    p.moveTo(new paper.Point(vertices[0].x, vertices[0].y));
    for (let i = 0; i < vertices.length - 1; i++) {
        const v1 = vertices[i];
        const v2 = vertices[i + 1];
        const bulge = v1.bulge || 0;
        if (Math.abs(bulge) < 1e-10) {
            p.lineTo(new paper.Point(v2.x, v2.y));
        } else {
            const through = bulgeThroughPoint(v1, v2, bulge);
            p.arcTo(through, new paper.Point(v2.x, v2.y));
        }
    }
    if (closed) {
        const v1 = vertices[vertices.length - 1];
        const v2 = vertices[0];
        const bulge = v1.bulge || 0;
        if (Math.abs(bulge) >= 1e-10) {
            const through = bulgeThroughPoint(v1, v2, bulge);
            p.arcTo(through, new paper.Point(v2.x, v2.y));
        }
        // bulge=0인 마지막 segment는 paper의 closed 플래그가 자동으로
        // 첫 정점까지 직선으로 닫아준다.
        p.closed = true;
    }
}

export function exportShapesToDXF(shapes) {
    if (!shapes || shapes.length === 0) return null;

    const exportModel = {
        models: {}
    };

    let shapeIndex = 0;
    shapes.forEach((shape) => {
        const paperPath = konvaShapeToPaperPath(shape);
        if (paperPath) {
            // Flatten the paper path into highly accurate linear segments (0.1mm tolerance).
            // This forces the path to be pure points instead of bezier curves.
            paperPath.flatten(0.1);

            // Extract polygons natively to bypass makerjs's SVG Arc translation bugs
            const pathsToProcess = paperPath.children ? paperPath.children : [paperPath];

            pathsToProcess.forEach((p, i) => {
                if (p.segments && p.segments.length > 1) {
                    const points = p.segments.map(seg => [seg.point.x, seg.point.y]);
                    if (p.closed) {
                        points.push([p.segments[0].point.x, p.segments[0].point.y]); // Close loop
                    }

                    const polyLine = new makerjs.models.ConnectTheDots(false, points);
                    exportModel.models[`shape_${shapeIndex}_part_${i}`] = polyLine;
                }
            });

            shapeIndex++;
            paperPath.remove(); // cleanup paper object
        }
    });

    // Mirror horizontally because MakerJS sometimes reflects Y axis differently for SVG paths
    // SVG is Y down, CAD/DXF is Y up!
    // We should mirror Y axis.
    makerjs.model.mirror(exportModel, false, true);

    const generatedDxf = makerjs.exporter.toDXF(exportModel, {
        units: makerjs.unitType.Millimeter
    });

    return generatedDxf;
}

export function downloadDXF(dxfString, filename = 'cut_shapes.dxf') {
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function importDXFtoShapes(dxfString) {
    try {
        const parser = new DxfParser();
        const dxfData = parser.parseSync(dxfString);

        if (!paper.project) {
            const canvas = document.createElement('canvas');
            paper.setup(canvas);
        }

        let validPaths = [];

        // Manually build clean Paper.js paths from DXF entities to ensure correct SVG pathData output
        dxfData.entities.forEach(ent => {
            let p = null;
            if (ent.type === 'LINE') {
                p = new paper.Path.Line({
                    from: [ent.vertices[0].x, ent.vertices[0].y],
                    to: [ent.vertices[1].x, ent.vertices[1].y],
                    insert: false
                });
            } else if (ent.type === 'CIRCLE') {
                p = new paper.Path.Circle({
                    center: [ent.center.x, ent.center.y],
                    radius: ent.radius,
                    insert: false
                });
            } else if (ent.type === 'ARC') {
                // DXF ARC는 startAngle → endAngle 방향이 항상 CCW이다.
                // 0/2π 경계를 넘어가는 호(startAngle > endAngle)에서는
                // 단순 (start+end)/2 = midAngle이 정반대편을 가리켜
                // paper.Path.Arc의 through 점이 호의 반대편으로 떨어지고,
                // 결과적으로 호가 뒤집힌 모양으로 그려진다.
                //
                // 항상 양수인 sweep을 명시적으로 계산해서 중점이 호 위에
                // 떨어지도록 보장. dxf-parser가 angleLength를 줄 때도 있고
                // 안 줄 때도 있어 직접 계산하는 게 안전하다.
                let sweep = (typeof ent.angleLength === 'number')
                    ? ent.angleLength
                    : (ent.endAngle - ent.startAngle);
                if (sweep <= 0) sweep += 2 * Math.PI;
                const midAngle = ent.startAngle + sweep / 2;

                const from = new paper.Point(
                    ent.center.x + Math.cos(ent.startAngle) * ent.radius,
                    ent.center.y + Math.sin(ent.startAngle) * ent.radius
                );
                const through = new paper.Point(
                    ent.center.x + Math.cos(midAngle) * ent.radius,
                    ent.center.y + Math.sin(midAngle) * ent.radius
                );
                const to = new paper.Point(
                    ent.center.x + Math.cos(ent.endAngle) * ent.radius,
                    ent.center.y + Math.sin(ent.endAngle) * ent.radius
                );

                p = new paper.Path.Arc({ from, through, to, insert: false });
            } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
                p = new paper.Path({ insert: false });
                // bulge 인식: vertex.bulge ≠ 0이면 다음 정점까지를 호로 잇는다.
                // (원래는 직선만 연결해서 곡선 도형이 chord 만큼 깎였음)
                const isClosed = ent.shape === true || ent.closed === true;
                addPolylineSegments(p, ent.vertices, isClosed);
            } else if (ent.type === 'SPLINE') {
                p = new paper.Path({ insert: false });
                ent.controlPoints.forEach(cp => p.add(new paper.Point(cp.x, cp.y)));
                if (ent.closed) p.closePath();
                p.smooth();
            }

            if (p) {
                // DXF is Y-up, our canvas is Y-down
                p.scale(1, -1, new paper.Point(0, 0));
                if (p.pathData) validPaths.push(p);
            }
        });

        // 끝점이 1mm 이내로 인접한 entity들은 하나의 닫힌 ring으로 합친다.
        // ARC + ARC + LINE 등으로 쪼개진 외곽선이 fill 시 끊어진 조각처럼
        // 그려지는 증상을 해결. join은 도형의 topology를 바꾸지 않으면서
        // SVG 표현만 'M...M...'에서 'M...L...A...Z'로 합쳐주는 것이라
        // 시각적 결과/cut path는 그대로 보존된다.
        const joined = joinPathsWithTolerance(validPaths, 1.0);
        let combinedData = joined.map(p => p.pathData).join(" ");

        let unionPath = null;
        if (validPaths.length > 0 && combinedData.trim()) {
            // we don't need evenodd or any fill rules if we aren't filling
            unionPath = new paper.CompoundPath({ pathData: combinedData, insert: false });
        }

        if (!unionPath || !unionPath.pathData.trim()) {
            return null;
        }

        // Extremely important: Normalize the path so its internal center is exactly at [0,0]
        // This ensures Konva's 'x' and 'y' actually represent the true center of the shape,
        // allowing accurate hit detection and billable length boundary calculations.
        unionPath.position = new paper.Point(0, 0);

        const shapeData = {
            id: uuidv4(),
            type: 'path',
            data: unionPath.pathData,
            x: 610, // starting center X
            y: 500, // starting center Y
            width: unionPath.bounds.width,
            height: unionPath.bounds.height,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            isDxf: true // Tag it so we know NOT to fill it
        };

        unionPath.remove();
        return shapeData;
    } catch (e) {
        console.error("DXF Import Failed", e);
        return null;
    }
}
