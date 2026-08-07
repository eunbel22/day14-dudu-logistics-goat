// ============================================================
// 두두택배 접수 키오스크 (index.html 전용)
// common.js의 계산 로직/Supabase 설정에 의존한다. 이 파일 단독으로는
// 동작하지 않으니 index.html에서 common.js -> kiosk.js 순서로 불러야 한다.
// ============================================================

// ------------------------------------------------------------
// 선택 상태 (버튼 칩으로 고르는 값들은 hidden input 대신 state로 관리)
// ------------------------------------------------------------
const state = { branch: '', itemName: '', receiverArea: '' };

// ---------- 최상단 탭 (접수하기 / 접수 목록) ----------
function setMainTab(which) {
  document.getElementById('mainPanelReceive').hidden = which !== 'receive';
  document.getElementById('mainPanelList').hidden = which !== 'list';
  document.getElementById('mainTabReceiveBtn').classList.toggle('active', which === 'receive');
  document.getElementById('mainTabListBtn').classList.toggle('active', which === 'list');
  if (which === 'list') renderList();
}

// ---------- 단계(스텝) 정의 ----------
const STEPS = [
  { label: '지점' }, { label: '정보' }, { label: '물품' }, { label: '크기/무게' }, { label: '도착지' }, { label: '확인' },
];
let currentStep = 0;

function renderStepTabs() {
  const el = document.getElementById('stepTabs');
  el.innerHTML = STEPS.map((s, i) => {
    const cls = ['step-tab'];
    if (i === currentStep) cls.push('active');
    else if (i < currentStep) cls.push('done');
    return `<button type="button" class="${cls.join(' ')}" onclick="goToStep(${i})">
      <span class="num">${i + 1}</span>${s.label}
    </button>`;
  }).join('');
}

function goToStep(idx) {
  if (idx < 0 || idx >= STEPS.length) return;
  currentStep = idx;
  document.querySelectorAll('.step-page').forEach(p => {
    p.hidden = Number(p.dataset.step) !== currentStep;
  });
  renderStepTabs();
  document.getElementById('prevBtn').disabled = currentStep === 0;
  document.getElementById('prevBtn').hidden = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;
  document.getElementById('nextBtn').hidden = isLast;
  document.getElementById('submitBtn').hidden = !isLast;
  // 계산 패널은 확인 단계에서만 옆에 펼친다 - 그 전 단계는 입력
  // 화면 하나만 꽉 차게 보여줘서 화면이 늘 붐비는 느낌을 줄인다.
  document.getElementById('mainLayout').classList.toggle('show-calc', isLast);
  if (isLast) renderSummary();
  recalc();
}

// ---------- STEP 0: 지점 칩 ----------
function renderBranchChips() {
  const el = document.getElementById('branchChips');
  el.innerHTML = BRANCHES.map(b => `
    <button type="button" class="chip ${state.branch === b.name ? 'selected' : ''}" onclick="selectBranch('${b.name}')">${b.name}</button>
  `).join('');
}
function selectBranch(name) {
  state.branch = name;
  renderBranchChips();
  recalc();
}

// ---------- STEP 2: 물품명 칩 ----------
function renderItemChips() {
  const el = document.getElementById('itemChips');
  el.innerHTML = COMMON_ITEMS.map(name => `
    <button type="button" class="chip ${state.itemName === name ? 'selected' : ''}" onclick="selectItem('${name}')">${name}</button>
  `).join('');
}
function selectItem(name) {
  state.itemName = name;
  document.getElementById('itemCustomField').hidden = true;
  document.getElementById('itemName') && (document.getElementById('itemName').value = '');
  renderItemChips();
  recalc();
}
function toggleItemCustom() {
  const field = document.getElementById('itemCustomField');
  field.hidden = !field.hidden;
  if (!field.hidden) {
    state.itemName = document.getElementById('itemName').value.trim();
    document.getElementById('itemName').focus();
    renderItemChips();
  }
  recalc();
}
function onItemCustomInput() {
  state.itemName = document.getElementById('itemName').value.trim();
  renderItemChips();
  recalc();
}

