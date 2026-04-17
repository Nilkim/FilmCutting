-- ============================================================
-- 주문 테스트 데이터 전체 삭제 (필름 데이터는 유지)
-- 주문번호 포맷이 {phone8}-{YYYYMMDD}-{seq3} → {phone4}-{YYMMDD}-{seq3}로
-- 바뀌면서 기존 레코드와 충돌 방지를 위해 비움.
-- Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- 1) orders 테이블 모든 행 삭제
truncate table public.orders;

-- 2) 일련번호 카운터 초기화 (새 포맷으로 다시 001부터 시작)
truncate table public.order_daily_seq;

-- 3) (선택) Storage 'dxf-files' 버킷의 모든 DXF 파일 삭제
--    주문과 함께 업로드된 DXF를 날리고 싶으면 아래 쿼리도 실행
delete from storage.objects where bucket_id = 'dxf-files';
