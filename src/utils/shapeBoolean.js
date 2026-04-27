import paper from 'paper';

// Initialize a headless paper project
const canvas = document.createElement('canvas');
paper.setup(canvas);

export function konvaShapeToPaperPath(shape) {
    let path;

    switch (shape.type) {
        case 'rect':
            path = new paper.Path.Rectangle({
                point: [0, 0],
                size: [shape.width || 100, shape.height || 100]
            });
            break;
        case 'circle':
            path = new paper.Path.Circle({
                center: [0, 0],
                radius: shape.radius || 50
            });
            break;
        case 'triangle':
            path = new paper.Path.RegularPolygon({
                center: [0, 0],
                sides: 3,
                radius: shape.radius || 50
            });
            break;
        case 'star':
            path = new paper.Path.Star({
                center: [0, 0],
                points: shape.numPoints || 5,
                radius1: shape.innerRadius || 20,
                radius2: shape.outerRadius || 50
            });
            break;
        case 'bubble':
            path = new paper.Path("M0 0 H 100 V 70 H 20 L 0 100 L 0 70 V 0 Z");
            break;
        case 'path':
            path = new paper.CompoundPath(shape.data);
            break;
        case 'parametric':
            // 파라메트릭 도형: shapeGenerators가 생성한 pathData 사용
            // pathData는 이미 (0,0) 중심으로 정규화됨
            path = new paper.CompoundPath(shape.pathData);
            break;
        default:
            return null;
    }

    // CompoundPath(텍스트, 합쳐진 도형)의 sub-path winding을 정규화한다.
    // Paper.js의 unite()/subtract()는 winding 기반(nonzero)이라, 입력이
    // evenodd-스타일(makerjs combine=true 출력 등)이면 hole이 outer로 오인되어
    // 결과에서 사라진다. 각 sub-path를 다른 sub-path들이 포함하는 개수를 세서:
    //   짝수 → outer (CW)
    //   홀수 → hole (CCW)
    // 즉 even-odd 규칙의 정의 그대로 적용해 nonzero-canonical로 변환.
    // 캔버스 렌더링은 별도 경로이므로 이 호출이 영향주지 않음.
    if (path && path.children && path.children.length >= 2) {
        const children = path.children.slice();
        for (const child of children) {
            const sample = child.bounds.center;
            let depth = 0;
            for (const other of children) {
                if (other === child) continue;
                try { if (other.contains(sample)) depth += 1; } catch { /* skip */ }
            }
            const wantCW = (depth % 2 === 0);
            if (child.clockwise !== wantCW) {
                try { child.reverse(); } catch { /* skip */ }
            }
        }
    }

    path.scale(shape.scaleX || 1, shape.scaleY || 1, new paper.Point(0, 0));

    if (shape.rotation) {
        path.rotate(shape.rotation, new paper.Point(0, 0));
    }

    path.translate(new paper.Point(shape.x, shape.y));

    // Bake all scale and rotate matrix transformations directly into the point data.
    // This prevents ellipses (squished circles) from rendering double/ghost lines
    // when exporting to raw SVG or boolean paths.
    path.flatten(0.1);

    return path;
}

export function mergeAll(shapes) {
    if (shapes.length < 2) return null;
    let paths = shapes.map(konvaShapeToPaperPath).filter(Boolean);
    if (paths.length < 2) return null;

    let result = paths[0];
    for (let i = 1; i < paths.length; i++) {
        let newResult = result.unite(paths[i]);
        result.remove();
        paths[i].remove();
        result = newResult;
    }

    const bounds = result.bounds;
    const centerX = bounds.center.x;
    const centerY = bounds.center.y;

    result.translate(new paper.Point(-centerX, -centerY));
    const data = result.pathData;

    return {
        pathData: data,
        x: centerX,
        y: centerY,
        width: bounds.width,
        height: bounds.height
    };
}

export function processTargetBoolean(type, targetShape, otherShapes) {
    if (!targetShape || otherShapes.length === 0) return null;

    let targetPath = konvaShapeToPaperPath(targetShape);
    if (!targetPath) return null;

    let otherPaths = otherShapes.map(s => ({ shape: s, path: konvaShapeToPaperPath(s) })).filter(o => o.path);

    let consumedShapeIds = [];
    let newShapesData = [];
    let modified = false;

    if (type === 'union') {
        let currentResult = targetPath;

        for (let i = 0; i < otherPaths.length; i++) {
            let otherPath = otherPaths[i].path;

            if (currentResult.intersects(otherPath) || currentResult.bounds.contains(otherPath.bounds) || otherPath.bounds.contains(currentResult.bounds)) {
                let newResult = currentResult.unite(otherPath);
                consumedShapeIds.push(otherPaths[i].shape.id);
                currentResult.remove();
                otherPath.remove();
                currentResult = newResult;
                modified = true;
            } else {
                otherPath.remove(); // Not used
            }
        }

        if (!modified) {
            currentResult.remove();
            return { modified: false };
        }

        consumedShapeIds.push(targetShape.id);
        const bounds = currentResult.bounds;
        const centerX = bounds.center.x;
        const centerY = bounds.center.y;

        currentResult.translate(new paper.Point(-centerX, -centerY));
        currentResult.flatten(0.1); // Guarantee matrix bakes into point positions

        newShapesData.push({
            pathData: currentResult.pathData,
            x: centerX,
            y: centerY,
            width: bounds.width,
            height: bounds.height
        });
        currentResult.remove();

    } else if (type === 'subtract') {
        // Target is the "puncher"
        consumedShapeIds.push(targetShape.id);

        for (let i = 0; i < otherPaths.length; i++) {
            let otherPath = otherPaths[i].path;

            if (targetPath.intersects(otherPath) || targetPath.bounds.contains(otherPath.bounds) || otherPath.bounds.contains(targetPath.bounds)) {
                let newResult = otherPath.subtract(targetPath);
                consumedShapeIds.push(otherPaths[i].shape.id);

                const bounds = newResult.bounds;
                // Only keep it if it wasn't completely destroyed by the puncher
                if (bounds.width > 0 && bounds.height > 0 && newResult.pathData) {
                    const centerX = bounds.center.x;
                    const centerY = bounds.center.y;

                    newResult.translate(new paper.Point(-centerX, -centerY));
                    newResult.flatten(0.1); // Guarantee matrix bakes into point positions

                    newShapesData.push({
                        pathData: newResult.pathData,
                        x: centerX,
                        y: centerY,
                        width: bounds.width,
                        height: bounds.height
                    });
                }

                newResult.remove();
                otherPath.remove();
                modified = true;
            } else {
                otherPath.remove(); // Not used
            }
        }

        targetPath.remove();

        if (!modified) {
            return { modified: false };
        }
    }

    return {
        modified: true,
        consumedShapeIds,
        newShapesData
    };
}
