import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Group, Rect, Circle, RegularPolygon, Star, Path, Line, Transformer } from 'react-konva';
import './DrawingCanvas.css';

// Physics scale: Let's assume 1mm = 1px for easy mapping.
// Film width is 1220mm -> 1220px. 
// We will scale the stage to fit the container width.
const FILM_WIDTH_MM = 1220;
const GRID_INTERVAL = 500;

// Speech bubble path (approximate)
const SpeechBubblePath = "M0 0 H 100 V 70 H 20 L 0 100 L 0 70 V 0 Z";

// Shape Wrapper component that handles selection and transformation
const ShapeObject = ({ shapeProps, isSelected, onSelect, onChange, canvasScale, selectedFilm }) => {
    const shapeRef = useRef();
    const trRef = useRef();

    useEffect(() => {
        if (isSelected && trRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer().batchDraw();
        }
    }, [isSelected]);

    const commonProps = {
        ...shapeProps,
        ref: shapeRef,
        draggable: true,
        onClick: onSelect,
        onTap: onSelect,
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
            const node = shapeRef.current;
            const finalScaleX = node.scaleX();
            const finalScaleY = node.scaleY();

            // reset scale back so the node doesn't double-scale when React re-renders it with new props
            node.scaleX(1);
            node.scaleY(1);

            let updatedProps = {
                ...shapeProps,
                x: node.x(),
                y: node.y(),
                rotation: node.rotation(),
                // node.scaleX/Y is already the final absolute scale set by Transformer
                scaleX: finalScaleX,
                scaleY: finalScaleY,
            };

            onChange(updatedProps);
        },
        // Apply accumulated scale explicitly to maintain squish
        scaleX: shapeProps.scaleX || 1,
        scaleY: shapeProps.scaleY || 1,
        // High contrast styling: Shape exactly matches the solid selected string color
        fill: selectedFilm.color,
        stroke: '#ffffff',
        strokeWidth: 2 / canvasScale, // Keeping the thinner border as requested
        strokeScaleEnabled: false, // Prevent border from getting thick when squished
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: { x: 5, y: 5 },
        shadowOpacity: 0.3,
    };

    let ShapeComponent;
    switch (shapeProps.type) {
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
            // Using scale instead of explicit width/height for path
            ShapeComponent = <Path data={SpeechBubblePath} {...commonProps} />;
            break;
        case 'path':
            ShapeComponent = <Path data={shapeProps.data} {...commonProps} />;
            break;
        default:
            ShapeComponent = null;
    }

    return (
        <React.Fragment>
            {ShapeComponent}
            {isSelected && (
                <Transformer
                    ref={trRef}
                    ignoreStroke={true}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 10 || newBox.height < 10) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}
        </React.Fragment>
    );
};

const DrawingCanvas = ({ selectedFilm, shapes, setShapes, activeShapeId, setActiveShapeId, maxLength }) => {
    const containerRef = useRef();
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const [scale, setScale] = useState(1);

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

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (activeShapeId) {
                    setShapes((prevShapes) => prevShapes.filter(s => s.id !== activeShapeId));
                    setActiveShapeId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeShapeId, setShapes, setActiveShapeId]);

    const handleShapeChange = (index, newProps) => {
        const rects = shapes.slice();
        rects[index] = newProps;
        setShapes(rects);
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
        <div className="canvas-container" ref={containerRef} style={{ overflowY: 'auto' }}>
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
                                    x={0}
                                    y={0}
                                    width={FILM_WIDTH_MM}
                                    height={virtualCanvasHeight}
                                    fill="#ffffff"
                                />
                                <Rect
                                    x={0}
                                    y={0}
                                    width={FILM_WIDTH_MM}
                                    height={virtualCanvasHeight}
                                    fill={selectedFilm.color}
                                    opacity={0.6} // 60% for the "middle" tone
                                    listening={false}
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
                                    canvasScale={scale}
                                    selectedFilm={selectedFilm}
                                />
                            ))}
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
