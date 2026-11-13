import { SEMESTERS, createState, calculate, calculateForecast, calculateScenario, formatScore, validateState, maxMonthDays } from './calculator.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';

const STORAGE_KEY = 'maseok-naesin-v1';
let state = createState();
let remember = false;
let tab = 'subjects';
let semester = '1-2';
let cutoff = '2-1';
let targetSemester = '2-2';
let toastTimer;
let storageError = '';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!validateState(parsed)) throw new Error('invalid');
    state = parsed;
    remember = true;
  }
} catch {
  storageError = '저장 자료를 읽지 못했습니다. 기존 자료는 덮어쓰지 않았어요.';
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
}

function save() {
  if (remember) {
    try {
      if (!validateState(state)) {
        $('#storage-status').textContent = '입력 범위를 벗어난 값이 있어 저장을 기다리고 있어요. 표시된 항목을 확인하세요.';
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageError = '';
    } catch {
      storageError = '이 브라우저에서 자동 저장하지 못했어요.';
    }
  }
  $('#storage-status').textContent = storageError || (remember ? '이 브라우저에 자동 저장 중' : '새로고침하면 입력 내용이 사라집니다.');
}

function achievementSelect(row, index, kind) {
  const values = kind === 'arts' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E'];
  return `<select data-kind="${kind}" data-index="${index}" data-field="achievement" aria-label="${esc(row.name)} 성취도" ${row.included ? '' : 'disabled'}><option value="">선택</option>${values.map(a => `<option value="${a}" ${row.achievement === a ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
}

const editingSemester = () => tab === 'targets' ? targetSemester : semester;

function subjectRows(kind) {
  const term = state.semesters[editingSemester()];
  return term[kind].map((row, i) => `<tr class="${row.included ? '' : 'excluded'}"><td><div class="subject-name">${kind === 'subjects' ? `<span class="subject-index">${String(i + 1).padStart(2, '0')}</span>` : ''}${row.elective ? `<select class="elective-select" data-language aria-label="3학년 선택 외국어" ${row.included ? '' : 'disabled'}><option value="">외국어 선택</option>${['생활일본어', '생활중국어'].map(name => `<option ${term.language === name ? 'selected' : ''}>${name}</option>`).join('')}</select>` : esc(row.name)}</div></td><td>${achievementSelect(row, i, kind)}</td>${kind === 'subjects' ? `<td><input type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0–100" data-kind="subjects" data-index="${i}" data-field="raw" value="${esc(row.raw)}" aria-label="${esc(row.name)} 원점수" ${row.included ? '' : 'disabled'}></td>` : ''}<td><input type="checkbox" data-kind="${kind}" data-index="${i}" data-field="included" ${row.included ? 'checked' : ''} aria-label="${esc(row.name)} 이수 여부"></td></tr>`).join('');
}

function renderSubjects() {
  const target = tab === 'targets';
  const index = SEMESTERS.findIndex(s => s.id === cutoff);
  const configs = target ? SEMESTERS.slice(index + 1) : SEMESTERS.slice(0, index + 1);
  if (!configs.length) return '<div class="panel-inner"><p class="section-description">남은 학기가 없습니다. 현재 성적에서 전체 학기 성적을 입력하세요.</p></div>';
  const term = SEMESTERS.find(s => s.id === editingSemester());
  return `<div class="panel-inner">
    <div class="semester-tabs" role="group" aria-label="${target ? '목표' : '현재'} 성적 입력 학기">${configs.map(s => `<button data-semester="${s.id}" class="${s.id === editingSemester() ? 'active' : ''}" aria-label="${s.label}" aria-pressed="${s.id === editingSemester()}"><span>${s.grade}학년</span> <span>${s.id[2]}학기</span></button>`).join('')}</div>
    ${target ? '<p class="target-note">이 학기에 받고 싶은 성취도와 원점수를 입력하세요.</p><form class="target-fill" id="target-fill-form"><label>일반교과<select name="achievement" aria-label="목표 일괄 성취도"><option>A</option><option>B</option><option>C</option><option>D</option><option>E</option></select></label><label>원점수<input name="raw" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0–100" aria-label="목표 일괄 원점수" required></label><label>체육·예술<select name="arts" aria-label="목표 일괄 체육예술 성취도"><option>A</option><option>B</option><option>C</option></select></label><button type="submit" class="button secondary">이 학기 전체 적용</button></form>' : ''}
    <div class="semester-topline"><span>일반교과</span><span class="muted">${term.label} · ${term.max}점 만점</span></div>
    <table class="grade-table"><thead><tr><th scope="col">과목</th><th scope="col">성취도</th><th scope="col">원점수</th><th scope="col">이수</th></tr></thead><tbody>${subjectRows('subjects')}</tbody></table>
    <button class="text-button add-subject" data-action="add-subject">+ 이수 과목 추가</button>
    <form class="add-row" id="add-subject-form" hidden><input id="new-subject" maxlength="30" placeholder="과목 이름" aria-label="추가할 과목 이름" required><button class="button secondary" type="submit">추가</button></form>
    <p class="table-caption">이수하지 않은 과목은 체크를 해제하세요.</p>
    <div class="table-total"><span id="semester-stats"></span><div><strong id="semester-score">—</strong><small>/ ${term.max}점</small></div></div>
    <div class="section-divider"></div>
    <div class="semester-topline"><span>체육·예술</span><span class="muted">성취도만 입력</span></div>
    <table class="grade-table art-table"><thead><tr><th scope="col">과목</th><th scope="col">성취도</th><th scope="col">이수</th></tr></thead><tbody>${subjectRows('arts')}</tbody></table>
    </div><div class="panel-bottom"><button class="next-button" data-action="next">${term.id === configs.at(-1).id ? (target ? '예상 결과 보기' : '출결 입력하기') : `${configs[configs.findIndex(s => s.id === term.id) + 1].label} 입력`}${arrow}</button></div>`;
}

function renderAttendance() {
  const rows = state.attendance.slice(0, SEMESTERS.find(s => s.id === cutoff).grade);
  return `<div class="panel-inner"><p class="section-description">현재까지의 <strong>미인정</strong> 횟수만 입력하세요.</p>${rows.map((row, i) => `<section class="attendance-card"><div class="attendance-heading"><h3>${i + 1}학년</h3><div><strong id="attendance-score-${i}">—</strong><small> / ${i === 2 ? 14 : 13}점</small></div></div><div class="attendance-fields">${Object.entries({ absence: '미인정 결석', late: '미인정 지각', early: '미인정 조퇴', missed: '미인정 결과' }).map(([key, name]) => `<label>${name}<input type="number" min="0" max="10000" step="1" inputmode="numeric" placeholder="${key === 'absence' ? '일수' : '횟수'}" data-attendance="${i}" data-field="${key}" value="${esc(row[key])}" aria-label="${i + 1}학년 ${name}"></label>`).join('')}</div><div class="attendance-conversion" id="attendance-conversion-${i}"></div><button class="text-button zero-button" data-zero="${i}">미인정 출결 없음 · 모두 0 입력</button></section>`).join('')}<p class="table-caption">입력한 학년의 취득 점수 ÷ 해당 학년 만점으로 비율을 구해 최종 40점으로 환산해요. 입력을 시작한 학년은 네 항목을 모두 채워 주세요.</p></div><div class="panel-bottom"><button class="next-button" data-tab="activities">학교 활동 입력${arrow}</button></div>`;
}

function renderLeadership() {
  $('#leadership-rows').innerHTML = state.leadership.length ? state.leadership.map((row, i) => `<div class="leadership-row">
    <label>학년<select data-role="${i}" data-field="grade" aria-label="임원활동 ${i + 1} 학년">${[1, 2, 3].map(g => `<option value="${g}" ${String(row.grade) === String(g) ? 'selected' : ''}>${g}학년</option>`).join('')}</select></label>
    <label>학기<select data-role="${i}" data-field="semester" aria-label="임원활동 ${i + 1} 학기">${[1, 2].map(s => `<option value="${s}" ${row.semester === String(s) ? 'selected' : ''}>${s}학기</option>`).join('')}</select></label>
    <label>활동 월<select data-role="${i}" data-field="month" aria-label="임원활동 ${i + 1} 월">${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].map(m => `<option value="${m}" ${String(row.month) === String(m) ? 'selected' : ''}>${m}월</option>`).join('')}</select></label>
    <label>활동일수<input type="number" min="0" max="${maxMonthDays(row.month)}" step="1" inputmode="numeric" placeholder="일수" value="${esc(row.days)}" data-role="${i}" data-field="days" aria-label="임원활동 ${i + 1} 실제 활동일수"></label>
    <button class="remove-role" data-remove-role="${i}" aria-label="임원활동 ${i + 1} 삭제">×</button><span class="role-status" id="role-status-${i}"></span></div>`).join('') : '<div class="empty-roles">임원활동이 없으면 입력하지 않아도 돼요.</div>';
  markInvalidInputs();
}

function renderActivities() {
  const awardSemesters = ['1-1', ...SEMESTERS.slice(0, SEMESTERS.findIndex(s => s.id === cutoff) + 1).map(s => s.id)];
  return `<div class="panel-inner"><div class="activity-base"><span>모든 학생에게 부여하는 기본점수</span><strong>8.0<small>점</small></strong></div><h3>교내 수상실적</h3><p class="section-description">학기별 교내 대회상·표창장의 개수. 한 학기당 1개만, 0.5점 인정해요.</p><div class="award-grid">${awardSemesters.map(id => `<label>${id[0]}학년 ${id[2]}학기<input type="number" min="0" max="10000" step="1" inputmode="numeric" data-award="${id}" value="${esc(state.awards[id])}" aria-label="${id[0]}학년 ${id[2]}학기 교내 수상 개수"></label>`).join('')}</div><div class="section-divider"></div><div class="section-head"><h3>자치회 임원활동</h3><button class="text-button" data-action="add-role">+ 활동 월 추가</button></div><p class="section-description">학생회·학급 (부)회장 활동을 월별로 입력하세요.</p><div class="leadership-rows" id="leadership-rows"></div><p class="table-caption">월 15일 이상이면 1개월(0.1점). 같은 학년·월을 중복 입력하면 한 번만 인정해요. 1·2월은 이전 해 3월에 시작한 학년에 해당해요.</p><div class="table-total activity-summary"><span id="activity-stats"></span><div><strong id="activity-score">—</strong><small>/ 10점</small></div></div></div>`;
}

function renderEditor() {
  document.querySelectorAll('[data-tab][role=tab]').forEach(el => { const selected = el.dataset.tab === tab; el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1; });
  $('#editor-panel').setAttribute('aria-labelledby', `tab-${tab}`);
  $('#editor-panel').innerHTML = ['subjects', 'targets'].includes(tab) ? renderSubjects() : tab === 'attendance' ? renderAttendance() : renderActivities();
  if (tab === 'activities') renderLeadership();
  markInvalidInputs();
  update();
}

function markInvalidInputs() {
  document.querySelectorAll('#editor-panel input[type=number]').forEach(el => {
    if (el.closest('#target-fill-form')) return;
    const invalid = !el.validity.valid;
    el.classList.toggle('invalid', invalid);
    el.setAttribute('aria-invalid', String(invalid));
    el.title = invalid ? `0부터 ${el.max} 사이 정수를 입력하세요.` : '';
  });
}

function updateEditor(exact, forecast) {
  if (['subjects', 'targets'].includes(tab) && $('#semester-score')) {
    const current = exact.general.find(s => s.id === editingSemester());
    $('#semester-score').textContent = formatScore(current.score);
    const term = state.semesters[editingSemester()];
    $('#semester-stats').textContent = current.complete ? `${current.count}과목 입력 완료` : term.subjects.some(row => row.included && row.elective) && !term.language ? '선택 외국어를 골라 주세요.' : `${current.count}과목 · 성취도와 원점수를 입력하세요`;
    document.querySelectorAll('[data-semester]').forEach(el => { const result = exact.general.find(s => s.id === el.dataset.semester); el.classList.toggle('complete', result.complete && state.semesters[result.id].arts.every(row => !row.included || row.achievement)); });
  }
  if (tab === 'attendance') exact.attendance.forEach((row, i) => {
    if (!$(`#attendance-score-${i}`)) return;
    $(`#attendance-score-${i}`).textContent = formatScore(row.score);
    $(`#attendance-conversion-${i}`).textContent = row.complete ? `결석 ${state.attendance[i].absence}일 + 지각·조퇴·결과 환산 ${row.converted}일 = 총 ${row.days}일` : '결석·지각·조퇴·결과 네 항목을 모두 입력하세요. 없는 항목은 0으로 입력해요.';
  });
  if (tab === 'activities') {
    const a = forecast.activities;
    $('#activity-score').textContent = formatScore(a.score);
    $('#activity-stats').textContent = a.complete ? `기본 8점 + 수상 ${formatScore(a.awardPoints)} + 임원 ${formatScore(a.leadershipPoints)} (가산 최대 2점)` : '수상 개수와 활동일수를 확인하세요';
    state.leadership.forEach((row, i) => {
      const el = $(`#role-status-${i}`);
      const valid = Number(row.days) >= 15 && Number(row.days) <= maxMonthDays(row.month);
      const duplicate = state.leadership.some((other, oi) => oi !== i && other.grade === row.grade && other.month === row.month);
      el.classList.toggle('valid', valid);
      el.textContent = `${valid ? '✓ 15일 이상 · 1개월 인정' : '15일 이상 활동 시 1개월 인정'}${duplicate ? ' · 같은 월은 중복 없이 1회만 반영' : ''}`;
    });
  }
}

function update() {
  const exact = calculate(state);
  const f = calculateForecast(state, cutoff);
  const target = calculateScenario(state, cutoff);
  updateEditor(exact, f);
  $('#forecast-details').innerHTML = forecastDetails(f);
  $('#academic-score').textContent = formatScore(f.academicScore);
  $('#total-score').textContent = formatScore(f.total);
  $('#target-total-score').textContent = formatScore(target.total);
  $('#target-academic-score').textContent = formatScore(target.academicScore);
  $('#target-caption').textContent = target.future.every(s => s.complete) ? (target.academicScore === null ? '현재 성적 입력도 마쳐 주세요.' : '출결·학교활동은 현재 보정과 동일') : `${target.future.filter(s => s.complete).length} / ${target.future.length}개 학기 목표 입력 완료`;
  $('#target-difference').textContent = target.difference === null ? (target.future.every(s => s.complete) ? '현재 성적·출결 입력을 마치면 비교할 수 있어요.' : '남은 학기의 목표 성적을 입력하면 비교할 수 있어요.') : `현재 보정 대비 ${target.difference > 0 ? '+' : ''}${formatScore(target.difference)}점`;
  $('#target-result').hidden = !target.future.length;
  $('#mobile-total').textContent = formatScore(tab === 'targets' ? target.total : f.total);
  $('#mobile-score-label').textContent = tab === 'targets' ? '목표 달성 시' : '현재 유지 시';
  $('#score-status').textContent = f.total === null ? '입력 중' : '예상';
  $('#score-status').classList.toggle('ready', f.total !== null);
  $('#score-caption').textContent = f.academicScore !== null && f.attendanceScore === null ? '교과 보정 완료 · 출결을 입력하면 총점이 나와요' : `${SEMESTERS.find(s => s.id === cutoff).label}까지의 성적 유지 기준`;
  const areas = [
    ['일반교과', f.generalScore, 120, f.generalEarned, f.generalMax, target.generalScore],
    ['체육·예술', f.arts.score, 30, f.arts.score, 30000, target.arts.score],
    ['출결', f.attendanceScore, 40, f.attendanceEarned, f.attendanceMax, f.attendanceScore],
    ['학교활동', f.activities.score, 10, f.activities.score, 10000, f.activities.score],
  ];
  $('#score-breakdown').innerHTML = areas.map(([label, score, max, current, currentMax, goal]) => `<div class="breakdown-row"><div class="breakdown-label"><span>${label}</span><small>/ ${max}점</small></div><div class="breakdown-values"><div><small>현재 유지</small><strong>${formatScore(score)}</strong></div>${target.future.length ? `<div><small>목표 달성</small><strong>${formatScore(goal)}</strong></div>` : ''}</div><p class="breakdown-current">현재 ${formatScore(current)} / ${currentMax ? currentMax / 1000 : '—'}점 · ${percent(current, currentMax)}</p></div>`).join('');
}

const percent = (score, max) => score === null || !max ? '—' : `${(score / max * 100).toFixed(1)}%`;

function forecastDetails(f) {
  const rows = [
    ['일반교과', `${f.general.length}개 학기 · ${f.general.reduce((sum, s) => sum + s.count, 0)}과목`, f.generalEarned, f.generalMax, f.generalScore, 120000],
    ['체육·예술', `${f.arts.count}과목 통합환산`, f.arts.score, 30000, f.arts.score, 30000],
    ['출결', `${f.attendance.filter(a => a.complete).length}개 학년 입력`, f.attendanceEarned, f.attendanceMax, f.attendanceScore, 40000],
    ['학교활동', '현재 실적 유지', f.activities.score, 10000, f.activities.score, 10000],
  ];
  const weighted = 3 * f.arts.counts.A + 2 * f.arts.counts.B + f.arts.counts.C;
  return `<p class="forecast-period">${SEMESTERS.find(s => s.id === cutoff).label}까지의 성적 기준</p>
    <table class="forecast-table"><thead><tr><th scope="col">영역</th><th scope="col">현재 점수<small>/ 현재 만점</small></th><th scope="col">취득 비율</th><th scope="col">보정 예상<small>/ 최종 만점</small></th></tr></thead><tbody>${rows.map(([label, note, earned, max, score, finalMax]) => `<tr><th scope="row">${label}<small>${note}</small></th><td>${formatScore(earned)}<small>/ ${max ? max / 1000 : '—'}점</small></td><td>${percent(earned, max)}</td><td><strong>${formatScore(score)}</strong><small>/ ${finalMax / 1000}점</small></td></tr>`).join('')}</tbody></table>
    <div class="forecast-totals"><div><span>교과 보정 점수</span><strong>${formatScore(f.academicScore)} <small>/ 150점</small></strong></div><div><span>보정 예상 최종 점수</span><strong>${formatScore(f.total)} <small>/ 200점</small></strong></div></div>
    <p class="table-caption">일반교과: 현재 ${formatScore(f.generalEarned)} ÷ ${f.generalMax / 1000} × 120 = ${formatScore(f.generalScore)}점<br>체육·예술: A ${f.arts.counts.A} · B ${f.arts.counts.B} · C ${f.arts.counts.C} → 10 + 20 × (${weighted} ÷ ${3 * f.arts.count}) = ${formatScore(f.arts.score)}점</p>
    <p class="table-caption">체육·예술은 학기별 배점이 없어 현재까지의 이수 과목을 30점으로 통합환산해요. 같은 A/B/C 비율이 유지된다고 가정합니다. 출결은 입력한 학년의 비율을 유지하고, 학교활동은 현재 실적을 반영합니다. 미래 학기 입력은 필요 없어요. 예상 점수는 공식 확정 점수가 아닙니다.</p>`;
}

function switchTab(next, focus = false) {
  tab = next;
  renderEditor();
  if (focus) $(`#tab-${tab}`).focus();
}

document.addEventListener('input', event => {
  const el = event.target;
  if (el.dataset.kind) state.semesters[editingSemester()][el.dataset.kind][Number(el.dataset.index)][el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  else if ('language' in el.dataset) state.semesters[editingSemester()].language = el.value;
  else if ('attendance' in el.dataset) state.attendance[Number(el.dataset.attendance)][el.dataset.field] = el.value;
  else if ('award' in el.dataset) state.awards[el.dataset.award] = el.value;
  else if ('role' in el.dataset) {
    const row = state.leadership[Number(el.dataset.role)];
    row[el.dataset.field] = el.value;
    if (el.dataset.field === 'month') el.closest('.leadership-row').querySelector('[data-field=days]').max = maxMonthDays(row.month);
  } else return;
  markInvalidInputs();
  if (el.dataset.field === 'included') renderEditor();
  else update();
  save();
});

document.addEventListener('click', event => {
  const el = event.target.closest('button');
  if (!el) return;
  if (el.dataset.semester) { if (tab === 'targets') targetSemester = el.dataset.semester; else semester = el.dataset.semester; renderEditor(); return; }
  if (el.dataset.tab) { switchTab(el.dataset.tab); return; }
  if ('zero' in el.dataset) {
    state.attendance[Number(el.dataset.zero)] = { absence: '0', late: '0', early: '0', missed: '0' };
    renderEditor(); save(); return;
  }
  if ('removeRole' in el.dataset) { state.leadership.splice(Number(el.dataset.removeRole), 1); renderLeadership(); update(); save(); return; }
  const action = el.dataset.action;
  if (action === 'next') {
    const i = SEMESTERS.findIndex(s => s.id === editingSemester());
    if (tab === 'targets') {
      if (i === SEMESTERS.length - 1) $('.results-column').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else { targetSemester = SEMESTERS[i + 1].id; renderEditor(); }
    } else if (semester === cutoff) switchTab('attendance');
    else { semester = SEMESTERS[i + 1].id; renderEditor(); }
  }
  if (action === 'add-subject') { $('#add-subject-form').hidden = !$('#add-subject-form').hidden; if (!$('#add-subject-form').hidden) $('#new-subject').focus(); }
  if (action === 'add-role') {
    if (state.leadership.length >= 108) { toast('최대 108개 활동 월을 입력할 수 있어요.'); return; }
    state.leadership.push({ grade: String(SEMESTERS.find(s => s.id === cutoff).grade), semester: '1', month: '3', days: '' });
    renderLeadership(); update(); save();
    $('#leadership-rows').lastElementChild.querySelector('[data-field=days]').focus();
  }
  if (action === 'summary') $('.results-column').scrollIntoView({ behavior: 'smooth', block: 'start' });

});

document.addEventListener('keydown', event => {
  if (!event.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = ['subjects', 'targets', 'attendance', 'activities'];
  const i = tabs.indexOf(tab);
  switchTab(event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'target-fill-form') {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    const data = new FormData(event.target);
    const term = state.semesters[targetSemester];
    term.subjects.filter(row => row.included).forEach(row => { row.achievement = data.get('achievement'); row.raw = data.get('raw'); });
    term.arts.filter(row => row.included).forEach(row => { row.achievement = data.get('arts'); });
    renderEditor(); save(); return;
  }
  if (event.target.id !== 'add-subject-form') return;
  event.preventDefault();
  const name = $('#new-subject').value.trim();
  const term = state.semesters[editingSemester()];
  if (!name) return;
  if (/^(체육|음악|미술|생활일본어|생활중국어)$/.test(name)) { toast('체육·예술과 선택 외국어는 기존 항목에서 입력하세요.'); return; }
  if (term.subjects.some(row => row.name === name) || term.subjects.length >= 30) { toast('이미 있는 과목이거나 최대 과목수(30개)를 초과했어요.'); return; }
  term.subjects.push({ name, achievement: '', raw: '', included: true });
  renderEditor(); save(); toast(`${name} 과목을 추가했어요.`);
});

$('#cutoff').innerHTML = SEMESTERS.map(s => `<option value="${s.id}" ${s.id === cutoff ? 'selected' : ''}>${s.label}까지</option>`).join('');
$('#cutoff').addEventListener('change', event => {
  cutoff = event.target.value;
  const index = SEMESTERS.findIndex(s => s.id === cutoff);
  if (SEMESTERS.findIndex(s => s.id === semester) > index) semester = cutoff;
  if (SEMESTERS.findIndex(s => s.id === targetSemester) <= index) targetSemester = SEMESTERS[index + 1]?.id;
  renderEditor();
});
renderEditor();
save();
