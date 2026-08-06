-- spec_ref: 주차나선 SOT §9 D14 개정(한얼 260806 확정 - 두두택배 접수 시스템)
-- Day14 택배 접수 표 - Supabase SQL Editor에 통째로 붙여넣고 Run 한 번.
-- 어제까지 만든 저장소에 그대로 추가합니다. sales 표는 지우지 않습니다.

-- [1] 택배 접수 표
create table if not exists shipments (
  id bigint generated always as identity primary key,
  tracking_no text,              -- 운송장 번호 (겹치지 않게 만드는 것이 오늘의 규칙)
  sender_name text not null,     -- 보내는 분
  receiver_name text not null,   -- 받는 분
  receiver_area text not null,   -- 서울 / 용산 / 대전 / 진주 / 거제 / 울산
  region_type text,              -- 계산 결과: 일반 / 원거리 / 도서
  item_name text not null,       -- 물품명 (금지 품목 검사에 사용)
  weight_kg numeric not null,    -- 실제 무게
  width_cm int not null,
  height_cm int not null,
  depth_cm int not null,
  billed_weight_kg numeric,      -- 계산 결과: 요금 무게
  size_grade text,               -- 계산 결과: 소형 / 중형 / 대형
  price int,                     -- 계산 결과: 요금
  eta_date date,                 -- 계산 결과: 도착 예정일
  status text not null default '접수',
  created_at timestamptz not null default now()
);
alter table shipments enable row level security;

-- [2] 정책: 넣기(insert)와 읽기(select) 둘 다 허용 - 이번 주 배운 두 정책입니다.
drop policy if exists "anon insert" on shipments;
create policy "anon insert" on shipments
  for insert to anon with check (true);
drop policy if exists "anon select" on shipments;
create policy "anon select" on shipments
  for select to anon using (true);

-- [3] 샘플 접수 5건 (표가 비어 있을 때만 들어갑니다)
--     규정대로 계산된 값입니다. 내 계산이 맞는지 대조할 때 씁니다.
insert into shipments (tracking_no, sender_name, receiver_name, receiver_area, region_type,
                       item_name, weight_kg, width_cm, height_cm, depth_cm,
                       billed_weight_kg, size_grade, price, eta_date)
select * from (values
  -- 이불: 실제 3kg인데 부피무게 20kg -> 대형, 일반 9000
  ('1100000001', '김하늘', '이준서', '서울', '일반', '이불',   3.0,  60, 40, 50, 20.0, '대형',  9000, (current_date + 1)),
  -- 책 상자: 실제 12kg > 부피무게 2kg -> 중형(무게 12kg), 일반 6000
  ('1200000002', '박서연', '최민준', '용산', '일반', '책',    12.0,  30, 20, 20, 12.0, '중형',  6000, (current_date + 1)),
  -- 진주는 원거리 -> 소형 6000, 2영업일
  ('3100000003', '정예린', '한도윤', '진주', '원거리', '화장품', 1.5,  20, 15, 10,  1.5, '소형',  6000, (current_date + 2)),
  -- 거제는 도서 -> 중형 10000, 3영업일
  ('3200000004', '오시우', '임하린', '거제', '도서', '운동화',  2.0,  35, 25, 20,  2.9, '중형', 10000, (current_date + 3)),
  -- 세변합 70cm(소형)인데 무게 8kg -> 한 등급 올라 중형, 일반 6000
  ('4100000005', '서지호', '문가은', '울산', '일반', '쌀',      8.0,  30, 20, 20,  8.0, '중형',  6000, (current_date + 1))
) as sample(tracking_no, sender_name, receiver_name, receiver_area, region_type,
            item_name, weight_kg, width_cm, height_cm, depth_cm,
            billed_weight_kg, size_grade, price, eta_date)
where not exists (select 1 from shipments);

-- 참고: 새 칸을 추가할 때는 not null을 붙이지 않습니다.
--   좋은 예: alter table shipments add column memo text;
--   피할 예: alter table shipments add column memo text not null;  <- 빈 값이 오면 넣기가 실패(500)합니다
