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
const START_GOLD = 120, COST = 50, REFUND = 35, REWARD = 6, BONUS_W1 = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (page) => page.evaluate(() => ({
  lives: __game.lives, wave: __game.wave, started: __game.started, waveActive: __game.waveActive,
  gameOver: __game.gameOver, paused: __game.paused, speed: __game.speed, enemies: __game.enemies.length,
  queue: __game.spawnQueue.length, time: __game.time, kills: __game.kills, gold: __game.gold,
  towers: __game.towers.map((t) => [t.c, t.r]), bullets: __game.bullets.length,
  selected: __game.selected ? [__game.selected.c, __game.selected.r] : null,
  notice: __game.notice,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  hud: {
    kills: document.getElementById('kills').textContent, towers: document.getElementById('towers').textContent,
    gold: document.getElementById('gold').textContent, costPoor: document.getElementById('towerCost').classList.contains('poor'),
  },
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
  check(s.gold === START_GOLD && s.hud.gold === String(START_GOLD), '시작 골드 ' + START_GOLD);

  // --- 타워 설치 규칙 + 골드 ---
  await clickTile(page, 1, 2);                // 길 위 -> 설치 안 됨
  s = await snap(page);
  check(s.towers.length === 0 && s.gold === START_GOLD, '길 위를 클릭하면 타워가 안 생기고 골드도 그대로');

  await clickTile(page, 4, 4);                // 풀밭 -> 설치 (-50)
  await clickTile(page, 7, 5);                // 풀밭 -> 설치 (-50)
  s = await snap(page);
  check(s.towers.length === 2 && s.hud.towers === '2', '풀밭 두 곳을 클릭하면 타워 2개');
  check(s.gold === START_GOLD - COST * 2 && s.hud.gold === String(s.gold), '타워 2개 값이 빠져 골드 ' + s.gold);
  check(s.hud.costPoor === true, '골드가 모자라면 가격 글씨가 빨갛게 바뀜');

  await clickTile(page, 10, 4);               // 골드 부족 -> 설치 안 됨
  s = await snap(page);
  check(s.towers.length === 2 && s.gold === START_GOLD - COST * 2, '골드가 모자라면 못 심음');
  check(s.notice.indexOf('골드가 부족') === 0, '"골드가 부족해요" 안내가 뜸');

  await clickTile(page, 4, 4);                // 이미 있는 타워 클릭 -> 선택만
  s = await snap(page);
  check(s.towers.length === 2 && s.selected && s.selected[0] === 4, '타워를 다시 클릭하면 새로 안 생기고 선택됨');

  await clickTile(page, 4, 4, 'right');       // 오른쪽 클릭 -> 팔기 (+35)
  s = await snap(page);
  check(s.towers.length === 1 && s.selected === null, '오른쪽 클릭으로 타워 팔기');
  check(s.gold === START_GOLD - COST * 2 + REFUND, '팔면 ' + REFUND + '골드 환불되어 골드 ' + s.gold);
  await clickTile(page, 4, 4);                // 다시 설치 (-50)
  s = await snap(page);
  check(s.towers.length === 2 && s.gold === START_GOLD - COST * 3 + REFUND, '같은 자리에 다시 설치, 골드 ' + s.gold);
  const goldBeforeFight = s.gold;

  // --- 전투 ---
  await page.click('#btnStart');
  await page.click('#btnSpeed'); await page.click('#btnSpeed'); // 배속 x3
  let sawBullet = false;
  for (let i = 0; i < 12; i++) { await sleep(250); if ((await snap(page)).bullets > 0) { sawBullet = true; break; } }
  check(sawBullet, '타워가 씨앗을 발사함');
  await sleep(3000);
  s = await snap(page);
  const offPath = s.pos.filter(([x, y]) => !pathSet.has(Math.floor(x / 40) + ',' + Math.floor(y / 40)));
  check(offPath.length === 0, '모든 몬스터가 길 위에 있음');
  const hurt = s.pos.filter((e) => e[4] < e[5]).length;
  check(s.kills > 0 || hurt > 0, '몬스터가 맞아서 체력이 줄거나 쓰러짐 (처치 ' + s.kills + ', 다친 적 ' + hurt + ')');
  check(s.hud.kills === String(s.kills), '화면의 처치 숫자가 실제와 같음');
  await page.screenshot({ path: path.join(__dirname, 'shot_mid.png') });

  // 2웨이브가 시작된 직후: 골드 = 전투 전 골드 + 처치수×6 + 1웨이브 보너스 25 (불티는 3웨이브부터라 전부 6골드)
  await page.waitForFunction(() => __game.wave === 2 && __game.waveActive, { timeout: 60000 });
  s = await snap(page);
  const expected = goldBeforeFight + s.kills * REWARD + BONUS_W1;
  check(s.gold === expected, '처치 보상과 웨이브 보너스가 정확히 들어옴 (골드 ' + s.gold + ' = ' + goldBeforeFight + ' + ' + s.kills + '×' + REWARD + ' + ' + BONUS_W1 + ')');

  // --- 일시정지 ---
  await page.click('#btnPause');
  const t1 = (await snap(page)).time; await sleep(500); const t2 = (await snap(page)).time;
  check(t1 === t2, '일시정지하면 시간이 멈춤');
  await page.click('#btnPause');

  // --- 타워 2개로는 결국 패배 ---
  await page.evaluate(() => { __game.speed = 10; });
  await page.waitForFunction(() => __game.gameOver, { timeout: 120000 });
  s = await snap(page);
  check(s.lives === 0 && !s.overlayHidden, '생명이 0이 되면 패배 화면이 뜸 (웨이브 ' + s.wave + ', 처치 ' + s.kills + ', 골드 ' + s.gold + ')');
  await page.screenshot({ path: path.join(__dirname, 'shot_end.png') });

  // --- 다시 시작 ---
  await page.click('#btnRestart');
  s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0 && s.kills === 0 && s.gold === START_GOLD && s.overlayHidden, '다시 시작하면 타워·점수·골드까지 처음부터');
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
