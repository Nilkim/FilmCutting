import makerjs from 'makerjs';
import * as dxf from 'dxf';
import DxfParser from 'dxf-parser';
import paper from 'paper';
import { v4 as uuidv4 } from 'uuid';
import { konvaShapeToPaperPath } from './shapeBoolean';

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
                // dxf arc angles are in radians
                const startDeg = ent.startAngle * 180 / Math.PI;
                const endDeg = ent.endAngle * 180 / Math.PI;

                const from = new paper.Point(
                    ent.center.x + Math.cos(ent.startAngle) * ent.radius,
                    ent.center.y + Math.sin(ent.startAngle) * ent.radius
                );
                // get a middle point on the arc for paper.js to draw through
                const midAngle = ent.startAngle + (ent.angleLength / 2);
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
                ent.vertices.forEach(v => p.add(new paper.Point(v.x, v.y)));
                if (ent.shape === true || ent.closed === true) p.closePath();
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

        // Do not join any paths. Raw DXF topological structure must be strictly preserved.
        let combinedData = validPaths.map(p => p.pathData).join(" ");

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
