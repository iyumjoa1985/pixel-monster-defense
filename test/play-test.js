// 자동 플레이 테스트: 컴퓨터에 설치된 Chrome을 몰래(headless) 띄워서 게임을 직접 눌러보고 확인합니다.
// 실행 방법: npm install 한 번 하고 나서  npm test
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + encodeURI(path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/'));
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
  queue: __game.spawnQueue.length, time: __game.time, kills: __game.kills,
  towers: __game.towers.map((t) => [t.c, t.r]), bullets: __game.bullets.length,
  selected: __game.selected ? [__game.selected.c, __game.selected.r] : null,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  hud: { kills: document.getElementById('kills').textContent, towers: document.getElementById('towers').textContent },
  pos: __game.enemies.map((e) => [e.x, e.y, e.wp, e.type, e.hp, e.maxHp]),
}));
function check(ok, msg) { console.log((ok ? '  [통과] ' : '  [실패] ') + msg); if (!ok) process.exitCode = 1; }

// 게임판의 (가로칸, 세로칸) 한가운데를 실제 마우스로 클릭
async function clickTile(page, c, r, button) {
  const pt = await page.evaluate((c, r) => {
    const rect = document.getElementById('game').getBoundingClientRect();
    return { x: rect.left + (c * 40 + 20) * rect.width / 640, y: rect.top + (r * 40 + 20) * rect.height / 480 };
  }, c, r);
  await page.mouse.click(pt.x, pt.y, { button: button || 'left' });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 920 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });

  let s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0, '처음엔 생명 10, 웨이브 0, 타워 0');

  // --- 타워 설치 규칙 ---
  await clickTile(page, 1, 2);                // 길 위 -> 설치 안 됨
  s = await snap(page);
  check(s.towers.length === 0, '길 위를 클릭하면 타워가 안 생김');

  await clickTile(page, 4, 4);                // 풀밭 -> 설치
  await clickTile(page, 7, 5);                // 풀밭 -> 설치
  s = await snap(page);
  check(s.towers.length === 2 && s.hud.towers === '2', '풀밭 두 곳을 클릭하면 타워 2개 (화면 숫자도 2)');

  await clickTile(page, 4, 4);                // 이미 있는 타워 클릭 -> 선택만
  s = await snap(page);
  check(s.towers.length === 2 && s.selected && s.selected[0] === 4, '타워를 다시 클릭하면 새로 안 생기고 선택됨');

  await clickTile(page, 4, 4, 'right');       // 오른쪽 클릭 -> 제거
  s = await snap(page);
  check(s.towers.length === 1 && s.selected === null, '오른쪽 클릭으로 타워 제거');
  await clickTile(page, 4, 4);                // 다시 설치
  s = await snap(page);
  check(s.towers.length === 2, '같은 자리에 다시 설치 가능');

  // --- 전투 ---
  await page.click('#btnStart');
  await page.click('#btnSpeed'); await page.click('#btnSpeed'); // 배속 x3
  let sawBullet = false;
  for (let i = 0; i < 12; i++) { await sleep(250); if ((await snap(page)).bullets > 0) { sawBullet = true; break; } }
  check(sawBullet, '타워가 씨앗을 발사함');
  await sleep(4000);
  s = await snap(page);
  const offPath = s.pos.filter(([x, y]) => !pathSet.has(Math.floor(x / 40) + ',' + Math.floor(y / 40)));
  check(offPath.length === 0, '모든 몬스터가 길 위에 있음');
  const hurt = s.pos.filter((e) => e[4] < e[5]).length;
  check(s.kills > 0 || hurt > 0, '몬스터가 맞아서 체력이 줄거나 쓰러짐 (처치 ' + s.kills + ', 다친 적 ' + hurt + ')');
  check(s.hud.kills === String(s.kills), '화면의 처치 숫자가 실제와 같음');
  await page.screenshot({ path: path.join(__dirname, 'shot_mid.png') });

  // --- 일시정지 ---
  await page.click('#btnPause');
  const t1 = (await snap(page)).time; await sleep(500); const t2 = (await snap(page)).time;
  check(t1 === t2, '일시정지하면 시간이 멈춤');
  await page.click('#btnPause');

  // --- 타워 2개로는 결국 패배 ---
  await page.evaluate(() => { __game.speed = 10; });
  await page.waitForFunction(() => __game.gameOver, { timeout: 120000 });
  s = await snap(page);
  check(s.lives === 0 && !s.overlayHidden, '생명이 0이 되면 패배 화면이 뜸 (웨이브 ' + s.wave + ', 처치 ' + s.kills + ')');
  check(s.kills > 0, '패배 전까지 몬스터를 물리친 기록이 있음');
  await page.screenshot({ path: path.join(__dirname, 'shot_end.png') });

  // --- 다시 시작 ---
  await page.click('#btnRestart');
  s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0 && s.kills === 0 && s.overlayHidden, '다시 시작하면 타워·점수까지 처음부터');
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
