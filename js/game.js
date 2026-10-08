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
  const START_GOLD = 120;   // 시작 골드
  const SELL_RATIO = 0.7;   // 타워를 팔면 가격의 70%를 돌려받음
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
    kills: document.getElementById('kills'),
    towers: document.getElementById('towers'),
    gold: document.getElementById('gold'),
    towerCost: document.getElementById('towerCost'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnRestart: document.getElementById('btnRestart'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    towerIcon: document.getElementById('towerIcon'),
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

  // 길에 해당하는 칸 모음 (그리기, 설치 금지 판단용)
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
  const inBoard = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

  // ---------- 몬스터(적) 종류 ----------
  const ENEMY_TYPES = {
    mongle: { sprite: 'mongle', speed: 55, hp: 20, color: '#5ad66b', reward: 6 },  // 느리지만 튼튼
    bulti:  { sprite: 'bulti',  speed: 90, hp: 12, color: '#ff7a2a', reward: 8 },  // 빠르지만 약함
  };
  // 웨이브를 막아내면 받는 보너스 골드
  const waveBonus = (n) => 20 + n * 5;

  // ---------- 타워(우리 편) 종류 ----------
  const TOWER_TYPES = {
    saessak: {
      sprite: 'saessak', name: '새싹이',
      cost: 50,          // 가격(골드)
      range: 100,        // 사거리(픽셀) = 2.5칸
      damage: 6,         // 씨앗 한 발 공격력
      cooldown: 0.6,     // 발사 간격(초)
      bulletSpeed: 280,  // 씨앗 속도
      bulletColor: '#9be36b',
    },
  };

  const spriteCache = {};
  for (const key of Object.keys(SPRITES)) spriteCache[key] = buildSprite(SPRITES[key], SPRITE_SCALE);

  // 패널에 타워 얼굴 그려두기
  {
    const g = ui.towerIcon.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(spriteCache.saessak, 0, 0);
  }

  // ---------- 적 ----------
  class Enemy {
    constructor(type, wave) {
      const def = ENEMY_TYPES[type];
      this.type = type;
      this.speed = def.speed * (1 + (wave - 1) * 0.06);           // 웨이브가 오를수록 조금씩 빨라짐
      this.maxHp = Math.round(def.hp * (1 + (wave - 1) * 0.2));   // 체력도 조금씩 늘어남
      this.hp = this.maxHp;
      this.x = WAYPOINTS[0].x;
      this.y = WAYPOINTS[0].y;
      this.wp = 1;            // 다음에 갈 지점 번호
      this.dir = 1;           // 1이면 오른쪽 보기, -1이면 왼쪽 보기
      this.reached = false;   // 마을에 도착했는지
      this.dead = false;      // 쓰러졌는지
      this.traveled = 0;      // 지금까지 걸어온 거리 (타워가 "가장 앞선 적"을 고를 때 씀)
      this.t = Math.random() * 10; // 애니메이션용 시계
    }

    update(dt) {
      let remaining = this.speed * dt; // 이번 프레임에 갈 수 있는 거리
      const budget = remaining;
      while (remaining > 0 && this.wp < WAYPOINTS.length) {
        const target = WAYPOINTS[this.wp];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dx !== 0) this.dir = dx > 0 ? 1 : -1;
        if (dist <= remaining) {
          this.x = target.x; this.y = target.y;
          this.wp += 1;
          remaining -= dist;
        } else {
          this.x += (dx / dist) * remaining;
          this.y += (dy / dist) * remaining;
          remaining = 0;
        }
      }
      this.traveled += budget - remaining;
      if (this.wp >= WAYPOINTS.length) this.reached = true;
      this.t += dt;
    }

    takeDamage(amount) {
      if (this.dead || this.reached) return;
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        state.kills += 1;
        const reward = ENEMY_TYPES[this.type].reward;
        state.gold += reward;
        spawnParticles(this.x, this.y, ENEMY_TYPES[this.type].color, 12, 130);
        spawnFloater(this.x, this.y - 16, '+' + reward, '#ffd54f');
      }
    }
  }

  // ---------- 타워 ----------
  class Tower {
    constructor(c, r, type) {
      this.c = c; this.r = r;
      this.type = type;
      this.def = TOWER_TYPES[type];
      this.x = c * TILE + TILE / 2;
      this.y = r * TILE + TILE / 2;
      this.cooldown = 0;   // 다음 발사까지 남은 시간
      this.recoil = 0;     // 발사 직후 살짝 움찔하는 효과
      this.dir = 1;
      this.target = null;
    }

    update(dt) {
      this.cooldown -= dt;
      if (this.recoil > 0) this.recoil -= dt;

      // 사거리 안에서 가장 멀리 걸어온(마을에 가장 가까운) 적을 고릅니다
      let best = null;
      for (const e of state.enemies) {
        if (e.dead || e.reached) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= this.def.range && (!best || e.traveled > best.traveled)) best = e;
      }
      this.target = best;
      if (!best) return;

      this.dir = best.x >= this.x ? 1 : -1;
      if (this.cooldown <= 0) {
        state.bullets.push(new Bullet(this, best));
        this.cooldown = this.def.cooldown;
        this.recoil = 0.12;
      }
    }
  }

  // ---------- 씨앗(총알) ----------
  class Bullet {
    constructor(tower, target) {
      this.x = tower.x;
      this.y = tower.y - 8;
      this.target = target;
      this.speed = tower.def.bulletSpeed;
      this.damage = tower.def.damage;
      this.color = tower.def.bulletColor;
      this.done = false;
    }

    update(dt) {
      const t = this.target;
      if (t.dead || t.reached) { this.done = true; return; } // 목표가 사라지면 씨앗도 사라짐
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (dist <= step + 4) {
        t.takeDamage(this.damage);
        spawnParticles(t.x, t.y, this.color, 4, 60);
        this.done = true;
        return;
      }
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  // ---------- 떠오르는 숫자 ("+6" 같은 것) ----------
  function spawnFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  // ---------- 반짝이 효과 ----------
  function spawnParticles(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.3 + Math.random() * 0.7);
      const life = 0.35 + Math.random() * 0.35;
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, maxLife: life, color, size: 3 + Math.floor(Math.random() * 3) });
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
    state.towers = [];
    state.bullets = [];
    state.particles = [];
    state.floaters = [];      // "+6" 처럼 떠오르는 숫자들
    state.kills = 0;
    state.gold = START_GOLD;
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
    state.hover = null;       // 마우스가 올라간 칸
    state.selected = null;    // 클릭해서 고른 타워
    state.notice = '';        // 화면 아래 짧은 안내 문구
    state.noticeTimer = 0;
  }
  resetState();

  function showNotice(text, seconds) {
    state.notice = text;
    state.noticeTimer = seconds || 1.5;
  }

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
    state.selected = null;
    ui.overlayTitle.textContent = '패배!';
    ui.overlayText.textContent = '몬스터가 마을에 도착했어요. ' + state.wave + '웨이브까지 버텼고, ' + state.kills + '마리를 물리쳤어요. (타워 ' + state.towers.length + '개, 남은 골드 ' + state.gold + ')';
    ui.overlay.classList.remove('hidden');
    updateHud();
  }

  // ---------- 타워 설치 / 제거 ----------
  function towerAt(c, r) {
    return state.towers.find((t) => t.c === c && t.r === r) || null;
  }
  function canPlace(c, r) {
    return inBoard(c, r) && !isPath(c, r) && !towerAt(c, r);
  }
  function canAfford(type) {
    return state.gold >= TOWER_TYPES[type].cost;
  }
  function sellPrice(t) {
    return Math.floor(t.def.cost * SELL_RATIO);
  }
  function placeTower(c, r, type) {
    if (!canPlace(c, r)) return null;
    const def = TOWER_TYPES[type];
    if (!canAfford(type)) {
      showNotice('골드가 부족해요 (' + def.name + ' ' + def.cost + '골드)');
      return null;
    }
    state.gold -= def.cost;
    const t = new Tower(c, r, type);
    state.towers.push(t);
    spawnParticles(t.x, t.y, '#7fe36b', 8, 70);
    spawnFloater(t.x, t.y - 20, '-' + def.cost, '#ff8a80');
    showNotice(def.name + '를 심었어요! (-' + def.cost + '골드)');
    updateHud();
    return t;
  }
  function removeTower(t) {
    const refund = sellPrice(t);
    state.gold += refund;
    state.towers = state.towers.filter((x) => x !== t);
    if (state.selected === t) state.selected = null;
    spawnParticles(t.x, t.y, '#b07a3c', 6, 60);
    spawnFloater(t.x, t.y - 20, '+' + refund, '#ffd54f');
    showNotice('타워를 팔아서 ' + refund + '골드를 돌려받았어요');
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

    // 2) 타워가 적을 고르고 씨앗 발사
    for (const t of state.towers) t.update(dt);

    // 3) 씨앗 날아가기 + 맞추기
    for (const b of state.bullets) b.update(dt);
    state.bullets = state.bullets.filter((b) => !b.done);

    // 4) 몬스터 이동
    for (const e of state.enemies) e.update(dt);

    // 5) 마을 도착 -> 생명 감소 / 쓰러진 적 치우기
    const arrived = state.enemies.filter((e) => e.reached && !e.dead);
    state.enemies = state.enemies.filter((e) => !e.reached && !e.dead);
    if (arrived.length > 0) {
      state.lives -= arrived.length;
      state.hitFlash = 0.4;
      if (state.lives <= 0) {
        state.lives = 0;
        gameOver();
        return;
      }
    }

    // 6) 웨이브가 끝나면 잠깐 쉬고 다음 웨이브
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.waveActive = false;
      state.breakTimer = BREAK_TIME;
      const bonus = waveBonus(state.wave);
      state.gold += bonus;
      showNotice(state.wave + '웨이브 방어 성공! 보너스 +' + bonus + '골드', 2.5);
    }
    if (state.started && !state.waveActive) {
      state.breakTimer -= dt;
      if (state.breakTimer <= 0) startWave();
    }

    if (state.hitFlash > 0) state.hitFlash -= dt;
    state.time += dt;
    updateHud();
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt; // 중력처럼 아래로 떨어짐
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floaters) {
      f.y -= 28 * dt; // 위로 천천히 떠오름
      f.life -= dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
  }

  // ---------- 그리기 ----------
  function drawTile(c, r) {
    const x = c * TILE, y = r * TILE;
    if (isPath(c, r)) {
      ctx.fillStyle = '#d2b073';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#b8955a';
      const n = (c * 7 + r * 13) % 4;
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x + 4 + ((c * 31 + i * 17 + r * 5) % 32), y + 4 + ((r * 23 + i * 11 + c * 3) % 32), 4, 4);
      }
      ctx.fillStyle = '#a07f48';
      if (!isPath(c, r - 1)) ctx.fillRect(x, y, TILE, 3);
      if (!isPath(c, r + 1)) ctx.fillRect(x, y + TILE - 3, TILE, 3);
      if (!isPath(c - 1, r)) ctx.fillRect(x, y, 3, TILE);
      if (!isPath(c + 1, r)) ctx.fillRect(x + TILE - 3, y, 3, TILE);
    } else {
      ctx.fillStyle = (c + r) % 2 === 0 ? '#72cf5f' : '#68c356';
      ctx.fillRect(x, y, TILE, TILE);
      if ((c * 5 + r * 3) % 7 === 0) {
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
    ctx.fillStyle = '#f6dfae';
    ctx.fillRect(x + 6, y + 16, 28, 22);
    ctx.fillStyle = '#d9534f';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 18);
    ctx.lineTo(x + 20, y + 3);
    ctx.lineTo(x + 38, y + 18);
    ctx.closePath();
    ctx.fill();
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

  function drawSprite(img, cx, cy, dir, alpha) {
    const w = img.width, h = img.height;
    const dx = Math.round(cx - w / 2);
    const dy = Math.round(cy - h / 2);
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (dir < 0) {
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, dx, dy);
    }
    ctx.restore();
  }

  function drawShadow(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.round(x - 12), Math.round(y + 13), 24, 4);
  }

  function drawEnemy(e) {
    const img = spriteCache[ENEMY_TYPES[e.type].sprite];
    const bob = Math.round(Math.sin(e.t * 10) * 2);
    drawShadow(e.x, e.y);
    drawSprite(img, e.x, e.y + bob, e.dir);
    // 체력 막대 (다친 적만)
    if (e.hp < e.maxHp) {
      const bx = Math.round(e.x - 13), by = Math.round(e.y - 24 + bob);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(bx, by, 26, 5);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(bx + 1, by + 1, 24, 3);
      ctx.fillStyle = '#43d16a';
      ctx.fillRect(bx + 1, by + 1, Math.round(24 * (e.hp / e.maxHp)), 3);
    }
  }

  function drawTower(t) {
    const img = spriteCache[t.def.sprite];
    const hop = t.recoil > 0 ? -2 : 0;
    drawShadow(t.x, t.y);
    drawSprite(img, t.x, t.y + hop, t.dir);
  }

  function drawRange(x, y, range, ok) {
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(255,255,255,0.14)' : 'rgba(255,80,80,0.18)';
    ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.75)' : 'rgba(255,80,80,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawBullet(b) {
    const x = Math.round(b.x), y = Math.round(b.y);
    ctx.fillStyle = '#1f4d2a';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = b.color;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.maxLife * 1.5));
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y) + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
    }
    ctx.globalAlpha = 1;
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

  function drawNotice() {
    if (state.noticeTimer <= 0 || !state.notice) return;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(state.notice).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width / 2 - w / 2, canvas.height - 44, w, 28);
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(state.notice, canvas.width / 2, canvas.height - 25);
  }

  function render() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawTile(c, r);
    drawCave();
    drawHouse();

    // 사거리 표시: 고른 타워, 또는 설치 미리보기
    const hoverPlaceable = state.hover && !state.gameOver && canPlace(state.hover.c, state.hover.r);
    const affordable = canAfford('saessak');
    if (state.selected) drawRange(state.selected.x, state.selected.y, state.selected.def.range, true);
    if (hoverPlaceable) {
      // 골드가 모자라면 빨간 원으로 보여줌
      drawRange(state.hover.c * TILE + TILE / 2, state.hover.r * TILE + TILE / 2, TOWER_TYPES.saessak.range, affordable);
    } else if (state.hover && !state.gameOver && !towerAt(state.hover.c, state.hover.r)) {
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(state.hover.c * TILE, state.hover.r * TILE, TILE, TILE);
    }

    // 타워와 몬스터를 함께 아래쪽부터 정렬해서 그리기 (아래에 있는 게 앞에 보이도록)
    const units = [];
    for (const t of state.towers) units.push({ y: t.y, draw: () => drawTower(t) });
    for (const e of state.enemies) units.push({ y: e.y, draw: () => drawEnemy(e) });
    units.sort((a, b) => a.y - b.y);
    for (const u of units) u.draw();

    for (const b of state.bullets) drawBullet(b);
    drawParticles();
    drawFloaters();

    // 설치 미리보기 그림(반투명). 골드가 모자라면 더 흐리게
    if (hoverPlaceable) {
      drawSprite(spriteCache.saessak, state.hover.c * TILE + TILE / 2, state.hover.r * TILE + TILE / 2, 1, affordable ? 0.55 : 0.25);
    }

    if (state.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + ((state.hitFlash / 0.4) * 0.35) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!state.started) {
      drawMessage('풀밭을 클릭해 새싹이를 심고, 웨이브 시작을 눌러주세요', '몬스터가 마을에 도착하면 생명이 줄어요');
    } else if (!state.waveActive && !state.gameOver) {
      drawMessage('다음 웨이브까지 ' + Math.ceil(state.breakTimer) + '초');
    } else if (state.paused) {
      drawMessage('일시정지');
    }
    drawNotice();
  }

  // ---------- 화면 숫자 갱신 ----------
  function updateHud() {
    ui.lives.textContent = state.lives;
    ui.wave.textContent = state.wave;
    ui.enemies.textContent = state.enemies.length + state.spawnQueue.length;
    ui.kills.textContent = state.kills;
    ui.towers.textContent = state.towers.length;
    ui.gold.textContent = state.gold;
    ui.towerCost.textContent = TOWER_TYPES.saessak.cost + '골드';
    ui.towerCost.classList.toggle('poor', !canAfford('saessak'));
    ui.btnStart.textContent = state.started ? '다음 웨이브' : '웨이브 시작';
    ui.btnStart.disabled = state.waveActive || state.gameOver;
    ui.btnPause.textContent = state.paused ? '계속하기' : '일시정지';
    ui.btnSpeed.textContent = '배속 x' + state.speed;
  }

  // ---------- 마우스 ----------
  function tileFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * canvas.width / rect.width;
    const y = (ev.clientY - rect.top) * canvas.height / rect.height;
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  }
  canvas.addEventListener('mousemove', (ev) => {
    const t = tileFromEvent(ev);
    state.hover = inBoard(t.c, t.r) ? t : null;
  });
  canvas.addEventListener('mouseleave', () => { state.hover = null; });
  canvas.addEventListener('click', (ev) => {
    if (state.gameOver) return;
    const t = tileFromEvent(ev);
    if (!inBoard(t.c, t.r)) return;
    const existing = towerAt(t.c, t.r);
    if (existing) {
      state.selected = state.selected === existing ? null : existing;
      return;
    }
    if (canPlace(t.c, t.r)) {
      placeTower(t.c, t.r, 'saessak');
      state.selected = null;
    } else {
      showNotice('길 위에는 타워를 놓을 수 없어요');
    }
  });
  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (state.gameOver) return;
    const t = tileFromEvent(ev);
    const existing = towerAt(t.c, t.r);
    if (existing) removeTower(existing);
  });

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
    updateHud();
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
    updateParticles(dt * (state.paused ? 0 : state.speed));
    if (state.noticeTimer > 0) state.noticeTimer -= dt;
    render();
    requestAnimationFrame(frame);
  }
  updateHud();
  requestAnimationFrame(frame);
})();
