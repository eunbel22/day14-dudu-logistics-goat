// ============================================================
// 두두택배 공통 JS
// index.html(접수 키오스크)와 receipt.html(영수증 조회) 둘 다에서
// <script src="common.js">로 불러 쓴다. 이 파일 하나만 고치면
// Supabase 설정과 계산 규정이 두 페이지 모두에 반영된다.
// ============================================================

// ------------------------------------------------------------
// Supabase 초기화
//
// 여기에 실제 Project URL / anon public key를 문자열로 직접 넣는다.
// (process.env는 브라우저에서 동작하지 않는다 - Node 전용)
// anon key는 원래 클라이언트에 노출되는 게 정상 설계다(RLS로 막는 값).
// 비워두면 Supabase 없이 이 브라우저 세션 안에서만 동작하는
// 로컬 폴백 모드로 자동 전환된다. 단, receipt.html의 링크 공유는
// 여러 사람이 같은 데이터를 봐야 하므로 Supabase가 연결돼 있어야
// 실제로 동작한다 (로컬 폴백은 이 브라우저 안에서만 유효).
// ------------------------------------------------------------
const SUPABASE_URL = '';       // 예: 'https://xxxxxxxx.supabase.co'
const SUPABASE_ANON_KEY = '';  // 예: 'eyJhbGciOi...'

const supabaseClient = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ------------------------------------------------------------
// 계산 정본 - 02_접수규정.md §1-9
// ------------------------------------------------------------
const BRANCHES = [
  { code: '11', name: '서울지점' }, { code: '12', name: '용산지점' },
  { code: '21', name: '대전지점' }, { code: '31', name: '진주지점' },
  { code: '32', name: '거제지점' }, { code: '41', name: '울산지점' },
];

const RATE_TABLE = [
  { grade: '극소형', maxSum: 60,  maxWeight: 2,  price: { 일반: 3500, 제주: 6500,  도서산간: 8500 } },
  { grade: '소형',   maxSum: 80,  maxWeight: 5,  price: { 일반: 4000, 제주: 7000,  도서산간: 9000 } },
  { grade: '중형',   maxSum: 120, maxWeight: 15, price: { 일반: 6000, 제주: 9000,  도서산간: 11000 } },
  { grade: '대형',   maxSum: 160, maxWeight: 25, price: { 일반: 9000, 제주: 12000, 도서산간: 14000 } },
];
const ETA_BUSINESS_DAYS = { 일반: 1, 제주: 2, 도서산간: 3 };
const ISLAND_AREAS = ['울릉도', '백령도', '흑산도', '거문도', '추자도'];
const NORMAL_AREAS = ['서울', '용산', '대전', '진주', '거제', '울산'];
// 접수 지점과 안 겹치는 그 외 표준 시/도 - receiver_area 칸 정책서 방침
// (자유 텍스트 대신 이 목록에서만 고르게 해서 표기 갈림을 원천 차단)
const OTHER_SIDO_AREAS = [
  '인천광역시', '부산광역시', '대구광역시', '광주광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도',
];

// 자주 접수되는 물품 버튼 (모두 금지목록에 걸리지 않는 안전한 품목만
// 골랐다 - 규정 §5 21개 키워드와 겹치지 않는지 확인함).
const COMMON_ITEMS = ['이불', '책', '화장품', '운동화', '쌀', '전자제품', '의류', '주방용품'];

// 규격 프리셋 - 등급 4종의 상한 근처가 아니라 "이 등급이 확실히
// 나오는" 중간값을 골랐다(세 변의 합・무게 둘 다 상한보다 여유있게).
const SIZE_PRESETS = [
  { label: '극소형 (서류/화장품)', w: 20, h: 15, d: 10, weight: 1 },
  { label: '소형 (신발/책)',       w: 30, h: 25, d: 15, weight: 3 },
  { label: '중형 (이불/쌀 20kg)',  w: 45, h: 35, d: 30, weight: 8 },
  { label: '대형 (가전/가구)',     w: 70, h: 50, d: 35, weight: 20 },
];

function branchCodeOf(name) {
  const hit = BRANCHES.find(b => b.name === name);
  return hit ? hit.code : '00';
}
function determineRegion(area) {
  if (area === '제주') return '제주';
  if (ISLAND_AREAS.includes(area)) return '도서산간';
  return '일반';
}
function determineGrade(sumCm, billedWeightKg) {
  for (const tier of RATE_TABLE) {
    if (sumCm <= tier.maxSum && billedWeightKg <= tier.maxWeight) return tier.grade;
  }
  return null;
}
function gradeTrace(sumCm, billedWeightKg) {
  let matched = null;
  const lines = RATE_TABLE.map(tier => {
    const sumOk = sumCm <= tier.maxSum;
    const wtOk = billedWeightKg <= tier.maxWeight;
    const pass = sumOk && wtOk && !matched;
    if (pass) matched = tier.grade;
    return Object.assign({}, tier, { sumOk, wtOk, pass });
  });
  return { lines, matched };
}
function addBusinessDaysTrace(fromDate, days) {
  const d = new Date(fromDate);
  let added = 0;
  const trace = [];
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    const isWeekend = (dow === 0 || dow === 6);
    if (!isWeekend) added++;
    trace.push({ date: new Date(d), dow, isWeekend, countedAt: isWeekend ? null : added });
  }
  return { finalDate: new Date(d), trace };
}
function pad2(n) { return String(n).padStart(2, '0'); }
function formatDateISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

