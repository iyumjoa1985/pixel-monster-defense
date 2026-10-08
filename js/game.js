(() => {
  'use strict';

  // ---------- 디버그: 오류가 나면 화면 아래에 글로 남깁니다 ----------
  window.addEventListener('error', (e) => {
    const el = document.getElementById('errlog');
    el.hidden = false;
    el.textContent += '오류: ' + e.message + '\n';
  });

  // ---------- 기본 설정 ----------
  const TILE = 40;          // 칸 하나 크기(픽셀)
  const COLS = 16;          // 가로 칸 수
  const ROWS = 12;          // 세로 칸 수
  const START_LIVES = 10;   // 시작 생명
  const SPRITE_SCALE = 3;   // 12픽셀 그림을 3배로 키워 36픽셀로
  const SPAWN_GAP = 0.9;    // 몬스터가 나오는 간격(초)
  const BREAK_TIME = 3;     // 웨이브 사이 쉬는 시간(초)

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ui = {
    lives: document.getElementById('lives'),
    wave: document.getElementById('wave'),
    enemies: document.getElementById('enemies'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnRestart: document.getElementById('btnRestart'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
  };

  // ---------- 경로 ----------
  // 몬스터가 지나가는 길. (가로칸, 세로칸) 순서.
  // 왼쪽 동굴에서 나와서 구불구불 돌아 오른쪽 아래 마을에 도착합니다.
  const PATH_TILES = [
    [-1, 2], [3, 2], [3, 6], [8, 6], [8, 1], [12, 1], [12, 8], [5, 8], [5, 10], [15, 10],
  ];
  const SPAWN_TILE = [0, 2];   // 동굴 위치
  const HOME_TILE = [15, 10];  // 마을 위치

  // 칸 좌표 -> 픽셀 좌표(칸의 한가운데)
  const WAYPOINTS = PATH_TILES.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));

  // 길에 해당하는 칸 모음 (그리기용)
  const pathTiles = new Set();
  for (let i = 0; i < PATH_TILES.length - 1; i++) {
    const [c1, r1] = PATH_TILES[i];
    const [c2, r2] = PATH_TILES[i + 1];
    const dc = Math.sign(c2 - c1);
    const dr = Math.sign(r2 - r1);
    let c = c1, r = r1;
    for (;;) {
      pathTiles.add(c + ',' + r);
      if (c === c2 && r === r2) break;
      c += dc; r += dr;
    }
  }
  const isPath = (c, r) => pathTiles.has(c + ',' + r);

  // ---------- 몬스터 종류 ----------
  const ENEMY_TYPES = {
    mongle: { sprite: 'mongle', speed: 55, hp: 20 },  // 느리지만 튼튼
    bulti:  { sprite: 'bulti',  speed: 90, hp: 12 },  // 빠르지만 약함
  };
  const spriteCache = {};
  for (const key of Object.keys(SPRITES)) spriteCache[key] = buildSprite(SPRITES[key], SPRITE_SCALE);

  class Enemy {
    constructor(type, wave) {
      const def = ENEMY_TYPES[type];
      this.type = type;
      this.speed = def.speed * (1 + (wave - 1) * 0.06); // 웨이브가 오를수록 조금씩 빨라짐
      this.maxHp = def.hp;
      this.hp = def.hp;
      this.x = WAYPOINTS[0].x;
      this.y = WAYPOINTS[0].y;
      this.wp = 1;            // 다음에 갈 지점 번호
      this.dir = 1;           // 1이면 오른쪽 보기, -1이면 왼쪽 보기
      this.reached = false;   // 마을에 도착했는지
      this.t = Math.random() * 10; // 애니메이션용 시계
    }

    update(dt) {
      let remaining = this.speed * dt; // 이번 프레임에 갈 수 있는 거리
      while (remaining > 0 && this.wp < WAYPOINTS.length) {
        const target = WAYPOINTS[this.wp];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dx !== 0) this.dir = dx > 0 ? 1 : -1;
        if (dist <= remaining) {
          // 지점에 도착 -> 다음 지점으로
          this.x = target.x; this.y = target.y;
          this.wp += 1;
          remaining -= dist;
        } else {
          this.x += (dx / dist) * remaining;
          this.y += (dy / dist) * remaining;
          remaining = 0;
        }
      }
      if (this.wp >= WAYPOINTS.length) this.reached = true;
      this.t += dt;
    }
  }

  // ---------- 웨이브 구성 ----------
  function waveComposition(n) {
    const list = [];
    const count = 5 + n * 2;           // 1웨이브 7마리, 2웨이브 9마리 ...
    for (let i = 0; i < count; i++) {
      const useBulti = n >= 3 && i % 3 === 2; // 3웨이브부터 불티가 섞여 나옴
      list.push(useBulti ? 'bulti' : 'mongle');
    }
    return list;
  }

  // ---------- 게임 상태 ----------
  const state = {};
  function resetState() {
    state.lives = START_LIVES;
    state.wave = 0;
    state.enemies = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.started = false;
    state.waveActive = false;
    state.breakTimer = 0;
    state.paused = false;
    state.speed = state.speed || 1;
    state.gameOver = false;
    state.hitFlash = 0;
    state.time = 0;
  }
  resetState();

  function startWave() {
    state.wave += 1;
    state.spawnQueue = waveComposition(state.wave);
    state.spawnTimer = 0;
    state.waveActive = true;
    state.breakTimer = 0;
    state.started = true;
    updateHud();
  }

  function gameOver() {
    state.gameOver = true;
    ui.overlayTitle.textContent = '패배!';
    ui.overlayText.textContent = '몬스터가 마을에 도착했어요. ' + state.wave + '웨이브까지 버텼어요.';
    ui.overlay.classList.remove('hidden');
    updateHud();
  }

  // ---------- 매 프레임 계산 ----------
  function update(dt) {
    // 1) 몬스터 소환
    if (state.waveActive && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.enemies.push(new Enemy(state.spawnQueue.shift(), state.wave));
        state.spawnTimer = SPAWN_GAP;
      }
    }

    // 2) 몬스터 이동
    for (const e of state.enemies) e.update(dt);

    // 3) 마을 도착 -> 생명 감소
    const arrived = state.enemies.filter((e) => e.reached);
    if (arrived.length > 0) {
      state.enemies = state.enemies.filter((e) => !e.reached);
      state.lives -= arrived.length;
      state.hitFlash = 0.4;
      if (state.lives <= 0) {
        state.lives = 0;
        gameOver();
        return;
      }
    }

    // 4) 웨이브가 끝나면 잠깐 쉬고 다음 웨이브
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.waveActive = false;
      state.breakTimer = BREAK_TIME;
    }
    if (state.started && !state.waveActive) {
      state.breakTimer -= dt;
      if (state.breakTimer <= 0) startWave();
    }

    if (state.hitFlash > 0) state.hitFlash -= dt;
    state.time += dt;
    updateHud();
  }

  // ---------- 그리기 ----------
  function drawTile(c, r) {
    const x = c * TILE, y = r * TILE;
    if (isPath(c, r)) {
      ctx.fillStyle = '#d2b073';
      ctx.fillRect(x, y, TILE, TILE);
      // 돌멩이 몇 개 (칸마다 항상 같은 자리에)
      ctx.fillStyle = '#b8955a';
      const n = (c * 7 + r * 13) % 4;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x + 4 + ((c * 31 + i * 17 + r * 5) % 32), y + 4 + ((r * 23 + i * 11 + c * 3) % 32), 4, 4);
      }
      // 풀과 맞닿은 가장자리는 조금 어둡게
      ctx.fillStyle = '#a07f48';
      if (!isPath(c, r - 1)) ctx.fillRect(x, y, TILE, 3);
      if (!isPath(c, r + 1)) ctx.fillRect(x, y + TILE - 3, TILE, 3);
      if (!isPath(c - 1, r)) ctx.fillRect(x, y, 3, TILE);
      if (!isPath(c + 1, r)) ctx.fillRect(x + TILE - 3, y, 3, TILE);
    } else {
      ctx.fillStyle = (c + r) % 2 === 0 ? '#72cf5f' : '#68c356';
      ctx.fillRect(x, y, TILE, TILE);
      if ((c * 5 + r * 3) % 7 === 0) { // 가끔 풀 포기
        ctx.fillStyle = '#4fa844';
        ctx.fillRect(x + 12, y + 20, 4, 8);
        ctx.fillRect(x + 20, y + 16, 4, 12);
      }
    }
  }

  function drawCave() {
    const x = SPAWN_TILE[0] * TILE, y = SPAWN_TILE[1] * TILE;
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(x, y + 4, TILE, TILE - 4);
    ctx.fillStyle = '#6b6b6b';
    ctx.fillRect(x + 3, y + 7, TILE - 6, TILE - 10);
    ctx.fillStyle = '#151515';
    ctx.fillRect(x + 10, y + 16, 20, 24);
    ctx.fillRect(x + 14, y + 12, 12, 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('동굴', x + TILE / 2, y + 2);
  }

  function drawHouse() {
    const x = HOME_TILE[0] * TILE, y = HOME_TILE[1] * TILE;
    // 벽
    ctx.fillStyle = '#f6dfae';
    ctx.fillRect(x + 6, y + 16, 28, 22);
    // 지붕
    ctx.fillStyle = '#d9534f';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 18);
    ctx.lineTo(x + 20, y + 3);
    ctx.lineTo(x + 38, y + 18);
    ctx.closePath();
    ctx.fill();
    // 문, 창문
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x + 17, y + 26, 8, 12);
    ctx.fillStyle = '#9ad7ff';
    ctx.fillRect(x + 9, y + 20, 6, 6);
    ctx.fillRect(x + 25, y + 20, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('마을', x + TILE / 2, y - 2);
  }

  function drawEnemy(e) {
    const img = spriteCache[ENEMY_TYPES[e.type].sprite];
    const w = img.width, h = img.height;
    const bob = Math.round(Math.sin(e.t * 10) * 2); // 통통 튀는 느낌
    const dx = Math.round(e.x - w / 2);
    const dy = Math.round(e.y - h / 2 + bob);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.round(e.x - 12), Math.round(e.y + h / 2 - 5), 24, 4);
    ctx.save();
    if (e.dir < 0) { // 왼쪽으로 갈 때는 그림을 뒤집기
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, dx, dy);
    }
    ctx.restore();
  }

  function drawMessage(text, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(canvas.width / 2 - 170, 14, 340, sub ? 56 : 36);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(text, canvas.width / 2, 38);
    if (sub) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(sub, canvas.width / 2, 58);
    }
  }

  function render() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawTile(c, r);
    drawCave();
    drawHouse();

    // 아래쪽에 있는 몬스터가 앞에 보이도록 정렬
    const sorted = state.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of sorted) drawEnemy(e);

    if (state.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + ((state.hitFlash / 0.4) * 0.35) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!state.started) {
      drawMessage('웨이브 시작 버튼을 눌러주세요', '몬스터가 마을에 도착하면 생명이 줄어요');
    } else if (!state.waveActive && !state.gameOver) {
      drawMessage('다음 웨이브까지 ' + Math.ceil(state.breakTimer) + '초');
    } else if (state.paused) {
      drawMessage('일시정지');
    }
  }

  // ---------- 화면 숫자 갱신 ----------
  function updateHud() {
    ui.lives.textContent = state.lives;
    ui.wave.textContent = state.wave;
    ui.enemies.textContent = state.enemies.length + state.spawnQueue.length;
    ui.btnStart.textContent = state.started ? '다음 웨이브' : '웨이브 시작';
    ui.btnStart.disabled = state.waveActive || state.gameOver;
    ui.btnPause.textContent = state.paused ? '계속하기' : '일시정지';
    ui.btnSpeed.textContent = '배속 x' + state.speed;
  }

  // ---------- 버튼 ----------
  ui.btnStart.addEventListener('click', () => {
    if (state.gameOver || state.waveActive) return;
    startWave();
  });
  ui.btnPause.addEventListener('click', () => {
    if (state.gameOver) return;
    state.paused = !state.paused;
    updateHud();
  });
  ui.btnSpeed.addEventListener('click', () => {
    state.speed = state.speed >= 3 ? 1 : state.speed + 1;
    updateHud();
  });
  ui.btnRestart.addEventListener('click', () => {
    resetState();
    ui.overlay.classList.add('hidden');
    startWave();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); ui.btnPause.click(); }
  });

  // ---------- 테스트용 주소 옵션 (예: index.html?autostart=1&speed=3) ----------
  const params = new URLSearchParams(location.search);
  if (params.get('speed')) state.speed = Math.max(1, Number(params.get('speed')) || 1);
  if (params.get('autostart') === '1') startWave();
  window.__game = state; // 자동 테스트에서 상태를 들여다보기 위한 창구

  // ---------- 게임 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); // 너무 큰 시간 점프는 막기
    last = now;
    if (state.started && !state.paused && !state.gameOver) update(dt * state.speed);
    render();
    requestAnimationFrame(frame);
  }
  updateHud();
  requestAnimationFrame(frame);
})();
