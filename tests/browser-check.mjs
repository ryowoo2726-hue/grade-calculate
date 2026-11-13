import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const appUrl = process.env.APP_URL || 'http://localhost:5173/';
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(path.join(os.tmpdir(), 'maseok-ui-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9225', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch('http://localhost:9225/json')).json(); break; } catch { await delay(250); }
  }
  assert.ok(targets, 'Headless browser must start');
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.id) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error))); else resolve(data.result);
    }
  };
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const input = (selector, value) => evaluate(`{ const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); }`);
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  const response = await fetch(appUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  await cdp('Page.navigate', { url: appUrl });
  for (let i = 0; i < 50; i++) {
    if (await evaluate(`!!document.querySelector('#semester-stats')?.textContent`)) break;
    await delay(100);
  }
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  assert.equal(await text('#total-score'), '—');
  assert.equal(await evaluate(`document.querySelector('#cutoff').value`), '2-1');
  assert.equal(await evaluate(`document.querySelectorAll('[data-semester]').length`), 2);
  assert.equal(await evaluate(`document.querySelectorAll('.sidebar, #student-title, #checklist, .data-toolbar, [data-action=example]').length`), 0);
  assert.equal(await evaluate(`document.querySelector('#forecast-summary').open`), false);
  await input('[data-kind=subjects][data-index="0"][data-field=achievement]', 'A');
  await input('[data-kind=subjects][data-index="0"][data-field=raw]', '95');
  assert.equal(await text('#total-score'), '—', 'Partly completed term must not count as a completed term');
  assert.equal(await evaluate(`localStorage.length`), 0, 'Do not enable automatic storage without a previous opt-in');

  // Only historical terms are populated; future grades and attendance stay blank.
  await evaluate(`(async () => {
    const { createState } = await import('/calculator.js');
    const state = createState();
    for (const id of ['1-2', '2-1']) {
      state.semesters[id].subjects.forEach(row => { row.achievement = 'B'; row.raw = '85'; });
      state.semesters[id].arts.forEach((row, i) => { row.achievement = ['A', 'B', 'C'][i]; });
    }
    state.attendance[0] = { absence: '1', late: '0', early: '0', missed: '0' };
    state.attendance[1] = { absence: '0', late: '0', early: '0', missed: '0' };
    localStorage.setItem('maseok-naesin-v1', JSON.stringify(state));
  })()`);
  await cdp('Page.reload');
  for (let i = 0; i < 50; i++) {
    if (await evaluate(`document.querySelector('#total-score')?.textContent === '175.333'`)) break;
    await delay(100);
  }
  assert.equal(await text('#total-score'), '175.333');
  assert.equal(await text('#academic-score'), '129.333');
  assert.match(await text('#score-breakdown'), /31.800 \/ 36점 · 88.3%/);
  assert.match(await text('#forecast-details'), /106.000/);
  assert.match(await text('#forecast-details'), /95.0%/);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('maseok-naesin-v1')).semesters['3-1'].subjects[0].raw`), '');
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  await mkdir('.qa', { recursive: true });
  let shot = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile('.qa/desktop.png', Buffer.from(shot.data, 'base64'));

  await input('[data-kind=subjects][data-index="0"][data-field=raw]', '101');
  assert.equal(await text('#academic-score'), '—');
  assert.equal(await text('#total-score'), '—');
  assert.equal(await evaluate(`document.querySelector('[data-field=raw]').getAttribute('aria-invalid')`), 'true');
  await input('[data-kind=subjects][data-index="0"][data-field=raw]', '85');
  assert.equal(await text('#total-score'), '175.333');
  await input('[data-kind=arts][data-index="0"][data-field=achievement]', '');
  assert.equal(await text('#academic-score'), '—');
  await input('[data-kind=arts][data-index="0"][data-field=achievement]', 'A');
  await click('[data-action=add-subject]');
  await input('#new-subject', '진로');
  await evaluate(`document.querySelector('#add-subject-form').requestSubmit()`);
  assert.equal(await text('#total-score'), '—');
  const index = await evaluate(`document.querySelectorAll('.grade-table:not(.art-table) tbody tr').length - 1`);
  await click(`[data-kind=subjects][data-index="${index}"][data-field=included]`);
  assert.equal(await text('#total-score'), '175.333');
  await click('[data-action=next]');
  assert.equal(await evaluate(`document.querySelector('[data-semester="2-1"]').getAttribute('aria-pressed')`), 'true');
  await click('[data-action=next]');
  assert.equal(await evaluate(`document.querySelector('#tab-attendance').getAttribute('aria-selected')`), 'true');
  assert.equal(await evaluate(`document.querySelectorAll('.attendance-card').length`), 2);
  await input('[data-attendance="0"][data-field=late]', '3');
  assert.equal(await text('#total-score'), '173.333');
  await click('[data-zero="0"]');
  assert.equal(await text('#total-score'), '177.333');
  await click('#tab-activities');
  assert.equal(await evaluate(`document.querySelectorAll('[data-award]').length`), 3);
  await click('[data-action=add-role]');
  await input('[data-role="0"][data-field=days]', '15');
  const roleScore = await text('#activity-score');
  await click('[data-action=add-role]');
  await input('[data-role="1"][data-field=days]', '15');
  assert.equal(await text('#activity-score'), roleScore, 'Duplicate role months count once');
  await click('[data-remove-role="1"]');
  await click('[data-remove-role="0"]');

  await input('#cutoff', '3-1');
  await evaluate(`document.querySelector('#cutoff').dispatchEvent(new Event('change', { bubbles: true }))`);
  await click('#tab-subjects');
  await click('[data-semester="3-1"]');
  assert.equal(await evaluate(`document.querySelectorAll('[data-language]').length`), 1);
  await input('[data-language]', '생활중국어');
  assert.equal(await text('#total-score'), '—');
  await input('#cutoff', '2-1');
  await evaluate(`document.querySelector('#cutoff').dispatchEvent(new Event('change', { bubbles: true }))`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-semester]').length`), 2);
  assert.equal(await text('#total-score'), '177.333', 'Future input does not change the projection');
  await input('#cutoff', '1-2');
  await evaluate(`document.querySelector('#cutoff').dispatchEvent(new Event('change', { bubbles: true }))`);
  assert.equal(await evaluate(`document.querySelector('[data-semester="1-2"]').getAttribute('aria-pressed')`), 'true', 'Changing the cutoff keeps the editor inside its range');
  await input('#cutoff', '2-1');
  await evaluate(`document.querySelector('#cutoff').dispatchEvent(new Event('change', { bubbles: true }))`);

  await click('#tab-targets');
  assert.equal(await evaluate(`document.querySelectorAll('[data-semester]').length`), 3);
  assert.equal(await evaluate(`document.querySelector('#target-fill-form [name=raw]').classList.contains('invalid')`), false, 'Unused bulk inputs must not show an error');
  assert.equal(await text('#target-total-score'), '—');
  const baseline = await text('#total-score');
  for (const id of ['2-2', '3-1', '3-2']) {
    await click(`[data-semester="${id}"]`);
    await input('#target-fill-form [name=raw]', '100');
    await evaluate(`document.querySelector('#target-fill-form').requestSubmit()`);
    if (id.startsWith('3')) await input('[data-language]', '생활일본어');
    assert.equal(await text('#total-score'), baseline, 'Future targets must not change the current projection');
  }
  assert.equal(await text('#target-total-score'), '191.133');
  assert.equal(await text('#target-academic-score'), '143.133');
  assert.match(await text('#target-difference'), /\+13.800점/);
  assert.equal(await text('#mobile-total'), '191.133');
  shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile('.qa/targets-desktop.png', Buffer.from(shot.data, 'base64'));
  await click('[data-semester="2-2"]');
  await input('[data-kind=subjects][data-index="0"][data-field=raw]', '101');
  assert.equal(await text('#target-total-score'), '—');
  assert.equal(await text('#total-score'), baseline);
  await input('[data-kind=subjects][data-index="0"][data-field=raw]', '90');
  assert.equal(await text('#target-total-score'), '191.033');
  await input('[data-kind=subjects][data-index="0"][data-field=raw]', '100');
  await click('#tab-subjects');
  assert.equal(await evaluate(`document.querySelector('[data-field=raw]').value`), '85');
  assert.equal(await text('#mobile-total'), baseline);
  await input('#cutoff', '3-2');
  await evaluate(`document.querySelector('#cutoff').dispatchEvent(new Event('change', { bubbles: true }))`);
  await click('#tab-targets');
  assert.match(await text('#editor-panel'), /남은 학기가 없습니다/);
  assert.equal(await evaluate(`document.querySelector('#target-result').hidden`), true);
  await input('#cutoff', '2-1');
  await evaluate(`document.querySelector('#cutoff').dispatchEvent(new Event('change', { bubbles: true }))`);
  assert.equal(await text('#target-total-score'), '191.133');
  await click('#tab-subjects');

  await click('#forecast-summary summary');
  assert.equal(await evaluate(`document.querySelector('#forecast-summary').open`), true);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
    for (const next of ['subjects', 'targets', 'attendance', 'activities']) {
      await click(`#tab-${next}`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `Overflow at ${width}px in ${next}`);
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('#tab-subjects');
  await evaluate(`scrollTo(0, 0); document.querySelector('#toast').classList.remove('show'); document.querySelector('#forecast-summary').open = false;`);
  shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile('.qa/mobile.png', Buffer.from(shot.data, 'base64'));
  await click('#tab-targets');
  await click('[data-semester="2-2"]');
  await evaluate(`scrollTo(0, 0)`);
  shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile('.qa/targets-mobile.png', Buffer.from(shot.data, 'base64'));
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS: partial-history projection, score ratios, missing/invalid entries, next-step navigation, cutoff changes, electives, activities, existing saved data, minimal UI, and 320–1440px layouts.');
} finally {
  socket?.close();
  browser.kill();
  await delay(500);
  const resolvedProfile = path.resolve(profile);
  if (path.dirname(resolvedProfile) === path.resolve(os.tmpdir()) && path.basename(resolvedProfile).startsWith('maseok-ui-')) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }).catch(() => {});
  }
}
