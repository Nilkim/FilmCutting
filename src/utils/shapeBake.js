import { generateForKind } from './shapeRegistry';

// 비균일 scale을 base에 굽고 scaleX/scaleY를 1로 reset.
// 도형이 transform되면(Konva resize handle 또는 spec editor "가로/세로" 입력
// 으로) scaleX/Y가 1이 아니게 되며, 이 상태에서 path 데이터는 base 좌표라
// fillet 등 원형 요소가 visual에서 타원으로 일그러진다(찌그러짐).
// bake = base width/height에 시각 크기를 흡수하고 path 재생성 → 새 base에서
// 정원형 fillet이 다시 그려짐. scale=1 reset으로 향후 transform이 누적
// 일그러짐 없이 깔끔하게 시작.
//
// **시각 크기 보존 (ratio 보정)**:
//   사각형은 path bounds = params.width × params.height라 단순.
//   삼각형/별의 buildFilletedPolygon은 vertex 안쪽으로 fillet을 굽혀
//   path bounds < params (e.g., baseW=100이면 g.width=85). 이 ratio를
//   유지하지 않으면 베이킹마다 시각 크기가 압축됨.
//   해결: ratio = shape.width / params.width를 보존하면서 newParams.width
//   = visualW / ratio → generator가 큰 입력을 받고 inset 후에도 visualW에
//   가깝게 출력.
//
// **제외 대상**:
//   - kind/params 없음 (boolean으로 합쳐진 path) → 베이킹 정보 없음
//   - 'text' (fillet 없음, 별도 size 파라미터)
//   - 'circle' (fillet 없음, 사용자 결정으로 제외)
//
// 실패 시 원본 shape 그대로 반환 (안전망).
export async function bakeIfNeeded(shape) {
    if (!shape || !shape.kind || !shape.params) return shape;
    if (shape.kind === 'text' || shape.kind === 'circle') return shape;
    const sx = shape.scaleX || 1;
    const sy = shape.scaleY || 1;
    if (sx === 1 && sy === 1) return shape;

    const oldParamsW = shape.params.width || 0;
    const oldParamsH = shape.params.height || 0;
    const baseW = shape.width || oldParamsW;
    const baseH = shape.height || oldParamsH;
    const ratioW = baseW > 0 && oldParamsW > 0 ? baseW / oldParamsW : 1;
    const ratioH = baseH > 0 && oldParamsH > 0 ? baseH / oldParamsH : 1;
    const visualW = baseW * sx;
    const visualH = baseH * sy;
    const newParams = {
        ...shape.params,
        width: ratioW > 0 ? visualW / ratioW : visualW,
        height: ratioH > 0 ? visualH / ratioH : visualH,
    };

    // 아치 곡선 ratio 유지 — 사용자가 의도적으로 만든 곡선부 비율을
    // transform 전후로 보존한다.
    //   ratio = visual_ry / visual_rx = (archHeight × scaleY) / ((W/2) × scaleX)
    //   pre-transform 상태가 scale=1,1로 baked되어 있다고 가정하면
    //   ratio는 단순히 archHeight / (W/2). 이걸 post-bake에서도 유지하려면
    //   archHeight_new = archHeight_old × scaleX.
    // 효과:
    //   - semicircle(ratio=1.0): 늘려도 semicircle 유지
    //   - flat dome(ratio=0.3): 늘려도 같은 비율 dome 유지
    //   - bullet head(ratio=1.5): 늘려도 같은 비율 bullet 유지
    // scaleY는 식에서 빠짐 — archHeight는 Y 길이지만 ratio 분모가 X방향
    // (W)이라 X 변화에만 따라가면 충분.
    if (shape.kind === 'arch' && typeof shape.params.archHeight === 'number') {
        newParams.archHeight = shape.params.archHeight * sx;
    }

    try {
        const g = await generateForKind(shape.kind, newParams);
        return {
            ...shape,
            params: newParams,
            pathData: g.pathData,
            width: g.width,
            height: g.height,
            scaleX: 1,
            scaleY: 1,
        };
    } catch (e) {
        console.error('자동 베이킹 실패:', e);
        return shape;
    }
}
