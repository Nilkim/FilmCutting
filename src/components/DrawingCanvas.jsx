import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Group, Rect, Circle, RegularPolygon, Star, Path, Line, Text, Transformer } from 'react-konva';
import paper from 'paper';
import './DrawingCanvas.css';

// Physics scale: Let's assume 1mm = 1px for easy mapping.
// Film width is 1220mm -> 1220px.
// We will scale the stage to fit the container width.
const FILM_WIDTH_MM = 1220;
const GRID_INTERVAL = 500;

// TEMP debug overlay to investigate billable-area over-trigger reports.
// When true, draws each shape's unrotated bbox (what calculateMaxLength
// actually "sees") in red dashed lines + a green dashed line at the current
// billableLength threshold. Toggle via ?debug=bbox in the URL or set the
// const below to true.
const DEBUG_BILLABLE = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debug');

// Speech bubble path (approximate) — legacy
const SpeechBubblePath = "M0 0 H 100 V 70 H 20 L 0 100 L 0 70 V 0 Z";

// Renders width/height labels (in mm) outside the bounding box of the
// currently selected shape. Positioned in shape-local space and rendered
// inside a Group with the shape's rotation applied so labels follow the
// shape as it rotates.
//
// Local dimensions used: shape.width × scaleX (rotation-ignoring), matching
// the side panel's "가로/세로" inputs so visual + numeric stay consistent.
const DimensionLabels = ({ shape, canvasScale }) => {
    if (!shape || canvasScale <= 0) return null;
    const w = (shape.width || 0) * (shape.scaleX || 1);
    const h = (shape.height || 0) * (shape.scaleY || 1);
    if (w <= 0 || h <= 0) return null;

    const fontSize = 14 / canvasScale;
    const padding = 8 / canvasScale;
    const boxW = 200 / canvasScale; // wide enough buffer for centered text

    return (
        <Group
            x={shape.x}
            y={shape.y}
            rotation={shape.rotation || 0}
            listening={false}
        >
            {/* Bottom-center: width */}
            <Text
                text={`${w.toFixed(0)} mm`}
                x={-boxW / 2}
                y={h / 2 + padding}
                width={boxW}
                align="center"
                fontSize={fontSize}
                fill="#1e88e5"
                fontStyle="600"
            />
            {/* Right-center: height (rendered horizontally, not rotated) */}
            <Text
                text={`${h.toFixed(0)} mm`}
                x={w / 2 + padding}
                y={-fontSize / 2}
                fontSize={fontSize}
                fill="#1e88e5"
                fontStyle="600"
            />
        </Group>
    );
};

// Debug overlay (?debug in URL): shows the EXACT geometry that the new
// calc uses — for each shape, draws a short horizontal red dashed segment
// at the actual lowest Y of its (rotated, scaled) outline. The segment
// hugs the shape's horizontal extent so multiple shapes don't pile their
// markers across the whole canvas.
//
// If the red segment ever sits ABOVE the visual bottom edge of its shape,
// the calc is under-triggering. If it sits BELOW the visual bottom, the
// calc is over-triggering. Goal: red segment should kiss the lowest pixel.
const computeShapeBoundsDebug = (shape) => {
    const sx = shape.scaleX || 1;
    const sy = shape.scaleY || 1;
    const data = shape.pathData || shape.data;
    if (data) {
        if (!paper.project) paper.setup(new paper.Size(1, 1));
        const item = paper.PathItem.create(data);
        item.scale(sx, sy, new paper.Point(0, 0));
        if (shape.rotation) item.rotate(shape.rotation, new paper.Point(0, 0));
        const b = item.bounds;
        const out = {
            bottom: shape.y + b.bottom,
            left:   shape.x + b.left,
            right:  shape.x + b.right,
        };
        item.remove();
        return out;
    }
    return null;
};

