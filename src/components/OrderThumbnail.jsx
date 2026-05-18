import React, { useMemo } from 'react';
import { computeUnionBounds } from '../utils/shapeBounds';

// DrawingCanvas의 SpeechBubblePath와 동일한 legacy 상수. 한 줄짜리라
// 추출 비용 > 이득이라 여기 복제. type='bubble' 케이스에서만 사용.
const SPEECH_BUBBLE_PATH = "M0 0 H 100 V 70 H 20 L 0 100 L 0 70 V 0 Z";

// type별로 SVG primitive를 만들어 반환. Konva DrawingCanvas의 ShapeObject가
// 그리는 결과와 시각적으로 1:1 일치하도록 (x/y/rotation/scale) transform group
// 안에서 동일한 origin 규칙(대부분 (0,0) 중심)을 사용한다.
// - rect: Konva Rect는 (0,0)이 좌상단 → SVG <rect>도 (0,0)에서 시작.
// - circle/triangle/star/path/parametric/bubble: Konva가 (0,0) 중심 → SVG도 동일.
const renderShape = (shape, key) => {
    const stroke = '#000';
    const strokeWidth = 1.5;
    const common = {
        fill: 'currentColor',
        stroke,
        strokeWidth,
        vectorEffect: 'non-scaling-stroke',
    };

    switch (shape.type) {
        case 'parametric':
            return (
                <path
                    key={key}
                    d={shape.pathData}
                    fillRule="evenodd"
                    {...common}
                />
            );
        case 'path':
            return (
                <path
                    key={key}
                    d={shape.data}
                    fillRule="evenodd"
                    {...common}
                />
            );
        case 'rect':
            return (
                <rect
                    key={key}
                    x={0}
                    y={0}
                    width={shape.width || 0}
                    height={shape.height || 0}
                    rx={shape.cornerRadius || 0}
                    {...common}
                />
            );
        case 'circle':
            return (
                <circle
                    key={key}
                    cx={0}
                    cy={0}
                    r={shape.radius || 0}
                    {...common}
                />
            );
        case 'triangle': {
            // Konva RegularPolygon(sides=3, radius) — 정삼각형, 첫 꼭짓점이
            // 위쪽(−y). 각 i에 대해 angle = -π/2 + i·2π/3.
            const r = shape.radius || 0;
            const pts = [];
            for (let i = 0; i < 3; i += 1) {
                const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
                pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
            }
            return <polygon key={key} points={pts.join(' ')} {...common} />;
        }
        case 'star': {
            // Konva Star: 2N개 점 교대로 outerRadius/innerRadius.
            // 첫 점이 위(−y), 시계방향으로 진행.
            const n = shape.numPoints || 5;
            const ro = shape.outerRadius || 0;
            const ri = shape.innerRadius || 0;
            const pts = [];
            for (let i = 0; i < n * 2; i += 1) {
                const r = i % 2 === 0 ? ro : ri;
                const a = -Math.PI / 2 + (i * Math.PI) / n;
                pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
            }
            return <polygon key={key} points={pts.join(' ')} {...common} />;
        }
        case 'bubble':
            return <path key={key} d={SPEECH_BUBBLE_PATH} {...common} />;
        default:
            return null;
    }
};

// 주문 조회 카드용 도면 썸네일.
// - shapes: order.shapes_json (재주문에 쓰이는 동일 데이터)
// - filmColor: 카드 배경에 옅게 깔리는 필름 색상. 도형 fill에도 사용.
// - size: 정사각형 변 길이(px). CSS로 override 가능 — width/height에 같이 적용.
const OrderThumbnail = ({ shapes, filmColor = '#e2e8f0', size = 96 }) => {
    // bounds 계산은 매 카드 렌더마다 paper.js를 호출하므로 메모이즈.
    // shapes 배열 자체가 RPC 응답이라 reference identity가 안정.
    const bounds = useMemo(() => computeUnionBounds(shapes), [shapes]);

    if (!shapes || !Array.isArray(shapes) || shapes.length === 0 || !bounds) {
        return (
            <div
                className="order-thumbnail empty"
                style={{ width: size, height: size }}
                aria-label="도면 없음"
            >
                <span>도면 없음</span>
            </div>
        );
    }

    const w = bounds.right - bounds.left;
    const h = bounds.bottom - bounds.top;
    // bounds가 한 점에 수렴하는 케이스 안전망
    const safeW = w > 0 ? w : 1;
    const safeH = h > 0 ? h : 1;
    // 도형 외곽에 약 15% 패딩을 더해 stroke가 잘리지 않도록 한다.
    const pad = Math.max(safeW, safeH) * 0.15;
    const viewBox = `${bounds.left - pad} ${bounds.top - pad} ${safeW + 2 * pad} ${safeH + 2 * pad}`;

    return (
        <div
            className="order-thumbnail"
            style={{ width: size, height: size, color: filmColor }}
            aria-label="도면 미리보기"
        >
            <svg
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
                width="100%"
                height="100%"
            >
                {/* 배경에 필름 색을 옅게 깔아 색상 맥락 제공 */}
                <rect
                    x={bounds.left - pad}
                    y={bounds.top - pad}
                    width={safeW + 2 * pad}
                    height={safeH + 2 * pad}
                    fill={filmColor}
                    opacity={0.15}
                />
                {shapes.map((shape, i) => {
                    const tx = shape.x || 0;
                    const ty = shape.y || 0;
                    const rot = shape.rotation || 0;
                    const sx = shape.scaleX || 1;
                    const sy = shape.scaleY || 1;
                    // Konva 적용 순서: translate → rotate → scale.
                    const transform = `translate(${tx} ${ty}) rotate(${rot}) scale(${sx} ${sy})`;
                    return (
                        <g key={shape.id || i} transform={transform}>
                            {renderShape(shape, `s-${i}`)}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default OrderThumbnail;