// ---------- STEP 3: 규격 프리셋 ----------
function renderSizePresetChips() {
  const el = document.getElementById('sizePresetChips');
  el.innerHTML = SIZE_PRESETS.map((p, i) => `
    <button type="button" class="chip chip-sm" onclick="applySizePreset(${i})">${p.label}</button>
  `).join('');
}
function applySizePreset(i) {
  const p = SIZE_PRESETS[i];
  document.getElementById('widthCm').value = p.w;
  document.getElementById('heightCm').value = p.h;
  document.getElementById('depthCm').value = p.d;
  document.getElementById('weightKg').value = p.weight;
  recalc();
}

// ---------- STEP 4: 도착지역 칩 + 표준 시/도 드롭다운 ----------
function renderAreaChips() {
  document.getElementById('areaChipsNormal').innerHTML = NORMAL_AREAS.map(a => `
    <button type="button" class="chip ${state.receiverArea === a ? 'selected' : ''}" onclick="selectArea('${a}')">${a}</button>
  `).join('');
  document.getElementById('areaChipsJeju').innerHTML = `
    <button type="button" class="chip ${state.receiverArea === '제주' ? 'selected' : ''}" onclick="selectArea('제주')">제주</button>`;
  document.getElementById('areaChipsIsland').innerHTML = ISLAND_AREAS.map(a => `
    <button type="button" class="chip ${state.receiverArea === a ? 'selected' : ''}" onclick="selectArea('${a}')">${a}</button>
  `).join('');
  const select = document.getElementById('areaSelect');
  if (select) {
    const isOtherSido = OTHER_SIDO_AREAS.includes(state.receiverArea);
    select.innerHTML = `<option value="">선택하세요</option>` + OTHER_SIDO_AREAS.map(a =>
      `<option value="${a}" ${state.receiverArea === a ? 'selected' : ''}>${a}</option>`
    ).join('');
    if (!isOtherSido) select.value = '';
  }
}
function selectArea(name) {
  state.receiverArea = name;
  renderAreaChips();
  recalc();
}
function onAreaSelectChange() {
  const value = document.getElementById('areaSelect').value;
  if (value) selectArea(value);
}

