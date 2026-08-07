// ============================================================
// admin.html 전용 JS
// common.js의 Supabase 설정/계산 로직에 의존한다.
//
// 보안 관련 중요 사실 - 아래 ADMIN_PASSCODE는 "아무나 실수로
// 들어오는 것"을 막는 정도지, 진짜 접근 통제가 아니다. 지금 RLS
// 정책(anon_select_shipments)이 SELECT를 anon 역할에게 전부 열어놨기
// 때문에, 이 코드를 몰라도 브라우저 콘솔에서 Supabase 클라이언트로
// 직접 조회하면 같은 데이터를 볼 수 있다. 진짜 관리자 전용으로
// 만들려면 Supabase Auth로 로그인을 붙이고 RLS를 authenticated
// 역할 + 직원 여부 체크로 좁혀야 한다.
// ============================================================
const ADMIN_PASSCODE = '0000'; // 데모용 - 실제 배포 전 반드시 바꿀 것
const ADMIN_SESSION_KEY = 'dodoo_admin_authed';

function checkPasscode() {
  const input = document.getElementById('gatePasscodeInput');
  const errEl = document.getElementById('gateError');
  if (input.value.trim() === ADMIN_PASSCODE) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    showAdminPanel();
  } else {
    errEl.textContent = '접근 코드가 올바르지 않습니다.';
    input.value = '';
    input.focus();
  }
}

function showAdminPanel() {
  document.getElementById('adminGate').hidden = true;
  document.getElementById('adminPanel').hidden = false;
  loadData();
}

function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  location.reload();
}

// ------------------------------------------------------------
// 필터 상태
// ------------------------------------------------------------
const filterState = { branch: '', period: 'today', search: '' };

function renderBranchFilterOptions() {
  const select = document.getElementById('branchFilterSelect');
  select.innerHTML = '<option value="">전체 지점</option>' +
    BRANCHES.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
}

function renderPeriodChips() {
  const periods = [
    { key: 'today', label: '오늘' },
    { key: '7days', label: '최근 7일' },
    { key: 'all', label: '전체' },
  ];
  document.getElementById('periodChips').innerHTML = periods.map(p => `
    <button type="button" class="filter-chip ${filterState.period === p.key ? 'selected' : ''}" onclick="setPeriod('${p.key}')">${p.label}</button>
  `).join('');
}
function setPeriod(key) {
  filterState.period = key;
  renderPeriodChips();
  loadData();
}
function onBranchFilterChange() {
  filterState.branch = document.getElementById('branchFilterSelect').value;
  loadData();
}
function onSearchInput() {
  filterState.search = document.getElementById('searchInput').value.trim();
  loadData();
}

function periodStartDate() {
  const now = new Date();
  if (filterState.period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (filterState.period === '7days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  return null; // 전체
}

// ------------------------------------------------------------
// 데이터 로드
// ------------------------------------------------------------
let currentRows = [];

async function loadData() {
  const tbody = document.getElementById('adminTableBody');

  if (!supabaseClient) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="12">Supabase가 연결되어 있지 않아 관리자 조회를 할 수 없습니다.</td></tr>';
    renderStats([]);
    return;
  }

  let query = supabaseClient.from('shipments').select('*').order('accepted_at', { ascending: false }).limit(500);

  if (filterState.branch) query = query.eq('branch_name', filterState.branch);
  const start = periodStartDate();
  if (start) query = query.gte('accepted_at', start);
  if (filterState.search) {
    const s = filterState.search.replace(/[%,]/g, '');
    query = query.or(`tracking_no.ilike.%${s}%,sender_name.ilike.%${s}%,receiver_name.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('관리자 조회 실패:', error);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">조회 실패: ${error.message}</td></tr>`;
    renderStats([]);
    return;
  }

  currentRows = data || [];
  renderStats(currentRows);
  renderTable(currentRows);
}

function renderStats(rows) {
  const totalCount = rows.length;
  const totalPrice = rows.reduce((sum, r) => sum + (r.price || 0), 0);
  const gradeCounts = {};
  rows.forEach(r => { if (r.size_grade) gradeCounts[r.size_grade] = (gradeCounts[r.size_grade] || 0) + 1; });
  const topGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0];
  const bulkyAreaCount = rows.filter(r => r.region_type === '제주' || r.region_type === '도서산간').length;

  document.getElementById('statCards').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">접수 건수</div>
      <div class="stat-value">${totalCount.toLocaleString('ko-KR')}건</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">합계 요금</div>
      <div class="stat-value">${formatWon(totalPrice)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">가장 많은 등급</div>
      <div class="stat-value">${topGrade ? topGrade[0] : '-'}</div>
      <div class="stat-sub">${topGrade ? topGrade[1] + '건' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">제주・도서산간</div>
      <div class="stat-value">${bulkyAreaCount}건</div>
      <div class="stat-sub">배송 지연 가능 권역</div>
    </div>
  `;
}

function renderTable(rows) {
  const tbody = document.getElementById('adminTableBody');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="12">조건에 맞는 접수 내역이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><a href="receipt.html?no=${encodeURIComponent(r.tracking_no)}" target="_blank">${r.tracking_no}</a></td>
      <td>${r.branch_name}</td>
      <td>${formatAcceptedAtShort(r.accepted_at)}</td>
      <td>${r.sender_name}</td>
      <td>${r.receiver_name}</td>
      <td>${r.receiver_area}</td>
      <td>${r.region_type || '-'}</td>
      <td>${r.item_name}</td>
      <td>${r.billed_weight_kg != null ? r.billed_weight_kg + 'kg' : '-'}</td>
      <td><span class="grade-pill">${r.size_grade || '-'}</span></td>
      <td>${formatWon(r.price)}</td>
      <td>${r.eta_date || '-'}</td>
    </tr>
  `).join('');
}

function formatAcceptedAtShort(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${formatDateISO(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ------------------------------------------------------------
// CSV 다운로드 - 지금 화면에 걸려있는 필터 결과 그대로 내보낸다
// ------------------------------------------------------------
function exportCSV() {
  if (currentRows.length === 0) { alert('내보낼 데이터가 없습니다.'); return; }
  const headers = ['운송장번호', '지점', '접수시각', '보내는분', '받는분', '도착지역', '권역', '물품', '요금무게(kg)', '등급', '요금', '도착예정일'];
  const lines = [headers.join(',')];
  currentRows.forEach(r => {
    const row = [
      r.tracking_no, r.branch_name, formatAcceptedAtShort(r.accepted_at),
      r.sender_name, r.receiver_name, r.receiver_area, r.region_type || '',
      r.item_name, r.billed_weight_kg ?? '', r.size_grade || '', r.price ?? '', r.eta_date || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(row.join(','));
  });
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `두두택배_접수내역_${formatDateISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------
// 초기화 - 이 탭 세션에서 이미 통과했으면 코드 입력 화면을 건너뛴다
// ------------------------------------------------------------
renderBranchFilterOptions();
renderPeriodChips();
if (sessionStorage.getItem(ADMIN_SESSION_KEY) === '1') {
  showAdminPanel();
} else {
  document.getElementById('gatePasscodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkPasscode();
  });
}
