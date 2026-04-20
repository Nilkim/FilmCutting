import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Group, Rect, Circle, RegularPolygon, Star, Path, Line, Transformer } from 'react-konva';
import './DrawingCanvas.css';

// Physics scale: Let's assume 1mm = 1px for easy mapping.
// Film width is 1220mm -> 1220px.
// We will scale the stage to fit the container width.
const FILM_WIDTH_MM = 1220;
const GRID_INTERVAL = 500;

// Speech bubble path (approximate) — legacy
const SpeechBubblePath = "M0 0 H 100 V 70 H 20 L 0 100 L 0 70 V 0 Z";

// 회전 아이콘 (↻) SVG을 HTMLImageElement로 — Transformer rotater anchor의 패턴 fill용
const ROTATE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>`;

// Render strokes on top of all fills so overlapping lines are never hidden
const StrokeOverlay = ({ shapes }) => {
    return (
        <Group listening={false}>
            {shapes.map((shape) => {
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

                const key = `stroke-${shape.id}`;

                switch (shape.type) {
                    case 'parametric':
                        return <Path key={key} {...props} data={shape.pathData} />;
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
const ShapeObject = ({ shapeProps, isSelected, onSelect, onChange, onDoubleClick, canvasScale, selectedFilm, selectedNodeRef }) => {
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
        onDblClick: onDoubleClick,
        onDblTap: onDoubleClick,
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
            const newRotation = node.rotation();
            // Reset any accidental scale drift (resize is disabled, but be safe)
            node.scaleX(shapeProps.scaleX || 1);
            node.scaleY(shapeProps.scaleY || 1);
            onChange({
                ...shapeProps,
                rotation: newRotation,
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
            ShapeComponent = (
                <Path
                    data={shapeProps.pathData}
                    offsetX={0}
                    offsetY={0}
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

const DrawingCanvas = ({ selectedFilm, shapes, setShapes, activeShapeId, setActiveShapeId, maxLength, onEditShape, onDeleteShape }) => {
    const containerRef = useRef();
    const trRef = useRef();
    const selectedNodeRef = useRef(null);
    const [rotateIcon, setRotateIcon] = useState(null);

    // 회전 아이콘 이미지 로드
    useEffect(() => {
        const img = new window.Image();
        img.onload = () => setRotateIcon(img);
        img.src = 'data:image/svg+xml;base64,' + btoa(ROTATE_ICON_SVG);
    }, []);

    // 아이콘 로드 후 transformer 다시 그리기
    useEffect(() => {
        if (rotateIcon && trRef.current) {
            trRef.current.forceUpdate();
            trRef.current.getLayer()?.batchDraw();
        }
    }, [rotateIcon]);
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

    const handleDoubleClick = (shape) => {
        if (shape.type === 'parametric' && typeof onEditShape === 'function') {
            onEditShape(shape.id);
        }
    };

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
            style={{ overflowY: 'auto' }}
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
                                    onChange={(newProps) => handleShapeChange(i, newProps)}
                                    onDoubleClick={() => handleDoubleClick(shape)}
                                    canvasScale={scale}
                                    selectedFilm={selectedFilm}
                                    selectedNodeRef={selectedNodeRef}
                                />
                            ))}

                            {/* Stroke Overlay (Draws lines of all shapes over top of all fills) */}
                            <StrokeOverlay shapes={shapes} />

                            {/* Rotation-only Transformer */}
                            <Transformer
                                ref={trRef}
                                resizeEnabled={false}
                                rotateEnabled={true}
                                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                                rotationSnapTolerance={5}
                                borderEnabled={false}
                                rotateAnchorOffset={40}
                                rotateAnchorCursor="grab"
                                anchorStyleFunc={(anchor) => {
                                    if (anchor.hasName('rotater')) {
                                        const SIZE = 28;
                                        anchor.cornerRadius(SIZE / 2);
                                        anchor.fill('#2563eb');
                                        anchor.stroke('#ffffff');
                                        anchor.strokeWidth(3);
                                        anchor.width(SIZE);
                                        anchor.height(SIZE);
                                        anchor.offsetX(SIZE / 2);
                                        anchor.offsetY(SIZE / 2);
                                        anchor.shadowColor('#000');
                                        anchor.shadowBlur(6);
                                        anchor.shadowOpacity(0.3);
                                        anchor.shadowOffsetY(2);
                                        if (rotateIcon) {
                                            anchor.fillPriority('pattern');
                                            anchor.fillPatternImage(rotateIcon);
                                            anchor.fillPatternRepeat('no-repeat');
                                            // SVG viewBox 24x24 → anchor 28x28 중앙 정렬 (아이콘은 그대로, 안쪽 2px 여유)
                                            anchor.fillPatternOffset({ x: -2, y: -2 });
                                        }
                                    }
                                }}
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