const DebugBillableOverlay = ({ shapes, billableLength, canvasScale }) => {
    if (!DEBUG_BILLABLE) return null;
    return (
        <Group listening={false}>
            {shapes.map((shape) => {
                const b = computeShapeBoundsDebug(shape);
                if (!b) return null;
                return (
                    <Line
                        key={`dbg-${shape.id}`}
                        points={[b.left, b.bottom, b.right, b.bottom]}
                        stroke="#ef4444"
                        strokeWidth={2 / canvasScale}
                        strokeScaleEnabled={false}
                        dash={[8 / canvasScale, 4 / canvasScale]}
                    />
                );
            })}
            {/* Current billable boundary — once any shape's bottom crosses
                this, the area expands by another 500mm step. */}
            <Line
                points={[0, billableLength, FILM_WIDTH_MM, billableLength]}
                stroke="#16a34a"
                strokeWidth={2 / canvasScale}
                strokeScaleEnabled={false}
                dash={[10 / canvasScale, 6 / canvasScale]}
            />
            {/* Next step boundary — preview of where the trigger would jump to. */}
            <Line
                points={[0, billableLength + 500, FILM_WIDTH_MM, billableLength + 500]}
                stroke="#f59e0b"
                strokeWidth={1 / canvasScale}
                strokeScaleEnabled={false}
                dash={[6 / canvasScale, 6 / canvasScale]}
            />
        </Group>
    );
};

// Render strokes on top of all fills so overlapping lines are never hidden.
//
// IMPORTANT: two correctness measures:
//  (1) Skip the currently-selected shape — Konva's Transformer mutates the
//      live node during drag/resize/rotate but `shapes` state only updates
//      on transform end, so an overlay stroke would lag the body during the
//      drag. The selected shape's own (selection-thick) stroke handles its
//      visibility anyway.
//  (2) Include `pathData`/sizing identity in the React key. Konva.Path's
//      internal data array can desync from the `data` prop in some prop-
//      change orders (we observed stale spike shapes after spec-edit live
//      regen). Re-keying forces a fresh Konva node when geometry changes —
//      cheap because it only happens on actual edits, not on every render.
const strokeKeyFor = (shape) => {
    const geom = shape.pathData?.length
        ?? `${shape.width || 0}x${shape.height || 0}`;
    return `stroke-${shape.id}-${geom}`;
};

const StrokeOverlay = ({ shapes, activeShapeId }) => {
    return (
        <Group listening={false}>
            {shapes.filter(s => s.id !== activeShapeId).map((shape) => {
                const props = {
                    x: shape.x,
                    y: shape.y,
                    rotation: shape.rotation || 0,
                    scaleX: shape.scaleX || 1,
                    scaleY: shape.scaleY || 1,
                    stroke: shape.isDxf ? '#ffffff' : '#000000',
                    strokeWidth: 2,
                    strokeScaleEnabled: false,
                    fill: null
                };

                const key = strokeKeyFor(shape);

                switch (shape.type) {
                    case 'parametric':
                        return <Path key={key} {...props} data={shape.pathData} fillRule="evenodd" />;
                    case 'rect': return <Rect key={key} {...props} width={shape.width} height={shape.height} cornerRadius={shape.cornerRadius} />;
                    case 'circle': return <Circle key={key} {...props} radius={shape.radius} />;
                    case 'triangle': return <RegularPolygon key={key} {...props} sides={3} radius={shape.radius} />;
                    case 'star': return <Star key={key} {...props} numPoints={shape.numPoints || 5} innerRadius={shape.innerRadius} outerRadius={shape.outerRadius} />;
                    case 'bubble': return <Path key={key} {...props} data={SpeechBubblePath} />;
                    case 'path': return <Path key={key} {...props} data={shape.data} />;
                    default: return null;
                }
            })}
        </Group>
    );
};