// ============================================================
// 렌더링 (계산 패널)
// ============================================================
function renderBannedWarning(ban) {
  const el = document.getElementById('bannedWarning');
  const box = document.getElementById('softConfirmBox');
  if (ban.hardHits.length > 0) {
    const h = ban.hardHits[0];
    el.innerHTML = `<span class="badge bad">접수 불가 품목입니다 - ${h.category} "${h.keyword}"(규정 §5). 요금 계산 전에 거절합니다.<br>문의가 필요하면 고객센터 ${CS_PHONE}로 연락하세요.</span>`;
    box.hidden = true;
  } else if (ban.softHits.length > 0) {
    const h = ban.softHits[0];
    el.innerHTML = `<span class="badge warn">"${h.keyword}"는 ${h.condition} 금지 품목입니다(규정 §5). 가격을 확인할 수 없어 직원 확인이 필요합니다.</span>`;
    box.hidden = false;
    document.getElementById('softConfirmText').textContent =
      `"${h.keyword}" - ${h.condition} 금지 품목(규정 §5 귀중품). 50만원 이하임을 확인했으면 아래에 체크하세요.`;
  } else {
    el.innerHTML = '';
    box.hidden = true;
  }
}
function step(no, title, body) {
  return `<div class="calc-step"><div class="calc-step-title">${no}. ${title}</div><div class="calc-step-body">${body}</div></div>`;
}
function renderRateTable(matchedGrade, matchedRegion) {
  const tbody = document.querySelector('#rateTable tbody');
  tbody.innerHTML = RATE_TABLE.map(tier => {
    const isGradeMatch = tier.grade === matchedGrade;
    function cell(region) {
      const hit = isGradeMatch && matchedRegion === region;
      return `<td class="${hit ? 'cell-match' : ''}">${tier.price[region].toLocaleString('ko-KR')}원</td>`;
    }
    return `<tr class="${isGradeMatch ? 'grade-match' : ''}"><td>${tier.grade}</td><td>${tier.maxSum}cm 이하 / ${tier.maxWeight}kg 이하</td>${cell('일반')}${cell('제주')}${cell('도서산간')}</tr>`;
  }).join('');
}
function renderCalcPending() {
  document.getElementById('calcSteps').innerHTML = '<div class="calc-pending">무게・가로・세로・높이를 모두 입력하면 계산 과정이 여기 순서대로 표시됩니다.</div>';
  renderRateTable(null, null);
}
function renderCalcBannedStop(itemName, hit) {
  document.getElementById('calcSteps').innerHTML = `<div class="calc-step reject">
    <div class="calc-step-title">1. 금지 품목 확인 (규정 §8-1) - 여기서 중단</div>
    <div class="calc-step-body">물품명 "${itemName}" -> ${hit.category} 분류 "${hit.keyword}"에 걸림 (규정 §5).
    요금 계산 전에 거절합니다. 부피 무게・등급・요금은 계산하지 않습니다.<br>
    고객이 항의하거나 문의하면 고객센터 <b>${CS_PHONE}</b>로 연결하세요.</div></div>`;
  renderRateTable(null, null);
}
function renderCalcSteps(weight, width, height, depth, area) {
  const volumeWeightKg = (width * height * depth) / 6000;
  const billedWeightKg = Math.max(weight, volumeWeightKg);
  const sumCm = width + height + depth;
  const gt = gradeTrace(sumCm, billedWeightKg);

  let html = '';
  html += step('1', '부피 무게 계산 (규정 §4)', `가로${width} x 세로${height} x 높이${depth} / 6000 = <b>${volumeWeightKg.toFixed(2)}kg</b>`);
  html += step('2', '요금 무게 (규정 §4)', `실제 무게 ${weight}kg 과 부피 무게 ${volumeWeightKg.toFixed(2)}kg 중 큰 값 = <b>${billedWeightKg.toFixed(2)}kg</b>`);
  html += step('3', '세 변의 합 (규정 §3)', `${width} + ${height} + ${depth} = <b>${sumCm}cm</b>`);

  const gradeDetail = gt.lines.map(l => {
    const mark = l.pass ? '통과 -> 이 등급 채택'
      : (!l.sumOk && !l.wtOk ? '세변합・무게 둘 다 기준 초과' : (!l.sumOk ? '세변합 기준 초과' : '무게 기준 초과'));
    return `${l.grade}(세변합 ${l.maxSum}cm 이하 / 무게 ${l.maxWeight}kg 이하): ${mark}`;
  }).join('<br>');
  html += step('4', '크기 등급 판정 (규정 §3, §8-4)', gradeDetail);

  if (!gt.matched) {
    html += `<div class="calc-step reject"><div class="calc-step-title">접수 불가 (규정 §3, §8-5)</div>
      <div class="calc-step-body">대형 상한(세 변의 합 160cm 또는 요금 무게 25kg)을 넘었습니다.
      지금 값 - 세 변의 합 ${sumCm}cm, 요금 무게 ${billedWeightKg.toFixed(2)}kg.<br>
      일반 택배로는 접수할 수 없습니다 - <b>대형화물 전문 창구 ${BULKY_DESK_PHONE}</b>로 안내하세요.</div></div>`;
    document.getElementById('calcSteps').innerHTML = html;
    renderRateTable(null, null);
    return;
  }

  if (!area) {
    html += `<div class="calc-step pending-note"><div class="calc-step-title">5. 권역 판정 (규정 §2, §8-6)</div>
      <div class="calc-step-body">도착 지역을 선택하면 권역・요금・도착예정일까지 이어서 계산됩니다.</div></div>`;
    document.getElementById('calcSteps').innerHTML = html;
    renderRateTable(gt.matched, null);
    return;
  }

  const region = determineRegion(area);
  const tier = RATE_TABLE.find(t => t.grade === gt.matched);
  const price = tier.price[region];
  const etaInfo = addBusinessDaysTrace(new Date(), ETA_BUSINESS_DAYS[region]);
  const specialNote = (area === '진주' || area === '거제') ? '다리・도로로 연결된 일반 지역입니다(규정 §2 "주의" 조항, 도서산간이 아닙니다). -> ' : '';

  html += step('5', '권역 판정 (규정 §2, §8-6)', `도착 지역 "${area}" -> ${specialNote}<b>${region}</b>`);
  html += step('6', '요금 조회 (규정 §3 요금표)', `${gt.matched} 등급 x ${region} 권역 = <b>${formatWon(price)}</b>`);

  const etaDetail = etaInfo.trace.map(t => `${formatDateISO(t.date)}(${WEEKDAY_KO[t.dow]}) - ${t.isWeekend ? '주말이라 제외' : `영업일 ${t.countedAt}일째`}`).join('<br>');
  html += step('7', `도착 예정일 (규정 §6, §8-7 - ${region}은 접수 후 +${ETA_BUSINESS_DAYS[region]}영업일)`,
    `${etaDetail}<br>도착 예정 -> <b>${formatDateISO(etaInfo.finalDate)}(${WEEKDAY_KO[etaInfo.finalDate.getDay()]})</b>`);

  document.getElementById('calcSteps').innerHTML = html;
  renderRateTable(gt.matched, region);
}

