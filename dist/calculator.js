export const SEMESTERS = [
  { id: '1-2', grade: 1, label: '1학년 2학기', max: 12, base: 4 },
  { id: '2-1', grade: 2, label: '2학년 1학기', max: 24, base: 8 },
  { id: '2-2', grade: 2, label: '2학년 2학기', max: 24, base: 8 },
  { id: '3-1', grade: 3, label: '3학년 1학기', max: 30, base: 10 },
  { id: '3-2', grade: 3, label: '3학년 2학기', max: 30, base: 10 },
];
export const ALL_SEMESTERS = ['1-1', ...SEMESTERS.map(s => s.id)];
export const SUBJECTS = {
  1: ['국어', '사회', '도덕', '수학', '과학', '기술·가정', '영어', '한문'],
  2: ['국어', '역사', '도덕', '수학', '과학', '기술·가정', '정보', '영어'],
  3: ['국어', '사회', '역사', '도덕', '수학', '과학', '기술·가정', '영어'],
};
export const ARTS = ['체육', '음악', '미술'];
export const ACHIEVEMENT = { A: 5, B: 4, C: 3, D: 2, E: 1 };
export const formatScore = value => value === null ? '—' : (value / 1000).toFixed(3);

export function integer(value, max = Number.MAX_SAFE_INTEGER) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null;
}

export function createState() {
  return {
    version: 1,
    student: { grade: '2', class: '', number: '', name: '' },
    semesters: Object.fromEntries(SEMESTERS.map(s => [s.id, {
      language: '',
      subjects: [...SUBJECTS[s.grade].map(name => ({ name, achievement: '', raw: '', included: true })),
        ...(s.grade === 3 ? [{ name: '선택 외국어', achievement: '', raw: '', included: true, elective: true }] : [])],
      arts: ARTS.map(name => ({ name, achievement: '', included: true })),
    }])),
    attendance: [1, 2, 3].map(() => ({ absence: '', late: '', early: '', missed: '' })),
    awards: Object.fromEntries(ALL_SEMESTERS.map(id => [id, '0'])),
    leadership: [],
  };
}

export function calculateSemester(semester, config) {
  const rows = semester.subjects.filter(row => row.included);
  const complete = rows.length > 0 && rows.every(row => ACHIEVEMENT[row.achievement] && integer(row.raw, 100) !== null && (!row.elective || ['생활일본어', '생활중국어'].includes(semester.language)));
  if (!complete) return { complete: false, count: rows.length, achievementSum: null, rawSum: null, score: null };
  const achievementSum = rows.reduce((sum, row) => sum + ACHIEVEMENT[row.achievement], 0);
  const rawSum = rows.reduce((sum, row) => sum + Number(row.raw), 0);
  // 정수 0.001점 단위로 각 학기를 반올림한 뒤 합산한다.
  const unit = config.base / 4;
  const score = Math.round((config.base * 1000 * rows.length + achievementSum * 800 * unit + rawSum * 40 * unit) / rows.length);
  return { complete: true, count: rows.length, achievementSum, rawSum, score };
}

export function calculateArts(semesters, configs = SEMESTERS) {
  const rows = configs.flatMap(s => semesters[s.id].arts.filter(row => row.included));
  const counts = { A: 0, B: 0, C: 0 };
  rows.forEach(row => { if (Object.hasOwn(counts, row.achievement)) counts[row.achievement]++; });
  const entered = counts.A + counts.B + counts.C;
  const complete = rows.length > 0 && entered === rows.length;
  const score = complete ? Math.round(10000 + 20000 * (3 * counts.A + 2 * counts.B + counts.C) / (3 * rows.length)) : null;
  return { complete, counts, count: rows.length, entered, score };
}

export function calculateAttendance(row, grade) {
  const values = ['absence', 'late', 'early', 'missed'].map(key => integer(row[key], 10000));
  if (values.includes(null)) return { complete: false, converted: null, days: null, score: null };
  const [absence, late, early, missed] = values;
  const converted = Math.floor((late + early + missed) / 3);
  const days = absence + converted;
  const max = grade === 3 ? 14 : 13;
  return { complete: true, converted, days, score: max * (1000 - 100 * Math.min(days, 6)) };
}

