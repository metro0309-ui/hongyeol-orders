홍열이네 발주 관리 v23 · 2026-11-24 업무 데이터 백업
index.html은 점장 및 사모님 화면 코드, catalog.html은 품목 편집 화면입니다. 발주 처리·동기화에는 서버와 DB 연결이 필요합니다.
source에는 Sites 배포 원본, 빌드 코드, DB 마이그레이션이 있습니다. 수정한 뒤 source 폴더에서 node build.mjs로 다시 빌드합니다.
data/orders.sqlite는 실제 업무 DB 복원본입니다. orders.json은 주문 기록, catalog.json은 카테고리별 품목·규격·단가 자료입니다. restore.sql은 같은 DB의 SQL 백업입니다.
Vercel 이전 시 빈 Turso DB에 restore.sql을 먼저 가져오고 프로젝트 환경 변수 TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_PASSWORD, CATALOG_PASSWORD를 등록하세요. 마지막 두 값은 새 관리자 비밀번호입니다. api/entry.js와 vercel.json은 이전용 어댑터입니다. 외부 배포 검증은 별도입니다.
실제 매장 데이터가 포함되므로 공개 GitHub에는 이 ZIP이나 data 폴더를 올리지 마세요. 비밀번호·인증 해시·로그인 세션은 백업에서 제외했습니다. 기존 사이트에서 쓰던 기기 식별 쿠키는 다른 도메인으로 옮겨지지 않습니다. 복원된 과거 주문은 사모님 화면에서 조회할 수 있습니다.
