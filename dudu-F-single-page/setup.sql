-- ============================================================
-- 두두택배 shipments 테이블 - F 버전 단계별 키오스크용
-- ============================================================

-- 권역 유형
CREATE TYPE region_type AS ENUM ('일반', '제주', '도서산간');

-- 등급 유형
CREATE TYPE size_grade AS ENUM ('극소형', '소형', '중형', '대형');

-- 접수 테이블
CREATE TABLE shipments (
  id BIGSERIAL PRIMARY KEY,

  -- 운송장
  tracking_no CHAR(10) NOT NULL UNIQUE,
  branch_name TEXT NOT NULL,

  -- 사람 정보
  sender_name TEXT NOT NULL,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT,

  -- 물품
  item_name TEXT NOT NULL,
  receiver_area TEXT NOT NULL,
  region_type region_type,

  -- 치수와 무게
  weight_kg NUMERIC(6,2),
  width_cm NUMERIC(6,1),
  height_cm NUMERIC(6,1),
  depth_cm NUMERIC(6,1),
  billed_weight_kg NUMERIC(6,2),

  -- 요금
  size_grade size_grade,
  price INTEGER,
  eta_date DATE,

  -- 타임스탬프
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_shipments_created_at ON shipments (created_at);
CREATE INDEX idx_shipments_tracking_no ON shipments (tracking_no);
CREATE INDEX idx_shipments_branch_name ON shipments (branch_name);

-- RLS 활성화
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Allow public read shipments" ON shipments
  FOR SELECT USING (true);

-- 모든 사용자가 작성 가능
CREATE POLICY "Allow public insert shipments" ON shipments
  FOR INSERT WITH CHECK (true);
