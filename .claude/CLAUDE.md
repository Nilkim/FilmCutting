# FilmCutting 프로젝트 가이드

## 개요
코틸레돈 브랜드의 필름 커팅 주문 SPA. Vite + React 19 + Konva + Supabase.

## 경로
- `src/pages/OrderPage.jsx` — 고객 주문 에디터 (Konva 캔버스 + 사이드바 + 가격 패널)
- `src/pages/OrderLookupPage.jsx` — 전화번호로 본인 주문 조회/재주문
- `src/pages/OrderCompletePage.jsx` — 주문 완료 + 번호 안내
- `src/pages/Admin*.jsx` — 관리자 로그인/필름 CRUD/주문 관리
- `src/components/DrawingCanvas.jsx` — Konva Stage + 도형 렌더링
- `src/components/Sidebar.jsx` — 도형·편집·파일 툴
- `src/components/PricePanel.jsx` — 가격 요약 + "주문 접수" 버튼
- `src/components/FilmSelector.jsx` — 필름 선택 모달
- `src/components/KoreanSafeInput.jsx` — IME 안전 입력
- `src/hooks/useFilms.js` — Supabase 필름 fetch + snake↔camel 매핑
- `src/hooks/useHistory.js` — undo/redo (5단계)
- `src/hooks/useReorderLoader.js` — 재주문 도면 자동 로드
- `src/utils/dxfExport.js` — makerjs + Paper.js 기반 DXF 변환
- `src/utils/shapeBoolean.js` — 도형 합치기/빼기 (Paper.js)
- `src/lib/supabase.js` — 클라이언트 인스턴스
- `supabase/schema.sql` — 초기 스키마
- `supabase/lookup.sql` — 전화번호 기반 주문 조회 RPC

## 환경
- 필름 폭: 1220mm (DrawingCanvas `FILM_WIDTH_MM`)
- 과금 단위: 0.5m (500mm) 반올림
- 내부 좌표계 1:1 mm = 캔버스 유닛
- 주문번호 포맷: `{전화뒷8자리}-{YYYYMMDD}-{그날의순번3자리}`
- Supabase RLS: anon은 활성 필름 SELECT + 주문 INSERT 가능, 인증된 관리자만 전체 권한
- 파비콘/로고: `public/favicon.ico`, `public/logo.svg` (코틸레돈 브랜드 자원)

## 커밋/배포
- GitHub: https://github.com/Nilkim/FilmCutting (main 브랜치 자동 배포)
- Netlify가 push 시 자동 빌드 (`netlify.toml`)
- 환경변수는 Netlify 대시보드에 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`로 등록됨

## 작업 규칙
- 병렬 에이전트 작업 시 파일 충돌 피하기 — 각 에이전트에게 수정 허용 파일 리스트 명시
- `src_backup_*/` 폴더는 과거 백업이므로 절대 수정 금지
- DrawingCanvas는 민감 영역 — 변경 시 좌표·스케일·pointer 이벤트 주의
- 한글 입력 필드는 `KoreanSafeInput`/`KoreanSafeTextarea` 사용 (IME 조합 끊김 방지)
- 커밋 메시지는 한글 허용, 이유 중심으로 서술