// Shape Wrapper component: drag only, no resize/rotate handles.
// Selection is shown via a thicker stroke (see `isSelected` below).
const ShapeObject = ({ shapeProps, isSelected, onSelect, onRequestSpecEdit, onChange, canvasScale, selectedFilm, selectedNodeRef }) => {
    const shapeRef = useRef();

    const commonProps = {
        ...shapeProps,
        ref: (node) => {
            shapeRef.current = node;
            if (isSelected && selectedNodeRef) {
                selectedNodeRef.current = node;
            }
        },
        draggable: true,
        onClick: onSelect,
        onTap: onSelect,
        // 더블탭/더블클릭은 spec 편집 시트를 명시적으로 여는 트리거.
        // 모바일에서는 단일 탭이 시트를 띄우지 않도록 분리되어 있어서,
        // 사용자가 의도적으로 두 번 두드려야만 모달이 올라온다.
        // Konva는 onDblClick(마우스)과 onDblTap(터치)을 별도로 디스패치한다.
        onDblClick: onRequestSpecEdit,
        onDblTap: onRequestSpecEdit,
        dragBoundFunc: (pos) => {
            return {
                x: pos.x,
                y: Math.max(0, pos.y)
            };
        },
        onDragEnd: (e) => {
            onChange({
                ...shapeProps,
                x: e.target.x(),
                y: e.target.y(),
            });
        },
        onTransformEnd: (e) => {
            const node = e.target;
            // 좌상/좌측/상단 핸들로 크기를 조정하면 Konva가 반대편 anchor를
            // 고정하면서 node.x/y도 함께 이동시킨다. x/y를 같이 저장하지 않으면
            // React state는 stale 좌표를 갖게 되고, 합치기·DXF 등 좌표 의존
            // 연산이 어긋난다(특히 합쳐진 결과의 bounds.center 위치).
            onChange({
                ...shapeProps,
                x: node.x(),
                y: node.y(),
                rotation: node.rotation(),
                scaleX: node.scaleX(),
                scaleY: node.scaleY(),
            });
        },
        // Apply stored scale explicitly (legacy shapes may have non-1 scale)
        scaleX: shapeProps.scaleX || 1,
        scaleY: shapeProps.scaleY || 1,
        rotation: shapeProps.rotation || 0,
        // Restored solid fills. The StrokeOverlay will ensure lines remain visible on top.
        fill: shapeProps.isDxf ? null : selectedFilm.color,
        // Selection feedback: thicker, highlighted stroke while selected
        stroke: isSelected ? '#1e88e5' : (shapeProps.isDxf ? '#ffffff' : '#000000'),
        strokeWidth: isSelected ? 4 : 2,
        strokeScaleEnabled: false,
        hitStrokeWidth: shapeProps.isDxf ? 12 / canvasScale : 0,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: { x: 5, y: 5 },
        shadowOpacity: shapeProps.isDxf ? 0 : 0.3,
    };

    let ShapeComponent;
    switch (shapeProps.type) {
        case 'parametric':
            // Parametric shapes: pathData already centered on (0,0) by generator.
            // fillRule='evenodd' so subpath holes (e.g. ㅇ, o, A inner counter)
            // render transparent instead of filled.
            ShapeComponent = (
                <Path
                    data={shapeProps.pathData}
                    offsetX={0}
                    offsetY={0}
                    fillRule="evenodd"
                    {...commonProps}
                />
            );
            break;
        case 'rect':
            ShapeComponent = <Rect {...commonProps} />;
            break;
        case 'circle':
            ShapeComponent = <Circle {...commonProps} />;
            break;
        case 'triangle':
            ShapeComponent = <RegularPolygon sides={3} {...commonProps} />;
            break;
        case 'star':
            ShapeComponent = <Star numPoints={shapeProps.numPoints || 5} innerRadius={shapeProps.innerRadius} outerRadius={shapeProps.outerRadius} {...commonProps} />;
            break;
        case 'bubble':
            ShapeComponent = <Path data={SpeechBubblePath} {...commonProps} />;
            break;
        case 'path':
            ShapeComponent = <Path data={shapeProps.data} {...commonProps} />;
            break;
        default:
            ShapeComponent = null;
    }

    return ShapeComponent;
};