const BANNED_RULES = [
  { category: '금전',   keyword: '현금' },
  { category: '금전',   keyword: '상품권' },
  { category: '금전',   keyword: '유가증권' },
  { category: '귀중품', keyword: '금' },
  { category: '귀중품', keyword: '은' },
  { category: '귀중품', keyword: '보석' },
  { category: '귀중품', keyword: '시계', condition: '50만원 초과 시' },
  { category: '인화성', keyword: '라이터' },
  { category: '인화성', keyword: '부탄가스' },
  { category: '인화성', keyword: '페인트' },
  { category: '인화성', keyword: '신나' },
  { category: '인화성', keyword: '알코올' },
  { category: '배터리', keyword: '보조배터리' },
  { category: '배터리', keyword: '리튬배터리' },
  { category: '생물',   keyword: '동물' },
  { category: '생물',   keyword: '식물' },
  { category: '온도',   keyword: '냉장' },
  { category: '온도',   keyword: '냉동' },
  { category: '기타',   keyword: '주류' },
  { category: '기타',   keyword: '의약품' },
  { category: '기타',   keyword: '총포' },
  { category: '기타',   keyword: '도검' },
];

// 정책서 4번(어디서 막나) - 금지품목/대형초과는 "기계적 차단 + 운영"
// 두 층을 같이 쓰라고 되어있다. 접수를 막는 것까지는 화면이 하고,
// 그 다음 사람이 받아야 하는 연결선(전화번호)을 메시지에 같이 넣는다.
const CS_PHONE = '1588-1234';          // 금지 품목 문의
const BULKY_DESK_PHONE = '1600-5678';  // 대형화물・특수 택배 전문 창구

function checkBanned(name) {
  const s = (name || '').trim();
  if (!s) return { hardHits: [], softHits: [] };
  const hits = BANNED_RULES.filter(r => s.includes(r.keyword));
  return { hardHits: hits.filter(h => !h.condition), softHits: hits.filter(h => h.condition) };
}

const seqByBranch = {};
const issuedTrackingNos = new Set();
function nextTrackingNo(branchCode) {
  let n = (seqByBranch[branchCode] || 0) + 1;
  let no = branchCode + String(n).padStart(8, '0');
  while (issuedTrackingNos.has(no)) { n += 1; no = branchCode + String(n).padStart(8, '0'); }
  seqByBranch[branchCode] = n;
  issuedTrackingNos.add(no);
  return no;
}
function formatWon(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return n.toLocaleString('ko-KR') + '원';
}
function getNumeric(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const raw = el.value;
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = parseFloat(raw);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

// ------------------------------------------------------------
// 영수증 공유 링크 - 지금 페이지 기준 상대경로로 receipt.html을
// 가리키게 만든다. index.html이 어느 하위 경로에 배포되든
// (예: /day12/index.html) 그대로 옆에 있는 receipt.html을 찾는다.
// ------------------------------------------------------------
function buildReceiptShareUrl(trackingNo) {
  return new URL('receipt.html?no=' + encodeURIComponent(trackingNo), location.href).href;
}

// 공유하기 - 모바일이면 시스템 공유시트(navigator.share), 아니면
// 클립보드 복사로 대체한다. toastElId가 있으면 결과 메시지를 그 안에 띄운다.
async function shareReceiptLink(trackingNo, toastElId) {
  const url = buildReceiptShareUrl(trackingNo);
  const toastEl = toastElId ? document.getElementById(toastElId) : null;
  const showToast = (msg) => { if (toastEl) { toastEl.textContent = msg; setTimeout(() => { toastEl.textContent = ''; }, 4000); } };

  if (navigator.share) {
    try {
      await navigator.share({ title: '두두택배 접수 영수증', text: `운송장번호 ${trackingNo}`, url });
      return;
    } catch (e) {
      // 사용자가 공유창을 취소한 경우도 여기로 오므로 별도 에러 처리 안 함
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('링크가 복사되었습니다: ' + url);
  } catch (e) {
    showToast('복사에 실패했습니다. 링크: ' + url);
  }
}
