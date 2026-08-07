// ============================================================
// receipt.html 전용 JS - 공유 링크(?no=운송장번호)로 들어온 사람에게
// 접수 영수증을 보여준다. common.js의 Supabase 설정/헬퍼에 의존한다.
// ============================================================

function formatAcceptedAt(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${formatDateISO(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function renderNotFound(container, title, desc) {
  container.innerHTML = `<div class="receipt-not-found">
    <div class="big-icon">📭</div>
    <h2 style="margin:0 0 8px;">${title}</h2>
    <p class="step-desc" style="margin:0;">${desc}</p>
    <a class="back-home-btn" href="index.html">접수 화면으로</a>
  </div>`;
}

function renderFound(container, record) {
  container.innerHTML = `<div class="receipt-card">
    <div class="receipt-title">접수 영수증</div>
    <div class="receipt-tno">${record.tracking_no}</div>
    <div class="receipt-line">접수 지점 ${record.branch_name} / 보내는 분 ${record.sender_name}</div>
    <div class="receipt-line">받는 분 ${record.receiver_name} / 도착 지역 ${record.receiver_area}(${record.region_type})</div>
    <div class="receipt-line">물품 ${record.item_name} / 요금 무게 ${record.billed_weight_kg}kg / 등급 ${record.size_grade}</div>
    <div class="receipt-price">${formatWon(record.price)}</div>
    <div class="receipt-eta">도착 예정일 ${record.eta_date}</div>
    <div class="receipt-line" style="margin-top:14px; color:var(--muted); font-size:12px;">접수 시각 ${formatAcceptedAt(record.accepted_at)}</div>
    <div class="share-row">
      <button type="button" class="share-btn" onclick="shareReceiptLink('${record.tracking_no}', 'shareToast')">공유하기</button>
      <a class="share-btn secondary" style="text-decoration:none; display:flex; align-items:center; justify-content:center;" href="index.html">새로 접수하기</a>
    </div>
    <div class="share-toast" id="shareToast"></div>
  </div>`;
}

async function loadReceipt() {
  const container = document.getElementById('receiptContainer');
  const params = new URLSearchParams(location.search);
  const no = (params.get('no') || '').trim();

  if (!no) {
    renderNotFound(container, '운송장번호가 없습니다', '주소 끝에 ?no=운송장번호 형식으로 접속해주세요. 접수 목록 화면에서 운송장번호를 누르면 자동으로 이 형식의 링크로 이동합니다.');
    return;
  }
  if (!supabaseClient) {
    renderNotFound(container, 'Supabase가 연결되어 있지 않습니다', '이 페이지는 실제 배포된 Supabase 프로젝트에 연결돼 있어야 조회할 수 있습니다. common.js의 SUPABASE_URL / SUPABASE_ANON_KEY를 채워주세요.');
    return;
  }

  const { data, error } = await supabaseClient
    .from('shipments')
    .select('*')
    .eq('tracking_no', no)
    .maybeSingle();

  if (error) {
    renderNotFound(container, '조회 중 오류가 발생했습니다', error.message);
    return;
  }
  if (!data) {
    renderNotFound(container, '운송장을 찾을 수 없습니다', `"${no}" 번호로 접수된 내역이 없습니다. 운송장번호를 다시 확인해주세요.`);
    return;
  }
  renderFound(container, data);
}

loadReceipt();