export function calculateActivities(awards, leadership) {
  const awardValues = ALL_SEMESTERS.map(id => integer(awards[id], 10000));
  const validRoles = leadership.every(row => ['1', '2', '3'].includes(String(row.grade)) && integer(row.month, 12) > 0 && integer(row.days, maxMonthDays(row.month)) !== null);
  if (awardValues.includes(null) || !validRoles) return { complete: false, awardCount: null, awardPoints: null, months: null, leadershipPoints: null, bonus: null, score: null };
  const awardCount = awardValues.reduce((sum, n) => sum + Math.min(n, 1), 0);
  const months = new Set(leadership.filter(row => Number(row.days) >= 15).map(row => `${Number(row.grade)}-${Number(row.month)}`)).size;
  const awardPoints = awardCount * 500;
  const leadershipPoints = months * 100;
  const bonus = Math.min(2000, awardPoints + leadershipPoints);
  return { complete: true, awardCount, awardPoints, months, leadershipPoints, bonus, score: 8000 + bonus };
}

export function maxMonthDays(month) {
  return [4, 6, 9, 11].includes(Number(month)) ? 30 : Number(month) === 2 ? 29 : 31;
}

export function calculate(state) {
  const general = SEMESTERS.map(s => ({ ...s, ...calculateSemester(state.semesters[s.id], s) }));
  const arts = calculateArts(state.semesters);
  const attendance = state.attendance.map((row, index) => ({ grade: index + 1, ...calculateAttendance(row, index + 1) }));
  const activities = calculateActivities(state.awards, state.leadership);
  const generalTotal = general.every(s => s.complete) ? general.reduce((sum, s) => sum + s.score, 0) : null;
  const attendanceTotal = attendance.every(s => s.complete) ? attendance.reduce((sum, s) => sum + s.score, 0) : null;
  const scores = [...general.map(s => s.score), arts.score, ...attendance.map(s => s.score), activities.score];
  const subtotal = scores.reduce((sum, n) => sum + (n ?? 0), 0);
  return { general, generalTotal, arts, attendance, attendanceTotal, activities, subtotal, total: scores.every(n => n !== null) ? subtotal : null };
}

export function calculateForecast(state, cutoff) {
  const index = SEMESTERS.findIndex(s => s.id === cutoff);
  if (index < 0) throw new Error('기준 학기가 올바르지 않습니다.');
  const configs = SEMESTERS.slice(0, index + 1);
  const current = configs.at(-1);
  const general = configs.map(s => ({ ...s, ...calculateSemester(state.semesters[s.id], s) }));
  const generalMax = configs.reduce((sum, s) => sum + s.max * 1000, 0);
  const generalEarned = general.every(s => s.complete) ? general.reduce((sum, s) => sum + s.score, 0) : null;
  const generalScore = generalEarned === null ? null : Math.round(generalEarned * 120000 / generalMax);
  const arts = calculateArts(state.semesters, configs);
  const academicScore = generalScore === null || arts.score === null ? null : generalScore + arts.score;
  const attendance = state.attendance.slice(0, current.grade).map((row, i) => ({ grade: i + 1, started: Object.values(row).some(v => v !== ''), ...calculateAttendance(row, i + 1) })).filter(row => row.started);
  const attendanceMax = attendance.reduce((sum, row) => sum + (row.grade === 3 ? 14000 : 13000), 0);
  const attendanceEarned = attendance.length && attendance.every(row => row.complete) ? attendance.reduce((sum, row) => sum + row.score, 0) : null;
  const attendanceScore = attendanceEarned === null ? null : Math.round(attendanceEarned * 40000 / attendanceMax);
  const allowed = new Set(['1-1', ...configs.map(s => s.id)]);
  const awards = Object.fromEntries(ALL_SEMESTERS.map(id => [id, allowed.has(id) ? state.awards[id] : '0']));
  const leadership = state.leadership.filter(row => Number(row.grade) < current.grade || (Number(row.grade) === current.grade && Number(row.semester) <= Number(current.id[2])));
  const activities = calculateActivities(awards, leadership);
  const scores = [generalScore, arts.score, attendanceScore, activities.score];
  return { general, generalMax, generalEarned, generalScore, arts, academicScore, attendance, attendanceMax, attendanceEarned, attendanceScore, activities, total: scores.every(n => n !== null) ? scores.reduce((sum, n) => sum + n, 0) : null };
}

