import test from 'node:test';
import assert from 'node:assert/strict';
import { SEMESTERS, ALL_SEMESTERS, createState, calculate, calculateSemester, calculateArts, calculateAttendance, calculateActivities, calculateForecast, calculateScenario, validateState, createExample, integer } from '../dist/calculator.js';

function fill(state, configs = SEMESTERS, achievement = 'A', raw = '100') {
  configs.forEach(s => {
    const term = state.semesters[s.id];
    term.language = s.grade === 3 ? '생활일본어' : '';
    term.subjects.forEach(row => Object.assign(row, { achievement, raw }));
    term.arts.forEach(row => { row.achievement = 'A'; });
  });
  return state;
}
const noAbsence = { absence: '0', late: '0', early: '0', missed: '0' };

test('미입력은 0점/만점으로 가정하지 않는다', () => {
  const s = createState();
  assert.equal(calculate(s).total, null);
  assert.equal(calculate(s).generalTotal, null);
  assert.equal(calculateArts(s.semesters).score, null);
  assert.equal(calculateForecast(s, '2-1').total, null);
  for (const term of Object.values(s.semesters)) term.arts.forEach(row => { row.included = false; });
  assert.equal(calculateArts(s.semesters).score, null);
});

test('전 학기 A/100점, 출결 만점, 활동 가산 2점이면 정확히 200점', () => {
  const s = fill(createState());
  s.attendance = [1, 2, 3].map(() => ({ ...noAbsence }));
  s.awards = Object.fromEntries(ALL_SEMESTERS.map(id => [id, '1']));
  const result = calculate(s);
  assert.deepEqual(result.general.map(row => row.score), [12000, 24000, 24000, 30000, 30000]);
  assert.equal(result.generalTotal, 120000);
  assert.equal(result.arts.score, 30000);
  assert.equal(result.attendanceTotal, 40000);
  assert.equal(result.activities.score, 10000);
  assert.equal(result.total, 200000);
});

test('기본점수·과목별 평균·학기별 반올림과 미이수 제외', () => {
  const s = createState();
  const term = s.semesters['1-2'];
  term.subjects = [
    { name: '국어', achievement: 'A', raw: '100', included: true },
    { name: '수학', achievement: 'B', raw: '90', included: true },
    { name: '영어', achievement: 'C', raw: '80', included: true },
    { name: '미이수', achievement: '', raw: '', included: false },
  ];
  assert.deepEqual(calculateSemester(term, SEMESTERS[0]), { complete: true, count: 3, achievementSum: 12, rawSum: 270, score: 10800 });
  term.subjects[2].raw = '81';
  assert.equal(calculateSemester(term, SEMESTERS[0]).score, 10813);
  term.subjects = Array.from({ length: 8 }, (_, i) => ({ name: String(i), achievement: 'A', raw: i ? '100' : '99', included: true }));
  assert.equal(calculateSemester(term, SEMESTERS[1]).score, 23990);
  assert.equal(calculateSemester(term, SEMESTERS[3]).score, 29988);
  term.subjects.forEach(row => { row.included = false; });
  assert.equal(calculateSemester(term, SEMESTERS[0]).score, null);
});

test('학기별로 반올림한 점수를 합산한다', () => {
  const s = fill(createState());
  for (const term of Object.values(s.semesters)) term.subjects = Array.from({ length: 3 }, (_, i) => ({ name: String(i), achievement: 'A', raw: i ? '100' : '99', included: true }));
  const result = calculate(s);
  assert.deepEqual(result.general.map(row => row.score), [11987, 23973, 23973, 29967, 29967]);
  assert.equal(result.generalTotal, 119867);
});

test('원점수 범위, 음수, 소수, 빈 문자열 검증', () => {
  for (const raw of ['', ' ', '-1', '101', '99.5', 'abc', 'Infinity']) {
    const term = { subjects: [{ included: true, achievement: 'A', raw }], language: '' };
    assert.equal(calculateSemester(term, SEMESTERS[0]).score, null, raw);
  }
  assert.equal(integer(null), null);
  assert.equal(integer(false), null);
  assert.equal(integer('0', 100), 0);
});