// ============================================================
// 요약 (확인 단계) + 검증
// ============================================================
function renderSummary() {
  const senderName = document.getElementById('senderName').value.trim();
  const receiverName = document.getElementById('receiverName').value.trim();
  const weight = getNumeric('weightKg');
  const width = getNumeric('widthCm');
  const height = getNumeric('heightCm');
  const depth = getNumeric('depthCm');
  const rows = [
    ['접수 지점', state.branch || '(미선택)'],
    ['보내는 분', senderName || '(미입력)'],
    ['받는 분', receiverName || '(미입력)'],
    ['물품명', state.itemName || '(미선택)'],
    ['치수(가로x세로x높이)', (width && height && depth) ? `${width} x ${height} x ${depth} cm` : '(미입력)'],
    ['실제 무게', weight ? `${weight} kg` : '(미입력)'],
    ['도착 지역', state.receiverArea || '(미선택)'],
  ];
  document.getElementById('summaryBox').innerHTML = rows.map(r =>
    `<div class="summary-row"><span>${r[0]}</span><span>${r[1]}</span></div>`
  ).join('');
}

function validateAll() {
  const errors = [];
  const senderName = document.getElementById('senderName').value.trim();
  const receiverName = document.getElementById('receiverName').value.trim();
  const weight = getNumeric('weightKg');
  const width = getNumeric('widthCm');
  const height = getNumeric('heightCm');
  const depth = getNumeric('depthCm');

  if (!state.branch) errors.push('접수 지점을 선택하세요.');
  if (!senderName) errors.push('보내는 분 이름을 입력하세요.');
  if (!receiverName) errors.push('받는 분 이름을 입력하세요.');
  if (!state.receiverArea) errors.push('도착 지역을 선택하세요.');
  if (!state.itemName) errors.push('물품명을 선택하거나 입력하세요.');
  if (weight === null) errors.push('실제 무게를 0보다 큰 숫자로 입력하세요.');
  if (width === null || height === null || depth === null) errors.push('가로・세로・높이를 모두 0보다 큰 숫자로 입력하세요.');
  if (weight !== null && weight > 30) errors.push(`무게는 30kg까지만 접수됩니다(지금 ${weight}kg). 대형화물 전문 창구 ${BULKY_DESK_PHONE}로 안내하세요.`);
  if ([width, height, depth].some(v => v !== null && v > 200)) errors.push(`한 변은 200cm까지만 접수됩니다. 대형화물 전문 창구 ${BULKY_DESK_PHONE}로 안내하세요.`);

  const ban = checkBanned(state.itemName);
  if (ban.hardHits.length > 0) {
    const h = ban.hardHits[0];
    errors.push(`접수 불가 품목입니다 - ${h.category} "${h.keyword}"(규정 §5). 고객센터 ${CS_PHONE}로 문의하세요.`);
  }
  const staffConfirmEl = document.getElementById('staffConfirm');
  if (ban.softHits.length > 0 && !(staffConfirmEl && staffConfirmEl.checked)) {
    const h = ban.softHits[0];
    errors.push(`"${h.keyword}"는 ${h.condition} 금지 품목입니다(규정 §5). 직원 확인 체크가 필요합니다.`);
  }
  if (weight !== null && width !== null && height !== null && depth !== null) {
    const sumCm = width + height + depth;
    const billedWeightKg = Math.max(weight, (width * height * depth) / 6000);
    const grade = determineGrade(sumCm, billedWeightKg);
    if (!grade) errors.push(`대형 상한 초과로 접수할 수 없습니다(세 변의 합 ${sumCm.toFixed(1)}cm, 요금 무게 ${billedWeightKg.toFixed(2)}kg - 규정 §3). 대형화물 전문 창구 ${BULKY_DESK_PHONE}로 안내하세요.`);
  }
  return errors;
}

