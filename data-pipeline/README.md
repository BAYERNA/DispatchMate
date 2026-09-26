# Data export pipeline

`dbt build`가 모든 데이터 품질 테스트를 통과한 경우에만 `analytics_marts.mart_daily_operations`를
CSV gzip과 SHA-256 매니페스트로 S3에 저장한다. 사용자 이름·전화번호·사번·개별 출동 ID는 쿼리에서
처음부터 제외한다. 객체는 KMS로 암호화되고 S3 버킷은 퍼블릭 접근을 차단한다.

필수 환경변수는 `DATABASE_URL`, `DB_PASSWORD`, `EXPORT_BUCKET`, `EXPORT_KMS_KEY_ID`다.
Terraform의 예약 작업은 기본적으로 비활성화되어 있으며 `enable_data_exports = true`로 명시해야 실행된다.