test('3학년 선택 외국어를 선택하지 않으면 완료되지 않는다', () => {
  const s = fill(createState());
  s.semesters['3-1'].language = '';
  assert.equal(calculate(s).generalTotal, null);
  s.semesters['3-1'].language = '생활중국어';
  assert.equal(calculate(s).generalTotal, 120000);
});

test('체육·예술은 전 학년 A/B/C를 통합하며 학기별로 반올림하지 않는다', () => {
  const s = fill(createState());
  for (const term of Object.values(s.semesters)) term.arts.forEach((row, i) => { row.achievement = ['A', 'B', 'C'][i]; });
  const result = calculateArts(s.semesters);
  assert.deepEqual(result.counts, { A: 5, B: 5, C: 5 });
  assert.equal(result.count, 15);
  assert.equal(result.score, 23333);
  for (const term of Object.values(s.semesters)) term.arts.forEach(row => { row.achievement = 'C'; });
  assert.equal(calculateArts(s.semesters).score, 16667);
});

test('출결 0~6일 이상 구간을 1·2·3학년 각각 계산한다', () => {
  const first = [13000, 11700, 10400, 9100, 7800, 6500, 5200, 5200];
  const third = [14000, 12600, 11200, 9800, 8400, 7000, 5600, 5600];
  for (let day = 0; day <= 7; day++) {
    for (const grade of [1, 2, 3]) assert.equal(calculateAttendance({ ...noAbsence, absence: String(day) }, grade).score, (grade === 3 ? third : first)[day]);
  }
  const row = calculateAttendance({ absence: '1', late: '2', early: '2', missed: '1' }, 1);
  assert.equal(row.converted, 1);
  assert.equal(row.days, 2);
  assert.equal(row.score, 10400);
  assert.equal(calculateAttendance({ ...noAbsence, late: '2' }, 1).days, 0);
  assert.equal(calculateAttendance({ ...noAbsence, late: '3' }, 1).days, 1);
  assert.equal(calculateAttendance({ ...noAbsence, late: '-1' }, 1).score, null);
});

test('출결 나머지 횟수는 학년을 넘겨 합산하지 않는다', () => {
  const s = createState();
  s.attendance = [1, 2, 3].map(() => ({ ...noAbsence, late: '2' }));
  assert.equal(calculate(s).attendanceTotal, 40000);
});

test('수상은 학기당 1개만, 임원은 15일 이상 및 중복 월 1회, 가산점은 2점까지만', () => {
  const s = createState();
  s.awards['1-1'] = '5';
  const roles = [
    { grade: '1', month: '3', days: '14' },
    { grade: '1', month: '4', days: '15' },
    { grade: '1', month: '4', days: '30' },
    { grade: '1', month: '04', days: '30' },
    { grade: '2', month: '4', days: '15' },
  ];
  let result = calculateActivities(s.awards, roles);
  assert.equal(result.awardCount, 1);
  assert.equal(result.months, 2);
  assert.equal(result.bonus, 700);
  assert.equal(result.score, 8700);
  s.awards = Object.fromEntries(ALL_SEMESTERS.map(id => [id, '10']));
  result = calculateActivities(s.awards, roles);
  assert.equal(result.awardPoints, 3000);
  assert.equal(result.score, 10000);
  assert.equal(calculateActivities(s.awards, [{ grade: '1', month: '4', days: '31' }]).score, null);
  assert.equal(calculateActivities(s.awards, [{ grade: '1', month: '3', days: '' }]).score, null);
});

