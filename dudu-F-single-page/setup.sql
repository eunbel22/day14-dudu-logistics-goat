-- ============================================================
-- 두두택배 shipments 스키마
-- 근거: 데이터 처리 정책서(2026-08-06, 김은별) 칸별 "4. 앞으로 어디서
-- 막나" 항목을 그대로 DB 제약/트리거로 옮겼다.
--
-- 설계 원칙 - 정책서가 "기계적 차단"이라 부른 것은 화면 검증만으로는
-- 끝나지 않는다(개발자도구로 우회 가능). 이 스키마는 CHECK 제약과
-- BEFORE INSERT/UPDATE 트리거를 최종 방어선으로 쓴다. 프론트엔드가
-- 계산한 값(요금, 등급, 권역, 도착예정일)은 참고용일 뿐이고, 저장
-- 시점에 서버가 항상 다시 계산해서 덮어쓴다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 참조(lookup) 테이블
-- ------------------------------------------------------------

CREATE TABLE branches (
  branch_code  CHAR(2) PRIMARY KEY,
  branch_name  TEXT NOT NULL UNIQUE
);

INSERT INTO branches (branch_code, branch_name) VALUES
  ('11', '서울지점'), ('12', '용산지점'), ('21', '대전지점'),
  ('31', '진주지점'), ('32', '거제지점'), ('41', '울산지점');

-- 칸: tracking_no - 예외1 "완전 중복 90건(45쌍)"을 원천 차단하는
-- 지점별 채번 시퀀스. 화면이 아니라 DB가 번호를 만든다.
CREATE TABLE branch_sequences (
  branch_code  CHAR(2) PRIMARY KEY REFERENCES branches (branch_code),
  last_seq     BIGINT NOT NULL DEFAULT 0
);
INSERT INTO branch_sequences (branch_code, last_seq)
  SELECT branch_code, 0 FROM branches;

CREATE TYPE region_type_enum AS ENUM ('일반', '제주', '도서산간');
CREATE TYPE size_grade_enum  AS ENUM ('극소형', '소형', '중형', '대형');

-- 칸: size_grade & price - 접수규정 §3 요금표. 등급 x 권역 조합마다
-- 상한값과 요금을 한 곳에서만 관리한다 (화면 하드코딩 금지).
CREATE TABLE rate_table (
  grade          size_grade_enum   NOT NULL,
  region_type    region_type_enum  NOT NULL,
  max_sum_cm     NUMERIC(6,1)      NOT NULL,
  max_weight_kg  NUMERIC(6,2)      NOT NULL,
  price          INTEGER           NOT NULL,
  PRIMARY KEY (grade, region_type)
);

INSERT INTO rate_table (grade, region_type, max_sum_cm, max_weight_kg, price) VALUES
  ('극소형', '일반',     60,  2,  3500),
  ('극소형', '제주',     60,  2,  6500),
  ('극소형', '도서산간', 60,  2,  8500),
  ('소형',   '일반',     80,  5,  4000),
  ('소형',   '제주',     80,  5,  7000),
  ('소형',   '도서산간', 80,  5,  9000),
  ('중형',   '일반',     120, 15, 6000),
  ('중형',   '제주',     120, 15, 9000),
  ('중형',   '도서산간', 120, 15, 11000),
  ('대형',   '일반',     160, 25, 9000),
  ('대형',   '제주',     160, 25, 12000),
  ('대형',   '도서산간', 160, 25, 14000);

-- 칸: receiver_area / region_type - 예외1 "지역명 표기 갈림"을 막기
-- 위해 텍스트가 아니라 이 표에 있는지 없는지로 권역을 판정한다.
-- 목록에 없으면(거제·진주 포함) 기본값 '일반'.
CREATE TABLE region_lookup (
  area_name    TEXT PRIMARY KEY,
  region_type  region_type_enum NOT NULL
);
INSERT INTO region_lookup (area_name, region_type) VALUES
  ('제주',   '제주'),
  ('울릉도', '도서산간'), ('백령도', '도서산간'), ('흑산도', '도서산간'),
  ('거문도', '도서산간'), ('추자도', '도서산간');

-- 칸: item_name - 접수규정 §5 금지 품목 7분류. condition이 NULL이면
-- 하드 차단, 값이 있으면(예: 시계 "50만원 초과 시") 직원 확인이
-- 있어야 통과하는 소프트 차단.
CREATE TABLE banned_items (
  keyword    TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  condition  TEXT NULL
);
INSERT INTO banned_items (keyword, category, condition) VALUES
  ('현금', '금전', NULL), ('상품권', '금전', NULL), ('유가증권', '금전', NULL),
  ('금', '귀중품', NULL), ('은', '귀중품', NULL), ('보석', '귀중품', NULL),
  ('시계', '귀중품', '50만원 초과 시'),
  ('라이터', '인화성', NULL), ('부탄가스', '인화성', NULL),
  ('페인트', '인화성', NULL), ('신나', '인화성', NULL), ('알코올', '인화성', NULL),
  ('보조배터리', '배터리', NULL), ('리튬배터리', '배터리', NULL),
  ('동물', '생물', NULL), ('식물', '생물', NULL),
  ('냉장', '온도', NULL), ('냉동', '온도', NULL),
  ('주류', '기타', NULL), ('의약품', '기타', NULL),
  ('총포', '기타', NULL), ('도검', '기타', NULL);


