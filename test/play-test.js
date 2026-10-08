// 자동 플레이 테스트: 컴퓨터에 설치된 Chrome을 몰래(headless) 띄워서 게임을 직접 눌러보고 확인합니다.
// 실행 방법: npm install 한 번 하고 나서  npm test
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + encodeURI(path.resolve(__dirname, '..', 'index.html').split(path.sep).join("/"));
const PATH_TILES = [[-1, 2], [3, 2], [3, 6], [8, 6], [8, 1], [12, 1], [12, 8], [5, 8], [5, 10], [15, 10]];
const pathSet = new Set();
for (let i = 0; i < PATH_TILES.length - 1; i++) {
  const [c1, r1] = PATH_TILES[i], [c2, r2] = PATH_TILES[i + 1];
  const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
  let c = c1, r = r1;
  for (;;) { pathSet.add(c + ',' + r); if (c === c2 && r === r2) break; c += dc; r += dr; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (page) => page.evaluate(() => ({
  lives: __game.lives, wave: __game.wave, started: __game.started, waveActive: __game.waveActive,
  gameOver: __game.gameOver, paused: __game.paused, speed: __game.speed, enemies: __game.enemies.length,
  queue: __game.spawnQueue.length, time: __game.time,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  pos: __game.enemies.map((e) => [e.x, e.y, e.wp, e.type]),
}));
function check(ok, msg) { console.log((ok ? '  [통과] ' : '  [실패] ') + msg); if (!ok) process.exitCode = 1; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });

  let s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started, '처음엔 생명 10, 웨이브 0, 시작 전');

  await page.click('#btnStart');
  await page.click('#btnSpeed'); await page.click('#btnSpeed'); // 배속 x3
  await sleep(3000);
  s = await snap(page);
  check(s.wave === 1 && s.enemies > 0, '웨이브 1 시작 후 몬스터가 나옴 (' + s.enemies + '마리)');
  const offPath = s.pos.filter(([x, y]) => !pathSet.has(Math.floor(x / 40) + ',' + Math.floor(y / 40)));
  check(offPath.length === 0, '모든 몬스터가 길 위에 있음');
  await page.screenshot({ path: path.join(__dirname, 'shot_mid.png') });

  await page.click('#btnPause');
  const t1 = (await snap(page)).time; await sleep(500); const t2 = (await snap(page)).time;
  check(t1 === t2, '일시정지하면 시간이 멈춤');
  await page.click('#btnPause');

  await page.evaluate(() => { __game.speed = 10; });
  await page.waitForFunction(() => __game.gameOver, { timeout: 90000 });
  s = await snap(page);
  check(s.lives === 0 && !s.overlayHidden, '생명이 0이 되면 패배 화면이 뜸 (웨이브 ' + s.wave + ')');
  await page.screenshot({ path: path.join(__dirname, 'shot_end.png') });

  await page.click('#btnRestart');
  s = await snap(page);
  check(s.lives === 10 && s.wave === 1 && !s.gameOver && s.overlayHidden, '다시 시작하면 처음부터');
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