test('2학년 1학기까지만 입력하면 36점 대비 비율을 120점으로 예상한다', () => {
  const s = fill(createState(), SEMESTERS.slice(0, 2), 'A', '70');
  s.attendance[0] = { ...noAbsence };
  const f = calculateForecast(s, '2-1');
  assert.equal(f.generalEarned, 32400);
  assert.equal(f.generalMax, 36000);
  assert.equal(f.generalScore, 108000);
  assert.equal(f.arts.count, 6);
  assert.equal(f.arts.score, 30000);
  assert.equal(f.academicScore, 138000);
  assert.equal(f.attendanceMax, 13000);
  assert.equal(f.attendanceScore, 40000);
  assert.equal(f.activities.score, 8000);
  assert.equal(f.total, 186000);
  assert.equal(calculate(s).total, null);
});

test('2학년 1학기까지 만점이면 미래 입력 없이 교과 150점과 총점 200점으로 보정한다', () => {
  const s = fill(createState(), SEMESTERS.slice(0, 2));
  s.attendance[0] = { ...noAbsence };
  s.attendance[1] = { ...noAbsence };
  for (const id of ['1-1', '1-2', '2-1']) s.awards[id] = '1';
  s.leadership = [3, 4, 5, 6, 7].map(month => ({ grade: '2', semester: '1', month: String(month), days: '15' }));
  const f = calculateForecast(s, '2-1');
  assert.equal(f.generalMax, 36000);
  assert.equal(f.generalEarned, 36000);
  assert.equal(f.academicScore, 150000);
  assert.equal(f.total, 200000);
  assert.equal(calculate(s).total, null);
  assert.ok(s.semesters['3-1'].subjects.every(row => row.raw === '' && row.achievement === ''));
});

test('일반교과·체육예술·출결을 각 배점으로 환산하고 교과만으로도 보정 점수를 표시한다', () => {
  const s = fill(createState(), SEMESTERS.slice(0, 2), 'B', '85');
  for (const id of ['1-2', '2-1']) s.semesters[id].arts.forEach((row, i) => { row.achievement = ['A', 'B', 'C'][i]; });
  let f = calculateForecast(s, '2-1');
  assert.equal(f.generalEarned, 31800);
  assert.equal(f.generalScore, 106000);
  assert.equal(f.arts.score, 23333);
  assert.equal(f.academicScore, 129333);
  assert.equal(f.total, null);
  s.attendance[0] = { ...noAbsence, absence: '1' };
  s.attendance[1] = { ...noAbsence };
  f = calculateForecast(s, '2-1');
  assert.equal(f.attendanceMax, 26000);
  assert.equal(f.attendanceEarned, 24700);
  assert.equal(f.attendanceScore, 38000);
  assert.equal(f.total, 175333);
  s.semesters['2-1'].arts[0].achievement = '';
  assert.equal(calculateForecast(s, '2-1').academicScore, null);
  s.semesters['2-1'].arts[0].achievement = 'A';
  s.semesters['1-2'].subjects[0].raw = '';
  assert.equal(calculateForecast(s, '2-1').academicScore, null);
});

test('미래 학기의 성적과 실적은 예상 점수에서 제외한다', () => {
  const s = fill(createState());
  s.attendance = [1, 2, 3].map(() => ({ ...noAbsence }));
  const before = calculateForecast(s, '2-1').total;
  s.semesters['3-1'].subjects.forEach(row => { row.raw = '0'; row.achievement = 'E'; });
  s.semesters['3-2'].arts.forEach(row => { row.achievement = 'C'; });
  s.awards['2-2'] = '1';
  s.awards['3-1'] = '1';
  s.leadership = [{ grade: '2', semester: '2', month: '9', days: '20' }, { grade: '2', semester: '2', month: '1', days: '20' }, { grade: '3', semester: '1', month: '3', days: '20' }];
  s.attendance[2].absence = '6';
  assert.equal(calculateForecast(s, '2-1').total, before);
  s.leadership.push({ grade: '2', semester: '1', month: '8', days: '15' });
  assert.equal(calculateForecast(s, '2-1').total, before + 100);
});

