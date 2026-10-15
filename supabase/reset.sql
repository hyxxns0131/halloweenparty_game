-- =========================================================
-- 테스트 데이터 지우기 (파티 직전에 한 번)
--   SQL Editor 에서 실행 → 출품작·투표·댓글·사탕 기록이 모두 지워집니다.
--   업로드된 이미지 파일은 Storage → pumpkins 버킷에서 폴더째 지우면 됩니다.
-- =========================================================
truncate table public.comments, public.votes, public.candy_log, public.entries restart identity;