function updateSubmitState() {
  const errors = validateAll();
  document.getElementById('submitBtn').disabled = errors.length > 0;
  if (currentStep === STEPS.length - 1) {
    document.getElementById('errorBox').innerHTML = errors.length > 0
      ? '<div class="error-title">접수 완료를 누르려면</div><ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>'
      : '';
  }
}

function recalc() {
  const ban = checkBanned(state.itemName);
  renderBannedWarning(ban);

  const weight = getNumeric('weightKg');
  const width = getNumeric('widthCm');
  const height = getNumeric('heightCm');
  const depth = getNumeric('depthCm');

  const dimsWarningEl = document.getElementById('dimsWarning');
  if (dimsWarningEl) {
    const overWeight = weight !== null && weight > 30;
    const overDim = [width, height, depth].some(v => v !== null && v > 200);
    if (overWeight || overDim) {
      dimsWarningEl.innerHTML = `<span class="badge bad">${overWeight ? '무게가 30kg를 넘었습니다.' : ''} ${overDim ? '한 변이 200cm를 넘었습니다.' : ''} 일반 택배로 접수할 수 없습니다 - 대형화물 전문 창구 ${BULKY_DESK_PHONE}</span>`;
    } else {
      dimsWarningEl.innerHTML = '';
    }
  }

  if (ban.hardHits.length > 0) {
    renderCalcBannedStop(state.itemName, ban.hardHits[0]);
  } else if (weight === null || width === null || height === null || depth === null) {
    renderCalcPending();
  } else {
    renderCalcSteps(weight, width, height, depth, state.receiverArea);
  }
  renderMiniPreviews(weight, width, height, depth, state.receiverArea, ban);
  if (currentStep === STEPS.length - 1) renderSummary();
  updateSubmitState();
}

// 크기/무게, 도착지역 단계는 옆에 계산패널이 없으므로(확인 단계에서만
// 펼침) 여기서는 결과를 한 줄 배지로만 보여준다.
function renderMiniPreviews(weight, width, height, depth, area, ban) {
  const sizeBox = document.getElementById('miniPreviewSize');
  const areaBox = document.getElementById('miniPreviewArea');
  if (!sizeBox || !areaBox) return;

  const dimsReady = ban.hardHits.length === 0 && weight !== null && width !== null && height !== null && depth !== null;
  if (!dimsReady) {
    sizeBox.className = 'mini-preview';
    sizeBox.innerHTML = '';
    areaBox.className = 'mini-preview';
    areaBox.innerHTML = '';
    return;
  }

  const volumeWeightKg = (width * height * depth) / 6000;
  const billedWeightKg = Math.max(weight, volumeWeightKg);
  const sumCm = width + height + depth;
  const grade = determineGrade(sumCm, billedWeightKg);

  if (!grade) {
    sizeBox.className = 'mini-preview show reject';
    sizeBox.innerHTML = `<div class="mp-item">이 크기・무게로는<b>접수할 수 없어요</b></div><div class="mp-item">청구 무게<b>${billedWeightKg.toFixed(1)}kg</b></div>`;
    areaBox.className = 'mini-preview';
    areaBox.innerHTML = '';
    return;
  }

  sizeBox.className = 'mini-preview show';
  sizeBox.innerHTML = `<div class="mp-item">청구 무게<b>${billedWeightKg.toFixed(1)}kg</b></div><div class="mp-item">크기 등급<b>${grade}</b></div>`;

  if (!area) {
    areaBox.className = 'mini-preview';
    areaBox.innerHTML = '';
    return;
  }

  const region = determineRegion(area);
  const tier = RATE_TABLE.find(t => t.grade === grade);
  const price = tier.price[region];
  const etaInfo = addBusinessDaysTrace(new Date(), ETA_BUSINESS_DAYS[region]);
  areaBox.className = 'mini-preview show';
  areaBox.innerHTML = `<div class="mp-item">권역<b>${region}</b></div><div class="mp-item">예상 요금<b>${formatWon(price)}</b></div><div class="mp-item">도착 예정<b>${formatDateISO(etaInfo.finalDate)}</b></div>`;
}