const DrawingCanvas = ({ selectedFilm, shapes, setShapes, activeShapeId, setActiveShapeId, onRequestSpecEdit, maxLength, onDeleteShape }) => {
    const containerRef = useRef();
    const trRef = useRef();
    const selectedNodeRef = useRef(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const [scale, setScale] = useState(1);

    // Clear stale selected node ref when selection clears
    useEffect(() => {
        if (!activeShapeId) {
            selectedNodeRef.current = null;
        }
    }, [activeShapeId]);

    // Attach Transformer to the currently selected shape's node
    useEffect(() => {
        if (!trRef.current) return;
        if (activeShapeId && selectedNodeRef.current) {
            trRef.current.nodes([selectedNodeRef.current]);
            trRef.current.getLayer()?.batchDraw();
        } else {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [activeShapeId, shapes]);

    // 모바일 빈 캔버스에서 페이지 세로 스크롤을 살리기 위해 Konva가
    // .konvajs-content / canvas에 박는 inline `touch-action: none`을
    // setProperty('important')로 강제 override한다. CSS의 !important만으론
    // Konva가 동일하게 inline !important로 박을 수 있어 stylesheet가 지는
    // 케이스가 있음 — JS로 inline !important를 직접 박아 cascade에서
    // 마지막에 적용되는 우리 값이 이기게 함. stageSize가 바뀔 때마다
    // 다시 적용해 Konva가 redraw 중 다시 set해도 우리 값이 살아남도록.
    useEffect(() => {
        if (!containerRef.current) return;
        const isMobile = typeof window !== 'undefined'
            && window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) return;
        const id = requestAnimationFrame(() => {
            const targets = containerRef.current?.querySelectorAll(
                '.canvas-scroll-area, .konvajs-content, .konvajs-content > canvas'
            );
            targets?.forEach((el) =>
                el.style.setProperty('touch-action', 'pan-y', 'important')
            );
        });
        return () => cancelAnimationFrame(id);
    }, [stageSize]);

    // Calculate the billable bound (rounded up to nearest 500)
    const billableLength = Math.max(500, Math.ceil(Math.max(maxLength, 0) / 500) * 500);

    // Dynamic virtual canvas height: Billable length + 1 buffer unit (500mm)
    const virtualCanvasHeight = billableLength + GRID_INTERVAL;

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                const height = containerRef.current.offsetHeight;
                setStageSize({ width, height });
                // Now scale based on the available container width minus some padding so it looks like a roll in the middle
                const availableWidth = width - 40; // 20px padding on each side
                setScale(availableWidth / FILM_WIDTH_MM);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const checkDeselect = (e) => {
        // deselect when clicked on empty area
        const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background';
        if (clickedOnEmpty) {
            setActiveShapeId(null);
        }
    };

    // Del/Backspace to delete selected shape — with input-focus guard
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (!activeShapeId) return;
            const active = document.activeElement;
            if (active) {
                const tag = active.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) {
                    return;
                }
            }
            if (typeof onDeleteShape === 'function') {
                onDeleteShape(activeShapeId);
            } else {
                // Fallback to old behavior if no callback supplied
                setShapes((prevShapes) => prevShapes.filter(s => s.id !== activeShapeId));
                setActiveShapeId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeShapeId, setShapes, setActiveShapeId, onDeleteShape]);

    const handleShapeChange = (index, newProps) => {
        const rects = shapes.slice();
        rects[index] = newProps;
        setShapes(rects);
    };

    // Double-click re-edit was removed — once a shape is placed, the user
    // adjusts dimensions via the side panel (width/height inputs) rather than
    // re-opening the original creation modal with stale params.

    // Generate grid lines (horizontal and vertical)
    const horizontalLines = [];
    const verticalLines = [];

    for (let y = 0; y <= virtualCanvasHeight; y += 100) {
        horizontalLines.push(y);
    }
    for (let x = 0; x <= FILM_WIDTH_MM; x += 100) {
        verticalLines.push(x);
    }

    const stageWidthScale = stageSize.width / scale;
    const offsetX = (stageWidthScale - FILM_WIDTH_MM) / 2;

    return (
        <div
            className="canvas-container"
            ref={containerRef}
            onMouseDown={(e) => {
                // If they click the gray area outside the Konva canvas entirely
                if (e.target === containerRef.current || e.target.className === 'canvas-scroll-area') {
                    setActiveShapeId(null);
                }
            }}
            onTouchStart={(e) => {
                if (e.target === containerRef.current || e.target.className === 'canvas-scroll-area') {
                    setActiveShapeId(null);
                }
            }}
        >
            <div
                className="canvas-scroll-area"
                style={{
                    height: `${virtualCanvasHeight * scale + 100}px`,
                    position: 'relative'
                }}
            >
                <Stage
                    width={stageSize.width}
                    height={virtualCanvasHeight * scale}
                    onMouseDown={checkDeselect}
                    onTouchStart={checkDeselect}
                >
                    <Layer>
                        <Group x={offsetX * scale} y={0} scaleX={scale} scaleY={scale}>
                            {/* --- 1. Base Layer (Empty/Waiting area: Midway tone) --- */}
                            <Group name="background">
                                <Rect
                                    name="background"
                                    x={0}
                                    y={0}
                                    width={FILM_WIDTH_MM}
                                    height={virtualCanvasHeight}
                                    fill="#ffffff"
                                />
                                <Rect
                                    name="background"
                                    x={0}
                                    y={0}
                                    width={FILM_WIDTH_MM}
                                    height={virtualCanvasHeight}
                                    fill={selectedFilm.color}
                                    opacity={0.6} // 60% for the "middle" tone
                                    listening={true}
                                />
                            </Group>

                            {/* --- 2. Active Working Area (Brightest tone) --- */}
                            {/* This is the area being charged for. It uses a very light 20% overlay on white */}
                            {billableLength > 0 && (
                                <Group listening={false}>
                                    <Rect
                                        x={0}
                                        y={0}
                                        width={FILM_WIDTH_MM}
                                        height={billableLength}
                                        fill="#ffffff"
                                    />
                                    <Rect
                                        x={0}
                                        y={0}
                                        width={FILM_WIDTH_MM}
                                        height={billableLength}
                                        fill={selectedFilm.color}
                                        opacity={0.2}
                                    />
                                </Group>
                            )}

                            {/* Drop Shadow for the entire sheet to lift it from the background gray body */}
                            <Rect
                                x={0}
                                y={0}
                                width={FILM_WIDTH_MM}
                                height={virtualCanvasHeight}
                                shadowColor="black"
                                shadowBlur={20}
                                shadowOpacity={0.2}
                                listening={false}
                            />

                            {/* Grid Lines - Vertical */}
                            {verticalLines.map((x, i) => {
                                const isMajor = x % GRID_INTERVAL === 0;
                                return (
                                    <Line
                                        key={`v-${i}`}
                                        points={[x, 0, x, virtualCanvasHeight]}
                                        stroke={isMajor ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.15)"}
                                        strokeWidth={(isMajor ? 2 : 1) / scale}
                                        listening={false}
                                    />
                                );
                            })}

                            {/* Grid Lines - Horizontal */}
                            {horizontalLines.map((y, i) => {
                                const isMajor = y % GRID_INTERVAL === 0;
                                return (
                                    <Line
                                        key={`h-${i}`}
                                        points={[0, y, FILM_WIDTH_MM, y]}
                                        stroke={isMajor ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.15)"}
                                        strokeWidth={(isMajor ? 2 : 1) / scale}
                                        listening={false}
                                    />
                                );
                            })}

                            {/* Shapes */}
                            {shapes.map((shape, i) => (
                                <ShapeObject
                                    key={shape.id}
                                    shapeProps={shape}
                                    isSelected={shape.id === activeShapeId}
                                    onSelect={() => setActiveShapeId(shape.id)}
                                    onRequestSpecEdit={() => onRequestSpecEdit && onRequestSpecEdit(shape.id)}
                                    onChange={(newProps) => handleShapeChange(i, newProps)}
                                    canvasScale={scale}
                                    selectedFilm={selectedFilm}
                                    selectedNodeRef={selectedNodeRef}
                                />
                            ))}

                            {/* StrokeOverlay was intentionally removed —
                                each shape (selected or not) draws its own
                                stroke via ShapeObject. The overlay was a
                                redundant "always-on-top stroke" insurance
                                that was the source of intermittent stroke/
                                body desync after resize, because Konva.Path
                                node reuse left some scale/transform props
                                stale even though React passed new values.
                                Trade-off: in heavily overlapping designs a
                                lower shape's stroke can be partially hidden
                                by an upper shape's fill. Acceptable for
                                film cutting where shapes are placed apart. */}

                            {/* Dimension labels for the selected shape (mm) */}
                            <DimensionLabels
                                shape={shapes.find(s => s.id === activeShapeId)}
                                canvasScale={scale}
                            />

                            {/* TEMP debug — shows calc bbox + billable line */}
                            <DebugBillableOverlay
                                shapes={shapes}
                                billableLength={billableLength}
                                canvasScale={scale}
                            />

                            {/* Rotate + resize transformer */}
                            <Transformer
                                ref={trRef}
                                resizeEnabled={true}
                                rotateEnabled={true}
                                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                                rotationSnapTolerance={5}
                                borderEnabled={true}
                                borderStroke="#1e88e5"
                                borderStrokeWidth={1}
                                anchorSize={10}
                                anchorFill="#ffffff"
                                anchorStroke="#1e88e5"
                            />
                        </Group>
                    </Layer>
                </Stage>
            </div>

            {/* Sticky Ruler at the top */}
            <div
                className="canvas-ruler"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '24px',
                    backgroundColor: 'var(--panel-bg)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    zIndex: 10
                }}
            >
                {verticalLines.map((x, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: offsetX * scale + x * scale,
                            top: 0,
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            transform: 'translateX(-50%)',
                            pointerEvents: 'none'
                        }}
                    >
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                            {x}
                        </div>
                        <div style={{ width: '1px', height: '4px', backgroundColor: 'var(--text-muted)', marginTop: 'auto' }} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DrawingCanvas;
