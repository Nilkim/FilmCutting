# 계획: 자유 드로잉 → 파라메트릭 도형 생성

## 목표
고객이 일반인이므로 자유 드로잉을 제거하고, 도형 버튼 클릭 → **치수/필렛/회전 모달** → 정확한 수치로 도형 생성. 캔버스에서는 이동·회전·삭제·선택만 가능. 도형 합치기/빼기는 유지. 더블클릭으로 기존 도형 재편집.

## 확정된 요구사항
1. 모든 도형은 **폭(mm) × 높이(mm)** 로 통일 (원·별표는 이 값으로 타원형/비정형 star 표현)
2. 필렛 입력 받음. 짧은 변의 절반 초과 시 **자동 클램프**
3. 별표: **꼭짓점 개수** 입력 가능
4. 회전: **모달 필드로 이동** (캔버스 회전 핸들 제거)
5. 캔버스: 드래그 이동만, 크기조정 불가, **Del 키 삭제**
6. 저장: 모든 도형 → **pathData로 통일 저장** (필렛 포함한 최종 경로)
7. 도형에 **원본 파라미터 함께 저장** → 더블클릭 시 모달 재오픈 · 현재 위치/회전 유지하며 치수 재편집
8. 치수는 키보드 수치 입력

## 도형별 모달 필드
| 도형 | 필드 |
|---|---|
| 사각형 | 폭, 높이, 필렛, 회전 |
| 원형/타원 | 폭, 높이 (같으면 원, 다르면 타원), 회전 |
| 삼각형 | 밑변(=폭), 높이, 필렛, 회전 |
| 별표 | 폭, 높이, 꼭짓점 수(3~12), 내부비율(0~1, 기본 0.5), 필렛, 회전 |
| 말풍선 | 폭, 높이, 꼬리 방향(상/하/좌/우), 꼬리 크기, 필렛, 회전 |

## Shape 데이터 구조 (새)
```js
{
  id: uuid,
  type: 'parametric',            // 새 유형 식별자
  kind: 'rect' | 'circle' | 'triangle' | 'star' | 'bubble',
  params: { /* kind에 따른 필드 */ },
  pathData: string,              // 파라미터로 생성한 최종 SVG path
  width: number,                 // bounding box width (mm)
  height: number,                // bounding box height (mm)
  x: number,                     // 중심 x (캔버스 좌표)
  y: number,                     // 중심 y
  rotation: number,              // degrees
  scaleX: 1, scaleY: 1,          // 사용자가 바꾸지 않음
}
```

기존 boolean 결과(`type: 'path'`, `data: pathData`)와 재주문으로 로드된 옛 shapes는 그대로 렌더링, 더블클릭 재편집은 `type === 'parametric'`인 shape에만 작동.

## 파일 분담 (에이전트 격리)

### Agent-H (경로 생성기) — 먼저 시작, 독립
**생성 파일**: `src/utils/shapeGenerators.js`
- `generateRectPath({ width, height, fillet })` → `{ pathData, width, height }`
- `generateCirclePath({ width, height })` → 타원 path
- `generateTrianglePath({ width, height, fillet })` → 필렛 적용 이등변삼각형
- `generateStarPath({ width, height, points, innerRatio, fillet })`
- `generateBubblePath({ width, height, tailDir, tailSize, fillet })`
- `clampFillet(fillet, width, height)` — 짧은변/2 이하로 자동 제한
- makerjs + Paper.js 활용. 반환 pathData는 SVG `d` 문자열(0,0 기준 중심점). `flatten(0.1)` 적용해 DXF 호환성 확보

### Agent-I (캔버스 제약) — Agent-H와 병렬
**수정 파일**: `src/components/DrawingCanvas.jsx`
- Transformer: rotate·resize 핸들 모두 제거 (회전은 모달에서만 받음)
- 도형 드래그: 이동만 허용 (`draggable`은 유지, 내부 크기 고정)
- 더블클릭 이벤트: `onDblTap`/`onDblClick` → 상위로 `onEditShape(shapeId)` 콜백 전달
- Del/Backspace 키: 선택된 도형 삭제 (`onDeleteShape(shapeId)` 콜백)
- 파라메트릭 shape는 Path로 렌더 (type === 'parametric' 인 경우 shape.pathData 사용)
- 기존 boolean 결과 path와 과거 free-draw shape는 기존 로직으로 렌더 유지

### Agent-G (모달 UI) — H 완료 후 착수
**생성 파일**: `src/components/ShapeInputModal.jsx` + `.css`
- props: `{ kind, initialParams?, onConfirm, onCancel }`
- `initialParams` 있으면 수정 모드, 없으면 신규
- kind별 폼 렌더링 (위 "도형별 모달 필드" 표)
- 미리보기 섹션: shapeGenerators로 pathData 생성 후 SVG로 실시간 표시
- 필렛 입력 초과 시 자동 클램프 + 안내 문구
- 확인 시 `onConfirm({ params, width, height, pathData })` 호출
- 모바일 대응: 풀스크린
- 한국어 UI

### Agent-J (통합) — G/I 완료 후 착수, 내가 직접 할 수도
**수정 파일**: `src/pages/OrderPage.jsx`, `src/components/Sidebar.jsx`
- Sidebar 도형 버튼: 클릭 시 `onRequestShape(kind)` 콜백 호출
- OrderPage: 모달 상태 관리 (`shapeModalKind`, `shapeModalEditing`)
  - 신규: Sidebar 버튼 → 모달 오픈(kind, initialParams=null)
  - 편집: DrawingCanvas onEditShape → 모달 오픈(kind, initialParams=shape.params)
  - 확인 시: 신규면 새 shape 추가, 편집이면 pathData·params·width·height만 교체(위치/회전 보존)
- 삭제 핸들러 전달
- 회전은 modal.params.rotation이 shape.rotation에 반영되도록

## 제약·유의
- `src_backup_*/` 수정 금지
- `src/utils/dxfExport.js`, `src/utils/shapeBoolean.js`, `src/hooks/*`, `src/lib/supabase.js` 는 이번 Phase에서 수정 불필요 (읽기만)
- `AdminLayoutPage`, `AdminLoginPage`, `AdminFilmsPage`, `AdminOrdersPage`, `OrderLookupPage`, `OrderCompletePage` 건드리지 않음
- Supabase 스키마 변경 없음 (shapes_json이 jsonb라 새 구조 그대로 저장 가능)
- 기존 주문으로 재주문 시 옛 shape 구조도 렌더되게 유지 (더블클릭 재편집만 안 됨)

## 빌드·검증
- 각 에이전트는 작업 끝에 가능한 한 `npm run build`로 검증
- 샌드박스 제한으로 실패 시 결과 보고
- 최종 통합 후 내가 전체 빌드 + dev 서버 재가동

## 커밋
- 한 에이전트당 하나의 논리 단위. 최종 통합 후 **단일 커밋**으로 푸시 (요청 시)