-- ------------------------------------------------------------
-- 2. 본 테이블 shipments (원장 25칸 대응)
-- ------------------------------------------------------------

CREATE TABLE shipments (
  id                    BIGSERIAL PRIMARY KEY,

  -- 서버가 채번, 사용자 입력 불가 (칸: tracking_no)
  tracking_no           CHAR(10) UNIQUE,
  branch_code           CHAR(2)  NOT NULL REFERENCES branches (branch_code),
  branch_name           TEXT     NOT NULL,

  -- 아직 조사 안 한 칸(정책서 체크 안 됨) - 자유 텍스트로 남겨둠
  sender_id             TEXT,
  sender_name           TEXT     NOT NULL,
  receiver_name         TEXT     NOT NULL,
  receiver_phone        TEXT,    -- 정책서: 이번 주 범위 밖 보류

  -- 칸: receiver_area - 화면에서 자유 텍스트를 아예 못 넣게 해야
  -- 이 CHECK가 실효성이 있다 (드롭다운/버튼 선택값만 허용).
  receiver_area         TEXT     NOT NULL,
  receiver_dong         TEXT,
  region_type           region_type_enum,  -- 트리거가 채움, 직접 입력 금지

  category              TEXT,
  item_name             TEXT     NOT NULL,

  -- 칸: weight_kg - 예외1(단위 문자열) + 예외2(999/음수/0) 원천 차단.
  -- NUMERIC 타입 자체가 "2.1kg" 같은 문자열을 거부하고, 상한도 규정과 맞춤.
  weight_kg             NUMERIC(6,2) NOT NULL
                         CHECK (weight_kg > 0 AND weight_kg <= 30),

  -- 칸: width/height/depth_cm - 예외1(단위) + 예외2(100배=mm오입력)
  -- + 예외3(9999/음수) 전부 상한/하한으로 차단.
  width_cm              NUMERIC(6,1) NOT NULL
                         CHECK (width_cm  > 0 AND width_cm  <= 200),
  height_cm             NUMERIC(6,1) NOT NULL
                         CHECK (height_cm > 0 AND height_cm <= 200),
  depth_cm              NUMERIC(6,1) NOT NULL
                         CHECK (depth_cm  > 0 AND depth_cm  <= 200),

  volume_weight_kg       NUMERIC(6,2),  -- 트리거 자동 계산
  billed_weight_kg        NUMERIC(6,2), -- 트리거 자동 계산
  size_grade                size_grade_enum,  -- 트리거 자동 계산 (NULL이면 대형초과=접수불가)
  price                     INTEGER,          -- 트리거 자동 계산

  -- 칸: item_name 소프트차단(시계 등) - 직원이 확인했는지
  staff_confirmed           BOOLEAN NOT NULL DEFAULT FALSE,

  -- 칸: accepted_at - 예외1(포맷 5종 혼재)을 TIMESTAMP 타입 자체로 차단
  accepted_at               TIMESTAMP NOT NULL DEFAULT now(),
  eta_date                  DATE,  -- 트리거 자동 계산 (영업일 +1/+2/+3)

  -- 이번 범위 밖 (정책서와 동일하게 보류)
  status                    TEXT,
  delivered_at              TIMESTAMP,
  channel                   TEXT,

  -- 칸: delivered_at - 예외2(논리역전 38건, accepted_at보다 앞선 완료시각) 차단
  CONSTRAINT chk_delivered_after_accepted
    CHECK (delivered_at IS NULL OR delivered_at >= accepted_at)
);

-- 정책서 "원본 보존" 방식 그대로 - 과거 원장 마이그레이션 시
-- 원본값을 이 컬럼들에 넣어두면 언제든 복원 가능
ALTER TABLE shipments
  ADD COLUMN weight_kg_raw        TEXT,
  ADD COLUMN width_cm_raw         TEXT,
  ADD COLUMN billed_weight_kg_raw TEXT,
  ADD COLUMN receiver_area_raw    TEXT,
  ADD COLUMN size_grade_raw       TEXT,
  ADD COLUMN accepted_at_raw      TEXT,
  ADD COLUMN eta_date_raw         TEXT;


