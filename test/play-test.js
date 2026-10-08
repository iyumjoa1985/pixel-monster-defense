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
const snap = (page) => page.evaluate(() => {
  const boss = __game.enemies.find((e) => e.boss);
  return {
    lives: __game.lives, wave: __game.wave, started: __game.started, waveActive: __game.waveActive,
    gameOver: __game.gameOver, victory: __game.victory, endless: __game.endless, paused: __game.paused, speed: __game.speed,
    enemies: __game.enemies.length, queue: __game.spawnQueue.length, time: __game.time, kills: __game.kills, gold: __game.gold,
    shopType: __game.shopType, spawned: __game.spawned,
    towers: __game.towers.map((t) => ({ c: t.c, r: t.r, type: t.typeKey, stage: t.stage, name: t.def.name, invested: t.invested })),
    bullets: __game.bullets.length,
    selected: __game.selected ? { c: __game.selected.c, r: __game.selected.r, stage: __game.selected.stage } : null,
    boss: boss ? { name: boss.name, hp: boss.hp, maxHp: boss.maxHp, livesDamage: boss.livesDamage } : null,
    notice: __game.notice,
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    overlayTitle: document.getElementById('overlayTitle').textContent,
    continueHidden: document.getElementById('btnContinue').classList.contains('hidden'),
    infoHidden: document.getElementById('info').classList.contains('hidden'),
    infoText: document.getElementById('infoText').textContent,
    evolveBtn: { text: document.getElementById('btnEvolve').textContent, disabled: document.getElementById('btnEvolve').disabled },
    sellBtn: document.getElementById('btnSell').textContent,
    hud: {
      kills: document.getElementById('kills').textContent, towers: document.getElementById('towers').textContent,
      gold: document.getElementById('gold').textContent, wave: document.getElementById('wave').textContent,
      selectedCard: document.querySelector('.card.selected') ? document.querySelector('.card.selected').dataset.type : null,
      poorCards: Array.from(document.querySelectorAll('.card .cost.poor')).map((e) => e.closest('.card').dataset.type),
    },
    pos: __game.enemies.map((e) => [e.x, e.y, e.wp, e.type, e.hp, e.maxHp]),
  };
});
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

  // --- 규칙 검사 (상성, 웨이브 구성, 보스) ---
  const rules = await page.evaluate(() => {
    const wc = (n) => __rules.waveComposition(n);
    const isBoss = (t) => !!__rules.ENEMY_TYPES[t].boss;
    return {
      mult: [
        __rules.typeMultiplier('fire', 'grass'), __rules.typeMultiplier('grass', 'water'), __rules.typeMultiplier('water', 'fire'),
        __rules.typeMultiplier('grass', 'fire'), __rules.typeMultiplier('water', 'grass'), __rules.typeMultiplier('fire', 'water'),
        __rules.typeMultiplier('fire', 'fire'), __rules.typeMultiplier('grass', 'grass'),
      ],
      w1: wc(1), w5hasBoss: wc(5).some(isBoss), w6hasBug: wc(6).includes('bug'), w8hasCrab: wc(8).includes('crab'),
      w10last: wc(10)[wc(10).length - 1], w20last: wc(20)[wc(20).length - 1], w30last: wc(30)[wc(30).length - 1],
      bossLives: __rules.ENEMY_TYPES.kingmongle.livesDamage, magmaLives: __rules.ENEMY_TYPES.magma.livesDamage,
      desc1: __rules.describeWave(1), desc10: __rules.describeWave(10), victoryWave: __rules.VICTORY_WAVE,
    };
  });
  check(rules.mult[0] === 1.5 && rules.mult[1] === 1.5 && rules.mult[2] === 1.5, '상성: 불>풀, 풀>물, 물>불 은 1.5배');
  check(rules.mult[3] === 0.6 && rules.mult[4] === 0.6 && rules.mult[5] === 0.6, '상성: 반대 방향은 0.6배');
  check(rules.mult[6] === 1 && rules.mult[7] === 1, '상성: 같은 속성은 1배');
  check(rules.w1.length === 7 && rules.w1.every((t) => t === 'mongle') && rules.desc1 === '몽글이 7', '1웨이브는 몽글이 7마리 ("' + rules.desc1 + '")');
  check(!rules.w5hasBoss && rules.w6hasBug && rules.w8hasCrab, '6웨이브부터 씨앗벌레, 8웨이브부터 용암게, 5웨이브엔 보스 없음');
  check(rules.w10last === 'kingmongle' && rules.w20last === 'magma' && rules.w30last === 'kingmongle', '10웨이브 끝 왕몽글, 20웨이브 끝 마그마왕, 30웨이브 끝 왕몽글');
  check(rules.bossLives === 5 && rules.magmaLives === 5 && rules.victoryWave === 20, '보스는 생명 5 피해, 승리는 20웨이브');
  check(rules.desc10.indexOf('+ 보스 왕몽글!') > 0, '10웨이브 설명에 보스가 적힘 ("' + rules.desc10 + '")');

  let s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0 && s.gold === START_GOLD, '처음엔 생명 10, 웨이브 0, 타워 0, 골드 120');
  check(s.hud.wave === '0 / 20', '웨이브 표시가 "0 / 20"');
  check(s.shopType === 'grass' && s.hud.selectedCard === 'grass' && s.infoHidden, '상점은 새싹이가 골라져 있고 정보창은 숨김');

  // --- 상점 / 설치 / 골드 ---
  await page.click('.card[data-type="fire"]');
  s = await snap(page);
  check(s.shopType === 'fire' && s.hud.selectedCard === 'fire', '불 타워 카드를 클릭하면 골라짐');
  await page.keyboard.press('Digit3');
  s = await snap(page);
  check(s.shopType === 'water', '숫자키 3을 누르면 물 타워가 골라짐');
  await page.keyboard.press('Digit2');
  await clickTile(page, 4, 4);                // 불씨
  await page.keyboard.press('Digit1');
  await clickTile(page, 7, 5);                // 새싹이
  s = await snap(page);
  check(s.towers.length === 2 && s.towers[0].name === '불씨' && s.towers[1].type === 'grass' && s.gold === 0, '불씨와 새싹이를 심어 골드 120 → 0');
  check(s.hud.poorCards.length === 3, '골드 0이면 카드 3장 가격이 전부 빨갛게');
  await clickTile(page, 10, 4);
  s = await snap(page);
  check(s.towers.length === 2 && s.notice.indexOf('골드가 부족') === 0, '골드가 모자라면 못 심고 안내가 뜸');

  // --- 진화 / 팔기 ---
  await page.evaluate(() => { __game.gold = 500; });
  await clickTile(page, 7, 5);
  s = await snap(page);
  check(!s.infoHidden && s.selected && s.selected.c === 7 && s.evolveBtn.text === '진화 (60골드)', '타워를 클릭하면 정보창과 진화 버튼(60골드)');
  await page.click('#btnEvolve');
  await page.keyboard.press('KeyE');
  s = await snap(page);
  const t75 = s.towers.find((t) => t.c === 7);
  check(t75.stage === 2 && t75.name === '꽃나래' && s.gold === 340 && s.evolveBtn.disabled, '진화 2번: 새싹이 → 꽃나래, 골드 500 → 340, 최종 진화 버튼 꺼짐');
  check(s.sellBtn === '팔기 (+147골드)', '팔기 버튼: 쓴 골드 210의 70% = 147골드');
  await page.click('#btnSell');
  s = await snap(page);
  check(s.towers.length === 1 && s.gold === 487 && s.infoHidden, '팔면 147골드 환불(340 → 487)되고 정보창이 닫힘');
  await page.keyboard.press('Digit1');
  await clickTile(page, 7, 5);
  await page.evaluate(() => { __game.gold = 5; });
  const goldBeforeFight = 5;

  // --- 전투 (1웨이브) ---
  await page.click('#btnStart');
  await page.click('#btnSpeed'); await page.click('#btnSpeed'); // 배속 x3
  let sawBullet = false;
  for (let i = 0; i < 12; i++) { await sleep(250); if ((await snap(page)).bullets > 0) { sawBullet = true; break; } }
  check(sawBullet, '타워가 발사함');
  await sleep(3000);
  s = await snap(page);
  const offPath = s.pos.filter(([x, y]) => !pathSet.has(Math.floor(x / 40) + ',' + Math.floor(y / 40)));
  check(offPath.length === 0, '모든 몬스터가 길 위에 있음');
  check(s.kills > 0 || s.pos.some((e) => e[4] < e[5]), '몬스터가 맞아서 체력이 줄거나 쓰러짐 (처치 ' + s.kills + ')');
  await page.screenshot({ path: path.join(__dirname, 'shot_mid.png') });
  await page.waitForFunction(() => __game.wave === 2 && __game.waveActive, { timeout: 60000 });
  s = await snap(page);
  check(s.gold === goldBeforeFight + s.kills * REWARD_MONGLE + BONUS_W1, '처치 보상과 웨이브 보너스가 정확히 들어옴 (골드 ' + s.gold + ')');

  // --- 일시정지 ---
  await page.click('#btnPause');
  const t1 = (await snap(page)).time; await sleep(500); const t2 = (await snap(page)).time;
  check(t1 === t2, '일시정지하면 시간이 멈춤');

  // --- 보스: 9웨이브로 건너뛰어 10웨이브 보스 확인 ---
  await page.evaluate(() => { __game.enemies = []; __game.spawnQueue = []; __game.bullets = []; __game.wave = 9; __game.speed = 5; });
  await page.click('#btnPause');
  await page.waitForFunction(() => __game.wave === 10 && __game.waveActive, { timeout: 30000 });
  await page.waitForFunction(() => __game.enemies.some((e) => e.boss), { timeout: 90000 });
  s = await snap(page);
  check(s.boss && s.boss.name === '왕몽글' && s.boss.livesDamage === 5 && s.boss.maxHp === 980, '10웨이브 끝에 보스 왕몽글 등장 (체력 980, 생명 피해 5)');
  check(s.notice.indexOf('보스 등장') === 0, '"보스 등장!" 안내가 뜸');
  await page.screenshot({ path: path.join(__dirname, 'shot_boss.png') });

  // 타워 2개로는 10웨이브를 못 막음 → 패배
  await page.evaluate(() => { __game.speed = 10; });
  await page.waitForFunction(() => __game.gameOver, { timeout: 120000 });
  s = await snap(page);
  check(s.lives === 0 && !s.overlayHidden && s.overlayTitle === '패배!' && s.continueHidden, '생명이 0이 되면 패배 화면 (계속하기 버튼은 숨김)');
  check(s.spawned.bulti > 0 && s.spawned.mulkeong > 0 && s.spawned.bug > 0 && s.spawned.crab > 0 && s.spawned.kingmongle === 1, '불티·물컹이·씨앗벌레·용암게·왕몽글이 모두 나왔음 (' + JSON.stringify(s.spawned) + ')');

  // --- 승리: 다시 시작 후 최종 진화 타워 8개로 20웨이브 돌파 ---
  await page.click('#btnRestart');
  s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && s.towers.length === 0 && s.gold === START_GOLD && s.overlayHidden && !s.victory && !s.endless, '다시 시작하면 처음부터');
  await page.evaluate(() => { __game.gold = 5000; });
  const spots = [[4, 4], [7, 5], [4, 7], [9, 3], [11, 3], [10, 7], [6, 9], [13, 9]];
  const keys = ['Digit1', 'Digit2', 'Digit3'];
  for (let i = 0; i < spots.length; i++) {
    await page.keyboard.press(keys[i % 3]);
    await clickTile(page, spots[i][0], spots[i][1]); // 심기
    await clickTile(page, spots[i][0], spots[i][1]); // 고르기
    await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE'); // 진화 2번
    await clickTile(page, spots[i][0], spots[i][1]); // 고르기 해제
  }
  s = await snap(page);
  check(s.towers.length === 8 && s.towers.every((t) => t.stage === 2) && s.gold === 5000 - 2170, '승리 준비: 최종 진화 타워 8개 (골드 5000 → 2830)');
  await page.evaluate(() => { __game.wave = 19; __game.speed = 10; });
  await page.click('#btnStart');
  await page.waitForFunction(() => __game.victory || __game.gameOver, { timeout: 180000 });
  s = await snap(page);
  check(s.victory && !s.gameOver && s.wave === 20 && !s.overlayHidden && s.overlayTitle === '승리!' && !s.continueHidden, '20웨이브를 막아내면 승리 화면 + 계속하기 버튼 (남은 생명 ' + s.lives + ')');
  check(s.spawned.magma === 1, '20웨이브 보스 마그마왕이 나왔다가 쓰러짐');
  await page.screenshot({ path: path.join(__dirname, 'shot_victory.png') });
  await page.click('#btnContinue');
  s = await snap(page);
  check(!s.victory && s.endless && s.overlayHidden, '계속하기를 누르면 끝없는 모드');
  await page.waitForFunction(() => __game.wave === 21 && __game.waveActive, { timeout: 30000 });
  s = await snap(page);
  check(s.wave === 21 && s.hud.wave === '21 (끝없는 모드)', '21웨이브가 시작되고 표시가 "21 (끝없는 모드)"');
  await page.screenshot({ path: path.join(__dirname, 'shot_end.png') });

  await page.click('#btnPause');
  await page.evaluate(() => { __game.gameOver = true; }); // 정리용
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
