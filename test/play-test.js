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
const START_GOLD = 120, REWARD_MONGLE = 6, BONUS_W1 = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = (page) => page.evaluate(() => ({
  lives: __game.lives, wave: __game.wave, started: __game.started, waveActive: __game.waveActive,
  gameOver: __game.gameOver, paused: __game.paused, speed: __game.speed, enemies: __game.enemies.length,
  queue: __game.spawnQueue.length, time: __game.time, kills: __game.kills, gold: __game.gold,
  shopType: __game.shopType, spawned: __game.spawned,
  towers: __game.towers.map((t) => ({ c: t.c, r: t.r, type: t.typeKey, stage: t.stage, name: t.def.name, invested: t.invested })),
  bullets: __game.bullets.length,
  selected: __game.selected ? { c: __game.selected.c, r: __game.selected.r, stage: __game.selected.stage } : null,
  notice: __game.notice,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  infoHidden: document.getElementById('info').classList.contains('hidden'),
  infoText: document.getElementById('infoText').textContent,
  evolveBtn: { text: document.getElementById('btnEvolve').textContent, disabled: document.getElementById('btnEvolve').disabled },
  sellBtn: document.getElementById('btnSell').textContent,
  hud: {
    kills: document.getElementById('kills').textContent, towers: document.getElementById('towers').textContent,
    gold: document.getElementById('gold').textContent,
    selectedCard: (document.querySelector('.card.selected') || {}).dataset ? document.querySelector('.card.selected').dataset.type : null,
    poorCards: Array.from(document.querySelectorAll('.card .cost.poor')).map((e) => e.closest('.card').dataset.type),
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
  await page.setViewport({ width: 1000, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });

  // --- 상성 규칙 ---
  const mult = await page.evaluate(() => [
    __rules.typeMultiplier('fire', 'grass'), __rules.typeMultiplier('grass', 'water'), __rules.typeMultiplier('water', 'fire'),
    __rules.typeMultiplier('grass', 'fire'), __rules.typeMultiplier('water', 'grass'), __rules.typeMultiplier('fire', 'water'),
    __rules.typeMultiplier('fire', 'fire'), __rules.typeMultiplier('grass', 'grass'),
  ]);
  check(mult[0] === 1.5 && mult[1] === 1.5 && mult[2] === 1.5, '상성: 불>풀, 풀>물, 물>불 은 1.5배');
  check(mult[3] === 0.6 && mult[4] === 0.6 && mult[5] === 0.6, '상성: 반대 방향은 0.6배');
  check(mult[6] === 1 && mult[7] === 1, '상성: 같은 속성은 1배');

  let s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0 && s.gold === START_GOLD, '처음엔 생명 10, 웨이브 0, 타워 0, 골드 120');
  check(s.shopType === 'grass' && s.hud.selectedCard === 'grass', '상점에서 처음엔 풀 타워(새싹이)가 골라져 있음');
  check(s.infoHidden, '고른 타워가 없으면 정보창이 숨겨져 있음');

  // --- 상점에서 종류 고르기 (카드 클릭 / 숫자키) ---
  await page.click('.card[data-type="fire"]');
  s = await snap(page);
  check(s.shopType === 'fire' && s.hud.selectedCard === 'fire', '불 타워 카드를 클릭하면 골라짐');
  await page.keyboard.press('Digit3');
  s = await snap(page);
  check(s.shopType === 'water' && s.hud.selectedCard === 'water', '숫자키 3을 누르면 물 타워가 골라짐');
  await page.keyboard.press('Digit2');

  // --- 설치: 불씨(70) + 새싹이(50) = 120 ---
  await clickTile(page, 4, 4);                // 불씨
  await page.keyboard.press('Digit1');
  await clickTile(page, 7, 5);                // 새싹이
  s = await snap(page);
  check(s.towers.length === 2 && s.towers[0].type === 'fire' && s.towers[0].name === '불씨' && s.towers[1].type === 'grass', '불씨와 새싹이를 하나씩 심음');
  check(s.gold === 0 && s.hud.gold === '0', '골드가 120 → 0 (70 + 50)');
  check(s.hud.poorCards.length === 3, '골드 0이면 카드 3장 가격이 전부 빨갛게');
  await clickTile(page, 10, 4);
  s = await snap(page);
  check(s.towers.length === 2 && s.notice.indexOf('골드가 부족') === 0, '골드가 모자라면 못 심고 안내가 뜸');

  // --- 진화 ---
  await page.evaluate(() => { __game.gold = 500; });  // 테스트용으로 골드를 넉넉히
  await clickTile(page, 7, 5);                          // 새싹이 선택
  s = await snap(page);
  check(!s.infoHidden && s.selected && s.selected.c === 7 && s.infoText.indexOf('새싹이') >= 0, '타워를 클릭하면 정보창에 새싹이가 나옴');
  check(s.evolveBtn.text === '진화 (60골드)' && !s.evolveBtn.disabled, '진화 버튼에 60골드가 표시됨');
  await page.click('#btnEvolve');
  s = await snap(page);
  const t75 = s.towers.find((t) => t.c === 7);
  check(t75.stage === 1 && t75.name === '잎사귀' && s.gold === 440, '진화 1회: 새싹이 → 잎사귀, 골드 500 → 440');
  await page.keyboard.press('KeyE');                   // 키보드 E로도 진화
  s = await snap(page);
  const t75b = s.towers.find((t) => t.c === 7);
  check(t75b.stage === 2 && t75b.name === '꽃나래' && s.gold === 340, '진화 2회(E키): 잎사귀 → 꽃나래, 골드 440 → 340');
  check(s.evolveBtn.disabled && s.evolveBtn.text === '최종 진화', '최종 진화 후에는 진화 버튼이 꺼짐');
  await page.click('#btnEvolve');
  s = await snap(page);
  check(s.towers.find((t) => t.c === 7).stage === 2 && s.gold === 340, '최종 진화 상태에서 더 눌러도 변화 없음');
  check(s.sellBtn === '팔기 (+147골드)', '팔기 버튼: 쓴 골드 210의 70% = 147골드');
  await page.click('#btnSell');
  s = await snap(page);
  check(s.towers.length === 1 && s.gold === 487 && s.infoHidden, '팔면 147골드 환불(340 → 487)되고 정보창이 닫힘');

  // 다시 새싹이 심고 골드를 다시 0 근처로 (전투 계산을 위해)
  await page.keyboard.press('Digit1');
  await clickTile(page, 7, 5);
  await page.evaluate(() => { __game.gold = 5; });
  s = await snap(page);
  check(s.towers.length === 2, '전투 준비: 불씨 + 새싹이');
  const goldBeforeFight = s.gold;

  // --- 전투 ---
  await page.click('#btnStart');
  await page.click('#btnSpeed'); await page.click('#btnSpeed'); // 배속 x3
  let sawBullet = false;
  for (let i = 0; i < 12; i++) { await sleep(250); if ((await snap(page)).bullets > 0) { sawBullet = true; break; } }
  check(sawBullet, '타워가 발사함');
  await sleep(3000);
  s = await snap(page);
  const offPath = s.pos.filter(([x, y]) => !pathSet.has(Math.floor(x / 40) + ',' + Math.floor(y / 40)));
  check(offPath.length === 0, '모든 몬스터가 길 위에 있음');
  const hurt = s.pos.filter((e) => e[4] < e[5]).length;
  check(s.kills > 0 || hurt > 0, '몬스터가 맞아서 체력이 줄거나 쓰러짐 (처치 ' + s.kills + ', 다친 적 ' + hurt + ')');
  await page.screenshot({ path: path.join(__dirname, 'shot_mid.png') });

  await page.waitForFunction(() => __game.wave === 2 && __game.waveActive, { timeout: 60000 });
  s = await snap(page);
  const expected = goldBeforeFight + s.kills * REWARD_MONGLE + BONUS_W1;
  check(s.gold === expected, '처치 보상과 웨이브 보너스가 정확히 들어옴 (골드 ' + s.gold + ' = ' + goldBeforeFight + ' + ' + s.kills + '×6 + 25)');

  // --- 일시정지 ---
  await page.click('#btnPause');
  const t1 = (await snap(page)).time; await sleep(500); const t2 = (await snap(page)).time;
  check(t1 === t2, '일시정지하면 시간이 멈춤');
  await page.click('#btnPause');

  // --- 타워 2개로는 결국 패배 (4웨이브부터 물컹이가 나오는지도 확인) ---
  await page.evaluate(() => { __game.speed = 10; });
  await page.waitForFunction(() => __game.gameOver, { timeout: 150000 });
  s = await snap(page);
  check(s.lives === 0 && !s.overlayHidden, '생명이 0이 되면 패배 화면이 뜸 (웨이브 ' + s.wave + ', 처치 ' + s.kills + ')');
  check(s.spawned.bulti > 0 && (s.wave < 4 || s.spawned.mulkeong > 0), '불티·물컹이가 웨이브에 섞여 나옴 (' + JSON.stringify(s.spawned) + ')');
  await page.screenshot({ path: path.join(__dirname, 'shot_end.png') });

  // --- 다시 시작 ---
  await page.click('#btnRestart');
  s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0 && s.kills === 0 && s.gold === START_GOLD && s.overlayHidden && s.infoHidden, '다시 시작하면 타워·점수·골드까지 처음부터');
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