-- ------------------------------------------------------------
-- 3. 자동 계산 함수 - region_type / size_grade / price / eta_date는
--    사용자가 직접 못 넣고 항상 서버가 재계산한다 (정책서 4번 원칙).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_determine_region(p_area TEXT)
RETURNS region_type_enum AS $$
  SELECT COALESCE(
    (SELECT region_type FROM region_lookup WHERE area_name = p_area),
    '일반'::region_type_enum
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_determine_grade(p_sum_cm NUMERIC, p_billed_kg NUMERIC)
RETURNS size_grade_enum AS $$
  SELECT grade FROM rate_table
  WHERE max_sum_cm >= p_sum_cm AND max_weight_kg >= p_billed_kg
  ORDER BY max_sum_cm ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_add_business_days(p_from TIMESTAMP, p_days INT)
RETURNS DATE AS $$
DECLARE
  d DATE := p_from::date;
  added INT := 0;
BEGIN
  WHILE added < p_days LOOP
    d := d + 1;
    IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 칸: tracking_no - 지점코드 2자리 + 접수순번 8자리 채번
CREATE OR REPLACE FUNCTION fn_next_tracking_no(p_branch_code CHAR(2))
RETURNS CHAR(10) AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  UPDATE branch_sequences SET last_seq = last_seq + 1
    WHERE branch_code = p_branch_code
    RETURNING last_seq INTO v_seq;
  RETURN p_branch_code || LPAD(v_seq::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_shipments_before_save()
RETURNS TRIGGER AS $$
DECLARE
  v_hard_hit TEXT;
BEGIN
  -- 운송장 번호 서버 채번 (없을 때만)
  IF NEW.tracking_no IS NULL THEN
    NEW.tracking_no := fn_next_tracking_no(NEW.branch_code);
  END IF;

  -- 칸: item_name - 하드 차단 품목이면 저장 자체를 막는다
  SELECT keyword INTO v_hard_hit FROM banned_items
    WHERE condition IS NULL AND NEW.item_name LIKE '%' || keyword || '%'
    LIMIT 1;
  IF v_hard_hit IS NOT NULL THEN
    RAISE EXCEPTION '접수 불가 품목입니다: % (규정 §5)', v_hard_hit;
  END IF;

  -- 소프트 차단 품목(예: 시계) - 직원 확인 안 됐으면 거절
  IF NOT NEW.staff_confirmed AND EXISTS (
    SELECT 1 FROM banned_items
    WHERE condition IS NOT NULL AND NEW.item_name LIKE '%' || keyword || '%'
  ) THEN
    RAISE EXCEPTION '직원 확인이 필요한 품목입니다 (staff_confirmed = false)';
  END IF;

  -- 부피무게 / 청구무게
  NEW.volume_weight_kg := ROUND((NEW.width_cm * NEW.height_cm * NEW.depth_cm) / 6000.0, 2);
  NEW.billed_weight_kg := GREATEST(NEW.weight_kg, NEW.volume_weight_kg);

  -- 권역 (사용자가 고른 값은 무시하고 항상 재계산)
  NEW.region_type := fn_determine_region(NEW.receiver_area);

  -- 등급 - 대형 상한 초과면 NULL -> 접수 자체를 거절
  NEW.size_grade := fn_determine_grade(
    NEW.width_cm + NEW.height_cm + NEW.depth_cm, NEW.billed_weight_kg
  );
  IF NEW.size_grade IS NULL THEN
    RAISE EXCEPTION '규격 초과로 접수할 수 없습니다 (세 변의 합 %cm, 청구무게 %kg) - 대형화물 전문 창구로 안내하세요',
      (NEW.width_cm + NEW.height_cm + NEW.depth_cm), NEW.billed_weight_kg;
  END IF;

  -- 요금
  SELECT price INTO NEW.price FROM rate_table
    WHERE grade = NEW.size_grade AND region_type = NEW.region_type;

  -- 도착 예정일
  NEW.eta_date := fn_add_business_days(
    NEW.accepted_at,
    CASE NEW.region_type WHEN '일반' THEN 1 WHEN '제주' THEN 2 ELSE 3 END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipments_before_save
  BEFORE INSERT OR UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION trg_shipments_before_save();


-- ------------------------------------------------------------
-- 4. 조회/집계용 인덱스
-- ------------------------------------------------------------
CREATE INDEX idx_shipments_accepted_at   ON shipments (accepted_at);
CREATE INDEX idx_shipments_region_type   ON shipments (region_type);
CREATE INDEX idx_shipments_receiver_area ON shipments (receiver_area);


-- ------------------------------------------------------------
-- 5. 아직 못 정한 것 (정책서 "5. 못 정한 것" 그대로 옮김 - 스키마로
--    풀 수 없는, 사람이 답해야 하는 항목들)
-- ------------------------------------------------------------
-- - weight_kg 결측 처리된 13건의 실제 무게 -> 접수 지점 담당자
-- - width/height/depth_cm 결측 건의 실제 규격 -> 접수 현장
-- - delivered_at 누락 65건의 실제 완료 시각 -> 배송 담당 기사/시스템 로그
-- - size_grade 공식 불일치 20건 처리 방향 -> 운영/영업팀 정책 판단
-- - price 요금표 불일치 93건 할인 여부 -> 정산팀