// ============================================================
// 접수 완료 - 운송장 발급 + 목록 반영 + 영수증
//
// 원칙 - "원재료 값"(무게・치수・도착지역 등)만 서버로 보내고,
// "계산해서 나온 값"(등급・요금・권역・도착예정일・운송장번호)은
// 절대 클라이언트가 만들어 보내지 않는다. DB 트리거가 다시 계산한
// 걸 .select()로 돌려받아서 화면에 쓴다. Supabase가 설정 안 돼
// 있으면(데모/오프라인 상황) 로컬 계산으로 대체하되, 이 경우 실제
// 저장은 안 되고 이 브라우저 세션에서만 유지되며, 영수증 공유
// 링크도(다른 사람 브라우저에서는 조회가 안 되니) 동작하지 않는다.
// ============================================================
const localFallbackShipments = [];

function computeLocally(raw) {
  const volumeWeightKg = (raw.width_cm * raw.height_cm * raw.depth_cm) / 6000;
  const billedWeightKg = Math.max(raw.weight_kg, volumeWeightKg);
  const sumCm = raw.width_cm + raw.height_cm + raw.depth_cm;
  const grade = determineGrade(sumCm, billedWeightKg);
  if (!grade) return null; // 대형 상한 초과 - DB라면 트리거가 예외를 던지는 상황
  const region = determineRegion(raw.receiver_area);
  const tier = RATE_TABLE.find(t => t.grade === grade);
  const etaInfo = addBusinessDaysTrace(new Date(), ETA_BUSINESS_DAYS[region]);
  return {
    ...raw,
    tracking_no: nextTrackingNo(raw.branch_code),
    region_type: region,
    volume_weight_kg: Math.round(volumeWeightKg * 100) / 100,
    billed_weight_kg: Math.round(billedWeightKg * 10) / 10,
    size_grade: grade,
    price: tier.price[region],
    eta_date: formatDateISO(etaInfo.finalDate),
    accepted_at: new Date().toISOString(),
  };
}

async function renderList() {
  const body = document.getElementById('listBody');
  const badge = document.getElementById('listCountBadge');

  let rows = localFallbackShipments;
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('shipments')
      .select('*')
      .order('accepted_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('접수 목록 조회 실패:', error);
      badge.textContent = '';
      body.innerHTML = '<tr class="empty-row"><td colspan="11">목록을 불러오지 못했습니다</td></tr>';
      return;
    }
    rows = data || [];
  }

  badge.textContent = rows.length > 0 ? `(${rows.length})` : '';
  if (rows.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="11">아직 접수 내역이 없습니다</td></tr>';
    return;
  }
  body.innerHTML = rows.map(s => `
    <tr>
      <td><a href="receipt.html?no=${encodeURIComponent(s.tracking_no)}">${s.tracking_no}</a></td>
      <td>${s.branch_name}</td><td>${s.sender_name}</td><td>${s.receiver_name}</td>
      <td>${s.receiver_area}</td><td>${s.region_type}</td><td>${s.item_name}</td>
      <td>${s.billed_weight_kg}kg</td><td>${s.size_grade}</td><td>${formatWon(s.price)}</td><td>${s.eta_date}</td>
    </tr>`).join('');
}