test('예상 출결은 입력한 학년만 환산하며 일부만 입력한 학년을 무시하지 않는다', () => {
  const s = fill(createState(), SEMESTERS.slice(0, 2));
  s.attendance[0] = { ...noAbsence, absence: '1' };
  assert.equal(calculateForecast(s, '2-1').attendanceScore, 36000);
  s.attendance[1].absence = '0';
  assert.equal(calculateForecast(s, '2-1').attendanceScore, null);
  s.attendance[1] = { ...noAbsence };
  assert.equal(calculateForecast(s, '2-1').attendanceScore, 38000);
});

test('전체 학기 예상은 전체 산출과 일치한다', () => {
  const s = createExample();
  assert.equal(calculateForecast(s, '3-2').total, calculate(s).total);
  assert.ok(validateState(s));
});

test('백업 경계에서 구조와 입력 범위를 검증한다', () => {
  assert.ok(validateState(createState()));
  for (const data of [null, {}, [], { version: 10 }, { ...createState(), attendance: [] }]) assert.equal(validateState(data), false);
  const s = createExample();
  s.semesters['1-2'].subjects[0].raw = '101';
  assert.equal(validateState(s), false);
  s.semesters['1-2'].subjects[0].raw = '100';
  s.semesters['1-2'].arts[0].achievement = 'D';
  assert.equal(validateState(s), false);
});

test('미래 목표를 실제 학기 배점과 체육예술 통합 산식으로 계산하고 현재 보정과 비교한다', () => {
  const s = fill(createState(), SEMESTERS.slice(0, 2), 'B', '85');
  for (const id of ['1-2', '2-1']) s.semesters[id].arts.forEach((row, i) => { row.achievement = ['A', 'B', 'C'][i]; });
  s.attendance[0] = { ...noAbsence, absence: '1' };
  s.attendance[1] = { ...noAbsence };
  const baseline = calculateForecast(s, '2-1');
  const actual = structuredClone(s.semesters['2-1']);
  assert.equal(calculateScenario(s, '2-1').total, null);
  fill(s, SEMESTERS.slice(2));
  let goal = calculateScenario(s, '2-1');
  assert.equal(goal.generalScore, 115800); // 현재 31.8 + 미래 24 + 30 + 30
  assert.equal(goal.arts.score, 27333); // 현재 A2/B2/C2 + 미래 A9, 15과목 통합
  assert.equal(goal.academicScore, 143133);
  assert.equal(goal.total, 189133);
  assert.equal(goal.difference, 13800);
  assert.ok(goal.future.every(s => s.complete));
  assert.deepEqual(calculateForecast(s, '2-1'), baseline);
  assert.deepEqual(s.semesters['2-1'], actual);
  // 비교과 미래 입력은 목표 교과 비교에 영향을 주지 않는다.
  s.attendance[2] = { ...noAbsence, absence: '6' };
  s.awards['3-2'] = '1';
  s.leadership = [{ grade: '3', semester: '2', month: '10', days: '20' }];
  assert.equal(calculateScenario(s, '2-1').total, goal.total);
  s.semesters['3-2'].subjects[0].raw = '101';
  goal = calculateScenario(s, '2-1');
  assert.equal(goal.total, null);
  assert.equal(goal.difference, null);
  assert.equal(goal.future.at(-1).complete, false);
  assert.equal(calculateForecast(s, '2-1').total, baseline.total);
});

test('목표가 현재 비율과 같으면 보정 점수와 일치하고, 마지막 학기까지 입력하면 전체 산출과 일치한다', () => {
  const s = fill(createState(), SEMESTERS, 'B', '85');
  for (const term of Object.values(s.semesters)) term.arts.forEach((row, i) => { row.achievement = ['A', 'B', 'C'][i]; });
  s.attendance = [1, 2, 3].map(() => ({ ...noAbsence }));
  assert.equal(calculateScenario(s, '2-1').difference, 0);
  assert.equal(calculateScenario(s, '3-2').total, calculate(s).total);
  assert.equal(calculateScenario(s, '3-2').future.length, 0);
  s.semesters['2-2'].arts.forEach(row => { row.included = false; });
  assert.equal(calculateScenario(s, '2-1').future[0].complete, true);
  assert.equal(calculateScenario(s, '2-1').total, calculate(s).total);
});