export function calculateScenario(state, cutoff) {
  const forecast = calculateForecast(state, cutoff);
  const future = SEMESTERS.slice(SEMESTERS.findIndex(s => s.id === cutoff) + 1).map(s => {
    const semester = state.semesters[s.id];
    const subjects = semester.subjects.filter(row => row.included);
    // 목표의 선택 외국어는 과목 한 개의 성취도와 원점수로 계산한다.
    const general = calculateSemester({ ...semester, language: semester.language || '생활일본어' }, s);
    const arts = calculateArts(state.semesters, [s]);
    const generalStarted = subjects.some(row => row.achievement !== '' || row.raw !== '');
    const artsStarted = semester.arts.some(row => row.included && row.achievement !== '');
    return {
      ...s, count: general.count, generalScore: general.score, generalStarted,
      generalComplete: general.complete, artsStarted, artsComplete: !arts.count || arts.complete,
      artsCount: arts.count, complete: general.complete && (!arts.count || arts.complete),
    };
  });
  const generalValid = forecast.generalEarned !== null && future.every(s => s.count > 0 && (!s.generalStarted || s.generalComplete));
  const targetGeneral = future.reduce((sum, s) => sum + (s.generalStarted ? s.generalScore ?? 0 : 0), 0);
  const maintainedMax = future.filter(s => !s.generalStarted).reduce((sum, s) => sum + s.max * 1000, 0);
  // 한 번에 반올림해 목표가 없는 경우 현재 유지 보정값과 일치시킨다.
  const generalScore = generalValid ? Math.round(forecast.generalEarned + targetGeneral + forecast.generalEarned * maintainedMax / forecast.generalMax) : null;
  const arts = calculateArts(state.semesters);
  const maintainedArts = future.filter(s => !s.artsStarted).reduce((sum, s) => sum + s.artsCount, 0);
  const currentWeight = 3 * forecast.arts.counts.A + 2 * forecast.arts.counts.B + forecast.arts.counts.C;
  const targetWeight = 3 * arts.counts.A + 2 * arts.counts.B + arts.counts.C;
  const artsValid = arts.count > 0 && forecast.arts.entered === forecast.arts.count && future.every(s => !s.artsStarted || s.artsComplete) && (!maintainedArts || forecast.arts.complete);
  arts.complete = artsValid;
  arts.score = artsValid ? Math.round(10000 + 20000 * (targetWeight + (maintainedArts ? currentWeight * maintainedArts / forecast.arts.count : 0)) / (3 * arts.count)) : null;
  const academicScore = generalScore === null || arts.score === null ? null : generalScore + arts.score;
  const total = academicScore === null || forecast.attendanceScore === null || forecast.activities.score === null ? null : academicScore + forecast.attendanceScore + forecast.activities.score;
  return {
    generalScore, arts, academicScore, future, total,
    difference: total === null || forecast.total === null ? null : total - forecast.total,
  };
}

export function validateState(data) {
  if (!data || data.version !== 1 || !data.student || !data.semesters || !data.awards || !Array.isArray(data.leadership) || data.leadership.length > 108 || !Array.isArray(data.attendance) || data.attendance.length !== 3) return false;
  if (!['1', '2', '3'].includes(data.student.grade) || !['class', 'number', 'name'].every(k => typeof data.student[k] === 'string' && data.student[k].length <= 50)) return false;
  const validInput = (v, max) => v === '' || integer(v, max) !== null;
  return SEMESTERS.every(s => {
    const term = data.semesters[s.id];
    if (!term || !['', '생활일본어', '생활중국어'].includes(term.language) || !Array.isArray(term.subjects) || term.subjects.length < 1 || term.subjects.length > 30 || !Array.isArray(term.arts) || term.arts.length !== 3) return false;
    return term.subjects.every(row => row && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 30 && typeof row.included === 'boolean' && ['', 'A', 'B', 'C', 'D', 'E'].includes(row.achievement) && validInput(row.raw, 100) && (row.elective === undefined || row.elective === true))
      && term.arts.every((row, i) => row && row.name === ARTS[i] && typeof row.included === 'boolean' && ['', 'A', 'B', 'C'].includes(row.achievement));
  }) && data.attendance.every(row => row && ['absence', 'late', 'early', 'missed'].every(key => validInput(row[key], 10000)))
    && ALL_SEMESTERS.every(id => validInput(data.awards[id], 10000))
    && data.leadership.every(row => row && ['1', '2', '3'].includes(String(row.grade)) && ['1', '2'].includes(row.semester) && integer(row.month, 12) > 0 && validInput(row.days, maxMonthDays(row.month)));
}

export function createExample() {
  const state = createState();
  state.student = { grade: '2', class: '2', number: '1', name: '예시 학생' };
  SEMESTERS.forEach((s, si) => {
    const term = state.semesters[s.id];
    if (s.grade === 3) term.language = '생활일본어';
    term.subjects.forEach((row, i) => { row.achievement = i % 4 === 2 ? 'B' : 'A'; row.raw = String(86 + (i * 3 + si * 2) % 15); });
    term.arts.forEach((row, i) => { row.achievement = (si + i) % 5 === 0 ? 'B' : 'A'; });
  });
  state.attendance = [1, 2, 3].map(() => ({ absence: '0', late: '0', early: '0', missed: '0' }));
  state.awards['1-2'] = '1';
  state.awards['2-1'] = '2';
  state.leadership = [3, 4, 5, 6].map(month => ({ grade: '2', semester: '1', month: String(month), days: '20' }));
  return state;
}