function goToReceiptSearch() {
  const val = document.getElementById('trackingSearchInput').value.trim();
  if (!val) return;
  location.href = 'receipt.html?no=' + encodeURIComponent(val);
}

function showReceipt(record) {
  const el = document.getElementById('receiptSection');
  el.style.display = 'block';
  const shareUrl = buildReceiptShareUrl(record.tracking_no);
  el.innerHTML = `<div class="receipt-card">
      <div class="receipt-title">접수가 완료됐습니다</div>
      <div class="receipt-tno">${record.tracking_no}</div>
      <div class="receipt-line">접수 지점 ${record.branch_name} / 보내는 분 ${record.sender_name}</div>
      <div class="receipt-line">받는 분 ${record.receiver_name} / 도착 지역 ${record.receiver_area}(${record.region_type})</div>
      <div class="receipt-line">물품 ${record.item_name} / 요금 무게 ${record.billed_weight_kg}kg / 등급 ${record.size_grade}</div>
      <div class="receipt-price">${formatWon(record.price)}</div>
      <div class="receipt-eta">도착 예정일 ${record.eta_date}</div>
      <div class="share-row">
        <button type="button" class="share-btn" onclick="shareReceiptLink('${record.tracking_no}', 'shareToast')">공유하기</button>
        <a class="share-btn secondary" style="text-decoration:none; display:flex; align-items:center; justify-content:center;" href="${shareUrl}" target="_blank">영수증 페이지 열기</a>
      </div>
      <div class="share-toast" id="shareToast"></div>
      ${!supabaseClient ? '<div class="share-toast" style="color:var(--bad-text);">Supabase 미연결 - 이 링크는 다른 사람 화면에서는 조회되지 않습니다.</div>' : ''}
    </div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitShipment() {
  const errors = validateAll();
  if (errors.length > 0) { updateSubmitState(); return; }

  // 원재료 값만 담는다 - 등급/요금/권역/도착예정일/운송장번호는
  // 여기서 만들지 않는다 (서버가 다시 계산한다).
  const raw = {
    branch_code: branchCodeOf(state.branch),
    branch_name: state.branch,
    sender_name: document.getElementById('senderName').value.trim(),
    receiver_name: document.getElementById('receiverName').value.trim(),
    receiver_area: state.receiverArea,
    item_name: state.itemName,
    weight_kg: getNumeric('weightKg'),
    width_cm: getNumeric('widthCm'),
    height_cm: getNumeric('heightCm'),
    depth_cm: getNumeric('depthCm'),
    staff_confirmed: !!(document.getElementById('staffConfirm') && document.getElementById('staffConfirm').checked),
  };

  let saved;
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('shipments')
      .insert([raw])
      .select()
      .single();
    if (error) {
      // 금지 품목・대형 초과 등은 화면에서도 막지만, 최종 방어선은
      // DB 트리거의 RAISE EXCEPTION이다 - 그 메시지를 그대로 보여준다.
      alert('접수 실패: ' + error.message);
      return;
    }
    saved = data;
  } else {
    saved = computeLocally(raw);
    if (!saved) {
      alert(`규격 초과로 접수할 수 없습니다. 대형화물 전문 창구 ${BULKY_DESK_PHONE}로 안내하세요.`);
      return;
    }
    localFallbackShipments.unshift(saved);
  }

  showReceipt(saved);
  resetForm();
  await renderList();
  setMainTab('list');
}

function resetForm() {
  ['senderName', 'receiverName', 'itemName', 'weightKg', 'widthCm', 'heightCm', 'depthCm']
    .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  state.branch = ''; state.itemName = ''; state.receiverArea = '';
  document.getElementById('itemCustomField').hidden = true;
  const sc = document.getElementById('staffConfirm'); if (sc) sc.checked = false;
  document.getElementById('softConfirmBox').hidden = true;
  renderBranchChips(); renderItemChips(); renderAreaChips();
  goToStep(0);
}

// ============================================================
// 초기화
// ============================================================
renderStepTabs();
renderBranchChips();
renderItemChips();
renderSizePresetChips();
renderAreaChips();
renderList();
goToStep(0);
