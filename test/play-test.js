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
  const ctx = Sound.getContext();
  let bestStored = null;
  try { bestStored = JSON.parse(localStorage.getItem('pixelDefense.best') || 'null'); } catch (e) { bestStored = 'error'; }
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
    sound: { hasCtx: !!ctx, ctxState: ctx ? ctx.state : null, muted: Sound.isMuted(), musicOn: Sound.isMusicOn(), stats: Object.assign({}, Sound.stats), mutedStored: localStorage.getItem('pixelDefense.muted') },
    bestStored,
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    overlayTitle: document.getElementById('overlayTitle').textContent,
    overlayText: document.getElementById('overlayText').textContent,
    continueHidden: document.getElementById('btnContinue').classList.contains('hidden'),
    infoHidden: document.getElementById('info').classList.contains('hidden'),
    infoText: document.getElementById('infoText').textContent,
    evolveBtn: { text: document.getElementById('btnEvolve').textContent, disabled: document.getElementById('btnEvolve').disabled },
    sellBtn: document.getElementById('btnSell').textContent,
    hud: {
      kills: document.getElementById('kills').textContent, towers: document.getElementById('towers').textContent,
      gold: document.getElementById('gold').textContent, wave: document.getElementById('wave').textContent,
      best: document.getElementById('best').textContent, mute: document.getElementById('btnMute').textContent,
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });

  // ===== 휴대폰(터치) 테스트: 390×844 세로 화면, 손가락 탭 =====
  console.log('[휴대폰 화면]');
  {
    const m = await browser.newPage();
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const merrors = [];
    m.on('pageerror', (e) => merrors.push(e.message));
    await m.goto(URL, { waitUntil: 'load' });
    await m.evaluate(() => localStorage.clear());
    const tapTile = async (c, r) => {
      const pt = await m.evaluate((c, r) => {
        const rect = document.getElementById('game').getBoundingClientRect();
        return { x: rect.left + (c * 40 + 20) * rect.width / 640, y: rect.top + (r * 40 + 20) * rect.height / 480 };
      }, c, r);
      await m.touchscreen.tap(pt.x, pt.y);
    };
    const msnap = () => m.evaluate(() => ({
      towers: __game.towers.length, pending: __game.pending, gold: __game.gold,
      selected: __game.selected ? [__game.selected.c, __game.selected.r] : null,
      barHidden: document.getElementById('placeBar').classList.contains('hidden'),
      barText: document.getElementById('placeText').textContent,
      okText: document.getElementById('btnPlaceOk').textContent, okDisabled: document.getElementById('btnPlaceOk').disabled,
      infoHidden: document.getElementById('info').classList.contains('hidden'),
      coarse: matchMedia('(pointer: coarse)').matches,
      keyHidden: getComputedStyle(document.querySelector('.card .key')).display === 'none',
      touchHelpShown: getComputedStyle(document.querySelector('.touchHelp')).display !== 'none',
      minorHidden: getComputedStyle(document.querySelector('.stat.minor')).display === 'none',
      noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
      canvasW: document.getElementById('game').getBoundingClientRect().width, innerW: window.innerWidth,
      notice: __game.notice,
    }));
    let ms = await msnap();
    check(ms.noHScroll && ms.canvasW <= ms.innerW, '세로 화면에서 가로 스크롤 없음 (게임판 ' + Math.round(ms.canvasW) + 'px / 화면 ' + ms.innerW + 'px)');
    check(ms.minorHidden, '좁은 화면에서는 덜 중요한 숫자(남은 몬스터·처치·타워)를 숨김');
    check(!ms.coarse || (ms.keyHidden && ms.touchHelpShown), '터치 기기에서는 숫자키 안내를 숨기고 터치 안내를 보여줌 (터치 인식: ' + ms.coarse + ')');
    await tapTile(4, 4);
    ms = await msnap();
    check(ms.towers === 0 && ms.pending && ms.pending.c === 4 && ms.pending.r === 4 && !ms.barHidden, '풀밭을 한 번 누르면 심지 않고 미리보기 (안내창 보임)');
    check(ms.barText.indexOf('새싹이를 여기에 심을까요?') === 0 && ms.okText === '심기 (50골드)', '안내창 문구: "' + ms.barText + '"');
    await tapTile(4, 4);
    ms = await msnap();
    check(ms.towers === 1 && !ms.pending && ms.barHidden && ms.gold === 70, '같은 곳을 다시 누르면 심어짐 (골드 120 → 70), 안내창 닫힘');
    await tapTile(7, 5);
    await m.tap('#btnPlaceCancel');
    ms = await msnap();
    check(ms.towers === 1 && !ms.pending && ms.barHidden, '취소 버튼을 누르면 미리보기가 사라짐');
    await tapTile(7, 5);
    await m.tap('#btnPlaceOk');
    ms = await msnap();
    check(ms.towers === 2 && ms.gold === 20 && ms.barHidden, '[심기] 버튼으로도 심어짐 (골드 70 → 20)');
    await tapTile(10, 4);
    ms = await msnap();
    check(ms.pending && ms.okDisabled && ms.barText.indexOf('골드 부족') > 0, '골드가 모자라면 심기 버튼이 꺼지고 "골드 부족" 표시');
    await tapTile(1, 2);
    ms = await msnap();
    check(!ms.pending && ms.barHidden && ms.notice.indexOf('길 위') === 0, '길을 누르면 미리보기가 사라지고 안내가 뜸');
    await tapTile(4, 4);
    ms = await msnap();
    check(ms.selected && ms.selected[0] === 4 && !ms.infoHidden, '심은 타워를 누르면 정보창(진화·팔기)이 나옴');
    await m.tap('#btnSell');
    ms = await msnap();
    check(ms.towers === 1 && ms.gold === 55 && ms.infoHidden, '팔기 버튼으로 팔림 (오른쪽 클릭 없이, 골드 20 → 55)');
    await m.screenshot({ path: path.join(__dirname, 'shot_mobile.png'), fullPage: true });
    await m.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await sleep(300);
    ms = await msnap();
    const land = await m.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), innerH: window.innerHeight, ratio: +(r.width / r.height).toFixed(2) }; });
    check(ms.noHScroll, '가로 화면에서도 가로 스크롤 없음');
    check(land.h <= land.innerH && land.ratio === 1.33, '가로 화면에서는 게임판이 화면 높이에 맞고(' + land.w + '×' + land.h + 'px, 화면 높이 ' + land.innerH + 'px) 비율(4:3) 유지');
    await m.screenshot({ path: path.join(__dirname, 'shot_mobile_land.png') });
    check(merrors.length === 0, '휴대폰 화면에서 자바스크립트 오류 없음' + (merrors.length ? ': ' + merrors.join(' | ') : ''));
    await m.close();
  }

  // ===== 친구 연결(온라인 협동) 테스트: 브라우저 두 개(= 기기 두 대)를 띄워 방장/친구로 실제 연결 =====
  // (같은 브라우저의 두 탭은 뒤로 간 탭이 절전되어 게임 루프가 멈추므로, 진짜처럼 따로 띄웁니다)
  console.log('[친구 연결]');
  {
    const browserB = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
    const A = await browser.newPage();  // 방장 (브라우저 1)
    const B = await browserB.newPage(); // 친구 (브라우저 2)
    for (const pg of [A, B]) await pg.setViewport({ width: 1000, height: 1000 });
    const netErrors = [];
    A.on('pageerror', (e) => netErrors.push('방장: ' + e.message));
    B.on('pageerror', (e) => netErrors.push('친구: ' + e.message));
    await A.goto(URL, { waitUntil: 'load' });
    await B.goto(URL, { waitUntil: 'load' });
    check(await A.evaluate(() => typeof Peer !== 'undefined' && Net.available()), '연결 도구(PeerJS)가 로드됨');

    await A.click('#btnMp');
    await A.click('#btnMpHost');
    let code = '';
    try {
      await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('mpCode').textContent), { timeout: 30000 });
      code = await A.$eval('#mpCode', (e) => e.textContent);
    } catch (e) { /* 아래에서 실패로 기록 */ }
    check(/^[A-Z0-9]{4}$/.test(code), '방장이 방을 만들면 4글자 코드가 나옴 (' + (code || await A.$eval('#mpMessage', (e) => e.textContent)) + ')');
    const aStatus = await A.$eval('#mpStatus', (e) => e.textContent);
    check(aStatus.indexOf('방 코드 ' + code) >= 0 && aStatus.indexOf('기다리는 중') >= 0, '방장 화면에 "친구를 기다리는 중" 표시');
    check((await A.$eval('#mpLink', (e) => e.textContent)).indexOf('?room=' + code) > 0, '공유용 링크에 방 코드가 들어 있음');

    await B.click('#btnMp');
    await B.type('#mpJoinCode', code.toLowerCase());
    await B.click('#btnMpJoin');
    let joined = false;
    try {
      await B.waitForFunction(() => __game.role === 'guest' && Net.isConnected(), { timeout: 40000 });
      await A.waitForFunction(() => Net.isConnected(), { timeout: 10000 });
      joined = true;
    } catch (e) { /* 실패 */ }
    check(joined, '친구가 코드를 넣으면 연결됨 (소문자로 넣어도 됨)' + (joined ? '' : ' — ' + await B.$eval('#mpMessage', (e) => e.textContent)));
    if (joined) {
      check((await B.$eval('#mpStatus', (e) => e.textContent)).indexOf('방장과 연결됨') >= 0, '친구 화면에 "방장과 연결됨" 표시');

      await clickTile(B, 4, 4);
      await A.waitForFunction(() => __game.towers.length === 1, { timeout: 5000 });
      const at = await A.evaluate(() => ({ n: __game.towers.length, owner: __game.towers[0].owner, gold: __game.gold }));
      check(at.n === 1 && at.owner === 'guest' && at.gold === 70, '친구가 심은 타워가 방장 게임에 생김 (친구 소유, 골드 120 → 70)');
      await B.waitForFunction(() => __game.towers.length === 1 && __game.gold === 70, { timeout: 5000 });
      check(true, '친구 화면에도 그 타워와 골드가 똑같이 보임');

      await clickTile(A, 7, 5);
      await B.waitForFunction(() => __game.towers.length === 2, { timeout: 5000 });
      const bt = await B.evaluate(() => __game.towers.map((t) => t.owner));
      check(bt.indexOf('host') >= 0 && bt.indexOf('guest') >= 0, '방장이 심은 타워도 친구 화면에 보임 (방장/친구 구분 표시)');

      await clickTile(B, 4, 4);
      await B.waitForFunction(() => __game.selected && __game.selected.c === 4, { timeout: 3000 });
      check(await B.$eval('#btnEvolve', (b) => b.disabled), '골드가 모자라면 친구 화면의 진화 버튼도 꺼져 있음 (골드 20 < 60)');
      await A.evaluate(() => { __game.gold = 500; });
      await B.waitForFunction(() => __game.gold === 500 && !document.getElementById('btnEvolve').disabled, { timeout: 5000 });
      check(true, '방장 쪽 골드가 늘면 친구 화면의 진화 버튼이 켜짐');
      await B.click('#btnEvolve');
      await A.waitForFunction(() => __game.towers.find((t) => t.c === 4).stage === 1, { timeout: 5000 });
      await B.waitForFunction(() => __game.towers.find((t) => t.c === 4).stage === 1 && __game.gold === 440, { timeout: 5000 });
      check(true, '친구의 진화 요청이 방장 게임에 적용되고(새싹이 → 잎사귀) 친구 화면 골드 500 → 440');

      await B.click('#btnStart');
      await A.waitForFunction(() => __game.started && __game.wave === 1, { timeout: 5000 });
      await B.waitForFunction(() => __game.enemies.length > 0, { timeout: 10000 });
      const x1 = await B.evaluate(() => __game.enemies[0].x);
      await sleep(1000);
      const x2 = await B.evaluate(() => (__game.enemies[0] ? __game.enemies[0].x : -999));
      check(x2 !== x1, '친구가 웨이브를 시작하면 친구 화면에서 몬스터가 움직임');
      await A.waitForFunction(() => (Sound.stats.shoot_grass || 0) > 0 && (Sound.stats.hit || 0) > 0, { timeout: 20000 }); // 방장 쪽에서 먼저 발사·명중
      let guestHeard = false;
      try { await B.waitForFunction(() => (Sound.stats.shoot_grass || 0) > 0 && (Sound.stats.hit || 0) > 0, { timeout: 5000 }); guestHeard = true; } catch (e) { /* 실패 */ }
      check(guestHeard, '방장 쪽 소리(발사·명중)가 친구 화면에서도 울림');
      await A.screenshot({ path: path.join(__dirname, 'shot_host.png') });
      await B.screenshot({ path: path.join(__dirname, 'shot_guest.png') });

      await B.click('#btnPause');
      await A.waitForFunction(() => __game.paused, { timeout: 5000 });
      await B.waitForFunction(() => __game.paused && document.getElementById('btnPause').textContent === '계속하기', { timeout: 5000 });
      check(true, '친구가 일시정지하면 방장 게임도 멈추고 친구 버튼이 "계속하기"로 바뀜');
      await B.click('#btnPause');
      await A.waitForFunction(() => !__game.paused, { timeout: 5000 });

      await A.evaluate(() => { __game.lives = 1; __game.speed = 10; });
      await A.waitForFunction(() => __game.gameOver, { timeout: 120000 });
      await B.waitForFunction(() => __game.gameOver && !document.getElementById('overlay').classList.contains('hidden'), { timeout: 5000 });
      check((await B.$eval('#overlayTitle', (e) => e.textContent)) === '패배!', '방장 게임이 끝나면 친구 화면에도 패배 창이 뜸');

      await B.click('#btnRestart');
      await A.waitForFunction(() => !__game.gameOver && __game.wave === 0 && __game.towers.length === 0, { timeout: 5000 });
      await B.waitForFunction(() => !__game.gameOver && __game.wave === 0 && __game.towers.length === 0 && document.getElementById('overlay').classList.contains('hidden'), { timeout: 5000 });
      check(true, '친구가 다시 시작을 누르면 둘 다 처음부터');

      await B.click('#btnMp');
      await B.click('#btnMpLeave');
      await A.waitForFunction(() => __game.notice.indexOf('친구 연결이 끊겼') === 0, { timeout: 10000 });
      check((await B.evaluate(() => __game.role)) === 'solo', '친구가 나가면 방장에게 알림이 뜨고 친구는 혼자 모드로 돌아감');

      await B.close();
      const C = await browserB.newPage();
      await C.setViewport({ width: 1000, height: 1000 });
      await C.goto(URL + '?room=' + code, { waitUntil: 'load' });
      let rejoined = false;
      try { await C.waitForFunction(() => __game.role === 'guest' && Net.isConnected(), { timeout: 40000 }); rejoined = true; } catch (e) { /* 실패 */ }
      check(rejoined, '친구가 링크(?room=코드)로 열면 자동으로 다시 들어옴');
      await C.close();
    }
    check(netErrors.length === 0, '친구 연결 중 자바스크립트 오류 없음' + (netErrors.length ? ': ' + netErrors.join(' | ') : ''));
    await A.close();
    await browserB.close();
  }

  // ===== 컴퓨터(마우스) 테스트 =====
  console.log('[컴퓨터 화면]');
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear()); // 이전 기록을 지우고 깨끗하게 시작
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
      noteA4: Math.round(Sound.NOTE.A4), noteC4: Math.round(Sound.NOTE.C4 * 10) / 10,
    };
  });
  check(rules.mult[0] === 1.5 && rules.mult[1] === 1.5 && rules.mult[2] === 1.5, '상성: 불>풀, 풀>물, 물>불 은 1.5배');
  check(rules.mult[3] === 0.6 && rules.mult[4] === 0.6 && rules.mult[5] === 0.6, '상성: 반대 방향은 0.6배');
  check(rules.mult[6] === 1 && rules.mult[7] === 1, '상성: 같은 속성은 1배');
  check(rules.w1.length === 7 && rules.w1.every((t) => t === 'mongle') && rules.desc1 === '몽글이 7', '1웨이브는 몽글이 7마리');
  check(!rules.w5hasBoss && rules.w6hasBug && rules.w8hasCrab, '6웨이브부터 씨앗벌레, 8웨이브부터 용암게, 5웨이브엔 보스 없음');
  check(rules.w10last === 'kingmongle' && rules.w20last === 'magma' && rules.w30last === 'kingmongle', '10웨이브 끝 왕몽글, 20웨이브 끝 마그마왕, 30웨이브 끝 왕몽글');
  check(rules.bossLives === 5 && rules.magmaLives === 5 && rules.victoryWave === 20, '보스는 생명 5 피해, 승리는 20웨이브');
  check(rules.noteA4 === 440 && rules.noteC4 === 261.6, '음계 계산: A4 = 440Hz, C4 = 261.6Hz');

  let s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && !s.started && s.towers.length === 0 && s.gold === START_GOLD, '처음엔 생명 10, 웨이브 0, 타워 0, 골드 120');
  check(s.hud.wave === '0 / 20' && s.hud.best === '-' && s.bestStored === null, '웨이브 "0 / 20", 최고 기록은 아직 없음("-")');
  check(!s.sound.hasCtx && !s.sound.muted && s.hud.mute === '🔊 소리', '클릭 전에는 소리 장치가 아직 안 켜져 있고, 소리는 켜짐 상태');

  // --- 소리 켜기/끄기 + 저장 ---
  await page.click('.card[data-type="fire"]');  // 첫 클릭 → 소리 장치 켜짐
  s = await snap(page);
  check(s.sound.hasCtx, '첫 클릭 뒤에 소리 장치가 켜짐 (상태: ' + s.sound.ctxState + ')');
  await page.click('#btnMute');
  s = await snap(page);
  check(s.sound.muted && s.hud.mute === '🔇 소리 끔' && s.sound.mutedStored === '1', '소리 버튼을 누르면 꺼지고 저장됨');
  await page.goto(URL, { waitUntil: 'load' });
  s = await snap(page);
  check(s.sound.muted && s.hud.mute === '🔇 소리 끔', '페이지를 다시 열어도 소리 꺼짐이 기억됨');
  await page.click('#btnMute');
  s = await snap(page);
  check(!s.sound.muted && s.hud.mute === '🔊 소리' && s.sound.mutedStored === '0', '다시 누르면 소리 켜짐');

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
  check(s.sound.stats.place === 2, '심을 때마다 심기 소리 (2번)');
  check(s.hud.poorCards.length === 3, '골드 0이면 카드 3장 가격이 전부 빨갛게');
  await clickTile(page, 10, 4);
  await clickTile(page, 1, 2);
  s = await snap(page);
  check(s.towers.length === 2 && s.sound.stats.error === 2, '골드 부족·길 위 클릭 → 못 심고 오류음 2번');

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
  check(s.sound.stats.evolve === 2, '진화 소리 2번');
  check(s.sellBtn === '팔기 (+147골드)', '팔기 버튼: 쓴 골드 210의 70% = 147골드');
  await page.click('#btnSell');
  s = await snap(page);
  check(s.towers.length === 1 && s.gold === 487 && s.infoHidden && s.sound.stats.sell === 1, '팔면 147골드 환불(340 → 487), 정보창 닫힘, 팔기 소리');
  await page.keyboard.press('Digit1');
  await clickTile(page, 7, 5);
  await page.evaluate(() => { __game.gold = 5; });
  const goldBeforeFight = 5;

  // --- 전투 (1웨이브) ---
  s = await snap(page);
  check(!s.sound.musicOn, '웨이브 시작 전에는 배경음이 안 나옴');
  await page.click('#btnStart');
  await page.click('#btnSpeed'); await page.click('#btnSpeed'); // 배속 x3
  s = await snap(page);
  check(s.sound.musicOn, '웨이브를 시작하면 배경음이 나옴');
  let sawBullet = false;
  for (let i = 0; i < 12; i++) { await sleep(250); if ((await snap(page)).bullets > 0) { sawBullet = true; break; } }
  check(sawBullet, '타워가 발사함');
  await sleep(3000);
  s = await snap(page);
  const offPath = s.pos.filter(([x, y]) => !pathSet.has(Math.floor(x / 40) + ',' + Math.floor(y / 40)));
  check(offPath.length === 0, '모든 몬스터가 길 위에 있음');
  check(s.kills > 0 || s.pos.some((e) => e[4] < e[5]), '몬스터가 맞아서 체력이 줄거나 쓰러짐 (처치 ' + s.kills + ')');
  check(s.sound.stats.shoot_fire > 0 && s.sound.stats.hit > 0, '발사음과 명중음이 울림');
  await page.screenshot({ path: path.join(__dirname, 'shot_mid.png') });
  await page.waitForFunction(() => __game.wave === 2 && __game.waveActive, { timeout: 60000 });
  s = await snap(page);
  check(s.gold === goldBeforeFight + s.kills * REWARD_MONGLE + BONUS_W1, '처치 보상과 웨이브 보너스가 정확히 들어옴 (골드 ' + s.gold + ')');
  check(s.sound.stats.kill >= 7 && s.sound.stats.waveClear === 1, '처치음 7번 이상, 웨이브 성공음 1번');

  // --- 일시정지 (소리도 같이 멈춤) ---
  await page.click('#btnPause');
  const t1 = (await snap(page)).time; await sleep(500); const p = await snap(page);
  check(t1 === p.time, '일시정지하면 시간이 멈춤');
  check(!p.sound.hasCtx || p.sound.ctxState === 'suspended', '일시정지하면 소리 장치도 멈춤 (상태: ' + p.sound.ctxState + ')');
  await page.click('.card[data-type="water"]'); // 일시정지 중에 다른 데를 클릭해도
  await sleep(300);
  const p2 = await snap(page);
  check(!p2.sound.hasCtx || p2.sound.ctxState === 'suspended', '일시정지 중에 다른 곳을 클릭해도 소리는 계속 멈춰 있음 (상태: ' + p2.sound.ctxState + ')');
  await page.keyboard.press('Digit2');

  // --- 보스: 9웨이브로 건너뛰어 10웨이브 보스 확인 ---
  await page.evaluate(() => { __game.enemies = []; __game.spawnQueue = []; __game.bullets = []; __game.wave = 9; __game.speed = 5; });
  await page.click('#btnPause');
  await sleep(300); // 소리 장치가 다시 켜지는 데 잠깐 걸림
  s = await snap(page);
  check(!s.sound.hasCtx || s.sound.ctxState === 'running', '다시 시작하면 소리 장치도 다시 켜짐 (상태: ' + s.sound.ctxState + ')');
  await page.waitForFunction(() => __game.wave === 10 && __game.waveActive, { timeout: 30000 });
  await page.waitForFunction(() => __game.enemies.some((e) => e.boss), { timeout: 90000 });
  s = await snap(page);
  check(s.boss && s.boss.name === '왕몽글' && s.boss.livesDamage === 5 && s.boss.maxHp === 980, '10웨이브 끝에 보스 왕몽글 등장 (체력 980, 생명 피해 5)');
  check(s.sound.stats.boss === 1, '보스 등장음 1번');
  await page.screenshot({ path: path.join(__dirname, 'shot_boss.png') });

  // 타워 2개로는 10웨이브를 못 막음 → 패배
  await page.evaluate(() => { __game.speed = 10; });
  await page.waitForFunction(() => __game.gameOver, { timeout: 120000 });
  s = await snap(page);
  check(s.lives === 0 && !s.overlayHidden && s.overlayTitle === '패배!' && s.continueHidden, '생명이 0이 되면 패배 화면 (계속하기 버튼은 숨김)');
  check(s.sound.stats.lifeLost >= 1 && s.sound.stats.defeat === 1 && !s.sound.musicOn, '생명 감소음, 패배음, 배경음 정지');
  check(s.sound.stats.shoot_grass > 0 && s.sound.stats.shoot_fire > 0, '풀·불 타워 발사음이 모두 울렸음');
  check(s.bestStored && s.bestStored.wave === 10 && s.bestStored.victories === 0 && s.hud.best === '10웨이브', '최고 기록 저장: 10웨이브 (화면 "' + s.hud.best + '")');
  check(s.overlayText.indexOf('최고 기록 갱신') > 0, '패배 화면에 "최고 기록 갱신!" 표시');
  check(s.spawned.bulti > 0 && s.spawned.mulkeong > 0 && s.spawned.bug > 0 && s.spawned.crab > 0 && s.spawned.kingmongle === 1, '불티·물컹이·씨앗벌레·용암게·왕몽글이 모두 나왔음');

  // --- 승리: 다시 시작 후 최종 진화 타워 8개로 20웨이브 돌파 ---
  await page.click('#btnRestart');
  s = await snap(page);
  check(s.lives === 10 && s.wave === 0 && s.towers.length === 0 && s.gold === START_GOLD && s.overlayHidden && !s.victory && !s.endless, '다시 시작하면 처음부터');
  check(s.hud.best === '10웨이브', '다시 시작해도 최고 기록은 남아 있음');
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
  check(s.sound.stats.victory === 1 && !s.sound.musicOn, '승리 팡파르, 배경음 정지');
  check(s.bestStored && s.bestStored.wave === 20 && s.bestStored.victories === 1 && s.hud.best === '20웨이브 (승리 1회)', '최고 기록 갱신: 20웨이브 (승리 1회)');
  await page.screenshot({ path: path.join(__dirname, 'shot_victory.png') });
  await page.click('#btnContinue');
  s = await snap(page);
  check(!s.victory && s.endless && s.overlayHidden && s.sound.musicOn, '계속하기를 누르면 끝없는 모드 + 배경음 다시');
  await page.waitForFunction(() => __game.wave === 21 && __game.waveActive, { timeout: 30000 });
  s = await snap(page);
  check(s.wave === 21 && s.hud.wave === '21 (끝없는 모드)', '21웨이브가 시작되고 표시가 "21 (끝없는 모드)"');
  await page.screenshot({ path: path.join(__dirname, 'shot_end.png') });

  await page.click('#btnPause');
  check(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
