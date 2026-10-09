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
  // 난이도: 생명, 시작 골드, 몬스터 체력 배율, 몬스터 속도 배율, 처치 골드 배율
  const DIFFICULTIES = {
    easy:   { label: '쉬움',   lives: 20, gold: 200, hp: 0.7,  speed: 0.9, reward: 1.3 },
    normal: { label: '중간',   lives: 15, gold: 150, hp: 0.85, speed: 1,   reward: 1.15 },
    hard:   { label: '어려움', lives: 10, gold: 120, hp: 1,    speed: 1,   reward: 1 },
  };
  const DIFF_KEY = 'pixelDefense.difficulty';
  let difficulty = 'normal';
  try { if (DIFFICULTIES[localStorage.getItem(DIFF_KEY)]) difficulty = localStorage.getItem(DIFF_KEY); } catch (e) { /* 기본값 사용 */ }
  const diff = () => DIFFICULTIES[difficulty];
  const SELL_RATIO = 0.7;   // 타워를 팔면 지금까지 쓴 골드의 70%를 돌려받음
  const SPRITE_SCALE = 3;   // 12픽셀 그림을 3배로 키워 36픽셀로
  const SPAWN_GAP = 0.9;    // 몬스터가 나오는 간격(초)
  const BREAK_TIME = 3;     // 웨이브 사이 쉬는 시간(초)
  const VICTORY_WAVE = 20;  // 이 웨이브까지 막아내면 승리

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
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnSpeed: document.getElementById('btnSpeed'),
    btnRestart: document.getElementById('btnRestart'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    cards: document.getElementById('cards'),
    info: document.getElementById('info'),
    infoIcon: document.getElementById('infoIcon'),
    infoText: document.getElementById('infoText'),
    btnEvolve: document.getElementById('btnEvolve'),
    btnSell: document.getElementById('btnSell'),
    btnContinue: document.getElementById('btnContinue'),
    btnMute: document.getElementById('btnMute'),
    btnFull: document.getElementById('btnFull'),
    best: document.getElementById('best'),
    placeBar: document.getElementById('placeBar'),
    placeText: document.getElementById('placeText'),
    btnPlaceOk: document.getElementById('btnPlaceOk'),
    btnPlaceCancel: document.getElementById('btnPlaceCancel'),
    btnMp: document.getElementById('btnMp'),
    mpStatus: document.getElementById('mpStatus'),
    mpPanel: document.getElementById('mpPanel'),
    mpHostInfo: document.getElementById('mpHostInfo'),
    mpCode: document.getElementById('mpCode'),
    mpLink: document.getElementById('mpLink'),
    mpJoinCode: document.getElementById('mpJoinCode'),
    mpMessage: document.getElementById('mpMessage'),
    btnMpHost: document.getElementById('btnMpHost'),
    btnMpJoin: document.getElementById('btnMpJoin'),
    btnMpCopy: document.getElementById('btnMpCopy'),
    btnMpShare: document.getElementById('btnMpShare'),
    btnMpLeave: document.getElementById('btnMpLeave'),
    btnMpClose: document.getElementById('btnMpClose'),
    diffButtons: Array.from(document.querySelectorAll('#diffBar .diff')),
    diffDesc: document.getElementById('diffDesc'),
  };

  // ---------- 최고 기록 (난이도별로 따로, 브라우저에 저장되어 다음에 켜도 남아요) ----------
  const bestKey = () => 'pixelDefense.best.' + difficulty;
  function loadBest() {
    try {
      const b = JSON.parse(localStorage.getItem(bestKey()) || 'null');
      if (b && typeof b.wave === 'number') return { wave: b.wave, kills: b.kills || 0, victories: b.victories || 0 };
    } catch (e) { /* 저장소를 못 쓰면 기록 없음으로 */ }
    return { wave: 0, kills: 0, victories: 0 };
  }
  function saveBest() {
    try { localStorage.setItem(bestKey(), JSON.stringify(best)); } catch (e) { /* 무시 */ }
  }
  let best = loadBest();
  // 게임이 끝났을 때 기록 갱신. 최고 웨이브가 올라갔으면 true
  function recordResult(won) {
    let improved = false;
    if (won) best.victories += 1;
    if (state.wave > best.wave) { best.wave = state.wave; improved = true; }
    if (state.kills > best.kills) best.kills = state.kills;
    saveBest();
    return improved;
  }

  // ---------- 소리: 첫 클릭/키 입력 때 켜기 (브라우저 규칙) ----------
  function ensureSound() {
    Sound.init();
    if (!state.paused) Sound.resume(); // 일시정지 중엔 클릭해도 소리를 다시 켜지 않음
  }
  window.addEventListener('pointerdown', ensureSound);
  window.addEventListener('keydown', ensureSound);
  function updateMuteLabel() {
    ui.btnMute.textContent = Sound.isMuted() ? '🔇 소리 끔' : '🔊 소리';
  }

  // ---------- 속성(타입) 상성: 불 > 풀 > 물 > 불 ----------
  const ELEMENTS = {
    grass: { label: '풀', emoji: '🌿', color: '#5ad66b' },
    fire:  { label: '불', emoji: '🔥', color: '#ff7a2a' },
    water: { label: '물', emoji: '💧', color: '#4fc3f7' },
  };
  const STRONG_AGAINST = { fire: 'grass', grass: 'water', water: 'fire' };
  function typeMultiplier(attacker, defender) {
    if (STRONG_AGAINST[attacker] === defender) return 1.5; // 효과가 굉장했다!
    if (STRONG_AGAINST[defender] === attacker) return 0.6; // 효과가 별로다...
    return 1;
  }
  const elementLabel = (el) => ELEMENTS[el].emoji + ELEMENTS[el].label;
  const BULLET_COLORS = { grass: '#9be36b', fire: '#ff8c42', water: '#5ec8ff' }; // 친구 화면에서 총알 색
  let nextId = 1; // 타워·몬스터에 붙이는 번호표 (친구 화면과 맞추는 데 씀)

  // ---------- 경로 ----------
  // 몬스터가 지나가는 길. (가로칸, 세로칸) 순서.
  // 왼쪽 동굴에서 나와서 구불구불 돌아 오른쪽 아래 마을에 도착합니다.
  const PATH_TILES = [
    [-1, 2], [3, 2], [3, 6], [8, 6], [8, 1], [12, 1], [12, 8], [5, 8], [5, 10], [15, 10],
  ];
  const SPAWN_TILE = [0, 2];   // 동굴 위치
  const HOME_TILE = [15, 10];  // 마을 위치

  const WAYPOINTS = PATH_TILES.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));

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
  // livesDamage: 마을에 도착했을 때 깎이는 생명. boss: 보스 여부
  const ENEMY_TYPES = {
    mongle:     { sprite: 'mongle',     name: '몽글이',   element: 'grass', speed: 55,  hp: 20,  reward: 6,   livesDamage: 1, color: '#5ad66b' }, // 느리지만 튼튼
    bulti:      { sprite: 'bulti',      name: '불티',     element: 'fire',  speed: 90,  hp: 12,  reward: 8,   livesDamage: 1, color: '#ff7a2a' }, // 빠르지만 약함
    mulkeong:   { sprite: 'mulkeong',   name: '물컹이',   element: 'water', speed: 65,  hp: 26,  reward: 7,   livesDamage: 1, color: '#4fc3f7' }, // 중간 속도, 튼튼
    bug:        { sprite: 'bug',        name: '씨앗벌레', element: 'grass', speed: 120, hp: 8,   reward: 5,   livesDamage: 1, color: '#8be34a' }, // 아주 빠름
    crab:       { sprite: 'crab',       name: '용암게',   element: 'fire',  speed: 40,  hp: 45,  reward: 10,  livesDamage: 1, color: '#d9452b' }, // 느리고 아주 튼튼
    kingmongle: { sprite: 'kingmongle', name: '왕몽글',   element: 'grass', speed: 35,  hp: 350, reward: 80,  livesDamage: 5, color: '#5ad66b', boss: true }, // 10웨이브 보스
    magma:      { sprite: 'magma',      name: '마그마왕', element: 'fire',  speed: 32,  hp: 700, reward: 150, livesDamage: 5, color: '#ff4d1f', boss: true }, // 20웨이브 보스
  };
  const waveBonus = (n) => 20 + n * 5; // 웨이브를 막아내면 받는 보너스 골드

  // ---------- 타워 종류 (각각 3단계 진화) ----------
  const TOWER_TYPES = {
    grass: {
      element: 'grass', key: '1', desc: '골고루 쓸만한 씨앗 사수',
      stages: [
        { name: '새싹이', sprite: 'saessak',   cost: 50,  range: 100, damage: 6,  cooldown: 0.6,  bulletSpeed: 280, bulletColor: '#9be36b' },
        { name: '잎사귀', sprite: 'ipsagwi',   cost: 60,  range: 110, damage: 10, cooldown: 0.55, bulletSpeed: 300, bulletColor: '#7fe36b' },
        { name: '꽃나래', sprite: 'kkotnarae', cost: 100, range: 125, damage: 17, cooldown: 0.5,  bulletSpeed: 320, bulletColor: '#ff9ad5' },
      ],
    },
    fire: {
      element: 'fire', key: '2', desc: '가까운 적을 빠르게 연타',
      stages: [
        { name: '불씨',   sprite: 'bulssi',    cost: 70,  range: 80,  damage: 4,  cooldown: 0.3,  bulletSpeed: 320, bulletColor: '#ffb347' },
        { name: '불꼬리', sprite: 'bulkkori',  cost: 80,  range: 90,  damage: 7,  cooldown: 0.27, bulletSpeed: 340, bulletColor: '#ff8c42' },
        { name: '화르르', sprite: 'hwareureu', cost: 130, range: 100, damage: 12, cooldown: 0.24, bulletSpeed: 360, bulletColor: '#ff4d1f' },
      ],
    },
    water: {
      element: 'water', key: '3', desc: '멀리서 강하게 한 발',
      stages: [
        { name: '물방울', sprite: 'mulbangul', cost: 90,  range: 150, damage: 16, cooldown: 1.4, bulletSpeed: 240, bulletColor: '#5ec8ff' },
        { name: '물결이', sprite: 'mulgyeori', cost: 100, range: 165, damage: 28, cooldown: 1.3, bulletSpeed: 260, bulletColor: '#5ec8ff' },
        { name: '파도리', sprite: 'padori',    cost: 160, range: 180, damage: 48, cooldown: 1.2, bulletSpeed: 280, bulletColor: '#bfe9ff' },
      ],
    },
    // slow: 맞은 적이 duration초 동안 factor배 속도로 느려짐
    ice: {
      element: 'water', key: '4', desc: '맞은 적을 느리게',
      stages: [
        { name: '눈송이',   sprite: 'nunsongi',   cost: 80,  range: 110, damage: 5,  cooldown: 0.9,  bulletSpeed: 260, bulletColor: '#eef8ff', slow: { factor: 0.6, duration: 1.5 } },
        { name: '서리토끼', sprite: 'seoritokki', cost: 90,  range: 120, damage: 9,  cooldown: 0.85, bulletSpeed: 280, bulletColor: '#eef8ff', slow: { factor: 0.5, duration: 1.8 } },
        { name: '빙하곰',   sprite: 'binghagom',  cost: 140, range: 135, damage: 15, cooldown: 0.8,  bulletSpeed: 300, bulletColor: '#bfe9ff', slow: { factor: 0.4, duration: 2.0 } },
      ],
    },
    // splash: 맞은 자리 주변(픽셀)의 적들도 함께 피해 (주변은 70%)
    bomb: {
      element: 'fire', key: '5', desc: '여러 마리를 한 번에',
      stages: [
        { name: '폭죽이',   sprite: 'pokjugi',     cost: 100, range: 120, damage: 14, cooldown: 1.6, bulletSpeed: 200, bulletColor: '#ffe14d', splash: 45 },
        { name: '불꽃놀이', sprite: 'bulkkotnori', cost: 110, range: 130, damage: 24, cooldown: 1.5, bulletSpeed: 210, bulletColor: '#ff6fa3', splash: 55 },
        { name: '화산이',   sprite: 'hwasani',     cost: 170, range: 140, damage: 40, cooldown: 1.4, bulletSpeed: 220, bulletColor: '#ff4d1f', splash: 65 },
      ],
    },
  };
  const TOWER_ORDER = ['grass', 'fire', 'water', 'ice', 'bomb'];

  const spriteCache = {};
  for (const key of Object.keys(SPRITES)) spriteCache[key] = buildSprite(SPRITES[key], SPRITE_SCALE);

  // ---------- 적 ----------
  class Enemy {
    constructor(type, wave) {
      const def = ENEMY_TYPES[type];
      this.type = type;
      this.element = def.element;
      this.speed = def.speed * (1 + (wave - 1) * 0.06) * diff().speed;            // 웨이브가 오를수록 조금씩 빨라짐
      this.maxHp = Math.max(1, Math.round(def.hp * (1 + (wave - 1) * 0.2) * diff().hp)); // 체력도 조금씩 늘어남 (난이도 반영)
      this.hp = this.maxHp;
      this.x = WAYPOINTS[0].x;
      this.y = WAYPOINTS[0].y;
      this.wp = 1;
      this.dir = 1;
      this.reached = false;
      this.dead = false;
      this.traveled = 0;
      this.effectTimer = 0;   // "굉장!" 글씨가 너무 자주 뜨지 않게 하는 시계
      this.slowTimer = 0;     // 얼음 타워에 맞아 느려진 남은 시간
      this.slowFactor = 1;    // 느려진 정도 (0.6이면 60% 속도)
      this.t = Math.random() * 10;
      this.name = def.name;
      this.boss = !!def.boss;
      this.livesDamage = def.livesDamage || 1;
      this.id = nextId++;
    }

    applySlow(factor, duration) {
      if (this.boss) factor = (1 + factor) / 2; // 보스는 절반만 느려짐
      if (this.slowTimer <= 0 || factor < this.slowFactor) this.slowFactor = factor;
      this.slowTimer = Math.max(this.slowTimer, duration);
      state.stats.slows += 1;
    }

    update(dt) {
      if (this.slowTimer > 0) this.slowTimer -= dt;
      let remaining = this.speed * dt * (this.slowTimer > 0 ? this.slowFactor : 1);
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
      if (this.effectTimer > 0) this.effectTimer -= dt;
      this.t += dt;
    }

    takeDamage(amount) {
      if (this.dead || this.reached) return;
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        state.kills += 1;
        const reward = Math.round(ENEMY_TYPES[this.type].reward * diff().reward);
        state.gold += reward;
        spawnParticles(this.x, this.y, ENEMY_TYPES[this.type].color, 12, 130);
        spawnFloater(this.x, this.y - 16, '+' + reward, '#ffd54f');
        Sound.play('kill');
      }
    }
  }

  // ---------- 타워 ----------
  class Tower {
    constructor(c, r, typeKey) {
      this.c = c; this.r = r;
      this.typeKey = typeKey;
      this.element = TOWER_TYPES[typeKey].element;
      this.stage = 0;                  // 0: 1단계, 1: 2단계, 2: 3단계(최종)
      this.invested = this.def.cost;   // 지금까지 이 타워에 쓴 골드 (팔 때 기준)
      this.x = c * TILE + TILE / 2;
      this.y = r * TILE + TILE / 2;
      this.cooldown = 0;
      this.recoil = 0;
      this.dir = 1;
      this.target = null;
      this.id = nextId++;
      this.owner = 'host';   // 누가 심었는지: 'host'(방장/혼자) 또는 'guest'(친구)
    }
    get def() { return TOWER_TYPES[this.typeKey].stages[this.stage]; }
    get isMax() { return this.stage >= TOWER_TYPES[this.typeKey].stages.length - 1; }
    get nextStage() { return this.isMax ? null : TOWER_TYPES[this.typeKey].stages[this.stage + 1]; }

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
        Sound.play('shoot_' + this.element);
      }
    }
  }

  // ---------- 씨앗/불꽃/물방울 (총알) ----------
  class Bullet {
    constructor(tower, target) {
      this.x = tower.x;
      this.y = tower.y - 8;
      this.target = target;
      this.element = tower.element;
      this.speed = tower.def.bulletSpeed;
      this.damage = tower.def.damage;
      this.color = tower.def.bulletColor;
      this.slow = tower.def.slow || null;
      this.splash = tower.def.splash || 0;
      this.done = false;
    }

    hitOne(t, ratio) {
      const mult = typeMultiplier(this.element, t.element);
      t.takeDamage(Math.max(1, Math.round(this.damage * mult * ratio)));
      if (this.slow && !t.dead) t.applySlow(this.slow.factor, this.slow.duration);
      if (mult !== 1 && t.effectTimer <= 0 && !t.dead) {
        spawnFloater(t.x, t.y - 28, mult > 1 ? '굉장!' : '별로...', mult > 1 ? '#ffd54f' : '#b0bec5');
        t.effectTimer = 0.7;
      }
      return mult;
    }

    update(dt) {
      const t = this.target;
      if (t.dead || t.reached) { this.done = true; return; }
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (dist <= step + 4) {
        Sound.play('hit');
        const hx = t.x, hy = t.y;
        const mult = this.hitOne(t, 1);
        spawnParticles(hx, hy, this.color, mult > 1 ? 7 : 4, mult > 1 ? 90 : 60);
        if (this.splash > 0) { // 폭탄: 주변 적들도 함께 (70% 피해)
          let extra = 0;
          for (const e of state.enemies) {
            if (e === t || e.dead || e.reached) continue;
            if (Math.hypot(e.x - hx, e.y - hy) <= this.splash) { this.hitOne(e, 0.7); extra += 1; }
          }
          if (extra > 0) state.stats.splashHits += extra;
          spawnParticles(hx, hy, '#ffb347', 14, 140);
          spawnParticles(hx, hy, '#ff4d1f', 8, 100);
          Sound.play('boom');
        }
        if (this.slow) spawnParticles(hx, hy, '#bfe9ff', 6, 50);
        this.done = true;
        return;
      }
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  // ---------- 떠오르는 글씨 ("+6", "굉장!") ----------
  function spawnFloater(x, y, text, color) {
    netFx('floater', [x, y, text, color]);
    state.floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  // ---------- 반짝이 효과 ----------
  function spawnParticles(x, y, color, count, power) {
    netFx('particles', [x, y, color, count, power]);
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
      let type = 'mongle';
      if (n >= 3 && i % 3 === 2) type = 'bulti';      // 3웨이브부터 불티
      if (n >= 4 && i % 4 === 1) type = 'mulkeong';   // 4웨이브부터 물컹이
      if (n >= 6 && i % 5 === 3) type = 'bug';        // 6웨이브부터 씨앗벌레
      if (n >= 8 && i % 6 === 0) type = 'crab';       // 8웨이브부터 용암게
      list.push(type);
    }
    // 10웨이브마다 맨 마지막에 보스 (10, 30, 50... 왕몽글 / 20, 40... 마그마왕)
    if (n % 10 === 0) list.push(n % 20 === 0 ? 'magma' : 'kingmongle');
    return list;
  }

  // "몽글이 7, 불티 3 + 보스 왕몽글!" 처럼 웨이브 구성을 글로 설명
  function describeWave(n) {
    const counts = {};
    for (const t of waveComposition(n)) counts[t] = (counts[t] || 0) + 1;
    const parts = [];
    let bossName = null;
    for (const t of Object.keys(counts)) {
      if (ENEMY_TYPES[t].boss) bossName = ENEMY_TYPES[t].name;
      else parts.push(ENEMY_TYPES[t].name + ' ' + counts[t]);
    }
    return parts.join(', ') + (bossName ? ' + 보스 ' + bossName + '!' : '');
  }

  // ---------- 게임 상태 ----------
  const state = {};
  function resetState() {
    state.difficulty = difficulty;
    state.lives = diff().lives;
    state.wave = 0;
    state.enemies = [];
    state.towers = [];
    state.bullets = [];
    state.particles = [];
    state.floaters = [];
    state.kills = 0;
    state.gold = diff().gold;
    state.stats = { slows: 0, splashHits: 0 }; // 얼음·폭탄 효과가 몇 번 일어났는지 (기록용)
    state.spawned = {};                                   // 지금까지 나온 몬스터 수 (기록용)
    for (const k of Object.keys(ENEMY_TYPES)) state.spawned[k] = 0;
    state.victory = false;    // 20웨이브를 막아냈는지
    state.endless = false;    // 승리 후 "끝없는 모드"로 계속하는 중인지
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
    state.hover = null;
    state.selected = null;
    state.pending = null;     // 터치에서 "여기에 심을까요?" 미리보기 중인 칸
    state.shopType = state.shopType || 'grass'; // 상점에서 고른 타워 종류
    state.role = state.role || 'solo';          // 'solo' 혼자 / 'host' 방장 / 'guest' 친구
    state.notice = '';
    state.noticeTimer = 0;
  }
  resetState();

  function showNotice(text, seconds) {
    netFx('notice', [text, seconds || 1.5]);
    state.notice = text;
    state.noticeTimer = seconds || 1.5;
  }

  function startWave() {
    if (!state.started) Sound.startMusic();
    state.wave += 1;
    state.spawnQueue = waveComposition(state.wave);
    state.spawnTimer = 0;
    state.waveActive = true;
    state.breakTimer = 0;
    state.started = true;
    updateHud();
  }

  // 패배 화면 보여주기 (방장·친구 화면 모두에서 씀)
  function presentDefeat() {
    Sound.stopMusic();
    const newRecord = recordResult(false);
    ui.overlayTitle.textContent = '패배!';
    ui.overlayTitle.classList.remove('win');
    ui.overlayText.textContent = '몬스터가 마을에 도착했어요. ' + state.wave + '웨이브까지 버텼고, ' + state.kills + '마리를 물리쳤어요. (' + diff().label + ' 난이도, 타워 ' + state.towers.length + '개, 남은 골드 ' + state.gold + ')'
      + (newRecord ? ' 🏆 최고 기록 갱신!' : '');
    ui.btnContinue.classList.add('hidden');
    ui.overlay.classList.remove('hidden');
  }
  function gameOver() {
    state.gameOver = true;
    selectTower(null);
    clearPending();
    Sound.play('defeat');
    presentDefeat();
    updateHud();
  }

  // 승리 화면 보여주기 (방장·친구 화면 모두에서 씀)
  function presentVictory() {
    Sound.stopMusic();
    recordResult(true);
    ui.overlayTitle.textContent = '승리!';
    ui.overlayTitle.classList.add('win');
    ui.overlayText.textContent = VICTORY_WAVE + '웨이브를 모두 막아내고 마을을 지켰어요! ' + state.kills + '마리를 물리쳤고, 생명이 ' + state.lives + ' 남았어요. (' + diff().label + ' 난이도 승리 ' + best.victories + '회째)';
    ui.btnContinue.classList.remove('hidden');
    ui.overlay.classList.remove('hidden');
  }
  function victory() {
    state.victory = true;
    selectTower(null);
    clearPending();
    Sound.play('victory');
    presentVictory();
    spawnParticles(canvas.width / 2, canvas.height / 2, '#ffd54f', 60, 260);
    updateHud();
  }

  function restartGame() {
    resetState();
    Sound.stopMusic();
    ui.overlay.classList.add('hidden');
    ui.placeBar.classList.add('hidden');
    selectTower(null);
    updateHud();
  }
  function continueEndless() {
    if (!state.victory) return;
    state.victory = false;
    state.endless = true;
    ui.overlay.classList.add('hidden');
    showNotice('끝없는 모드! 얼마나 버틸 수 있을까요?', 3);
    Sound.startMusic();
    updateHud();
  }
  function togglePause() {
    if (state.gameOver) return;
    state.paused = !state.paused;
    if (state.paused) Sound.suspend(); else Sound.resume();
    updateHud();
  }
  function cycleSpeed() {
    state.speed = state.speed >= 3 ? 1 : state.speed + 1;
    updateHud();
  }

  // ---------- 난이도 바꾸기 (게임 시작 전이나 끝난 뒤에만) ----------
  const diffLocked = () => (state.started && !state.gameOver && !state.victory) || state.role === 'guest';
  function setDifficulty(key) {
    if (!DIFFICULTIES[key]) return false;
    if (state.role === 'guest') { showNotice('난이도는 방장만 바꿀 수 있어요'); return false; }
    if (state.started && !state.gameOver && !state.victory) { showNotice('게임 중에는 난이도를 바꿀 수 없어요. 다시 시작한 뒤 골라 주세요'); Sound.play('error'); return false; }
    difficulty = key;
    try { localStorage.setItem(DIFF_KEY, key); } catch (e) { /* 무시 */ }
    best = loadBest();
    restartGame();
    showNotice('난이도: ' + diff().label + ' (생명 ' + diff().lives + ', 시작 골드 ' + diff().gold + ')', 2.5);
    Sound.play('place');
    return true;
  }
  function refreshDiffBar() {
    const locked = diffLocked();
    for (const b of ui.diffButtons) {
      b.classList.toggle('selected', b.dataset.diff === difficulty);
      b.disabled = locked;
    }
    const d = diff();
    ui.diffDesc.textContent = '생명 ' + d.lives + ' · 시작 골드 ' + d.gold + ' · 몬스터 체력 ' + Math.round(d.hp * 100) + '% · 처치 골드 ' + Math.round(d.reward * 100) + '%'
      + (state.role === 'guest' ? ' · 방장이 정해요' : (state.started && !state.gameOver && !state.victory ? ' · 다시 시작하면 바꿀 수 있어요' : ''));
  }

  // ---------- 모든 조작은 act()를 거침: 친구 화면이면 방장에게 보내고, 방장/혼자면 직접 실행 ----------
  const towerById = (id) => state.towers.find((t) => t.id === id) || null;
  function act(a, p) {
    p = p || {};
    if (state.role === 'guest') { Net.send({ t: 'act', a, p }); return true; }
    const owner = p.owner || 'host';
    switch (a) {
      case 'place': return !!placeTower(p.c, p.r, p.type, owner);
      case 'evolve': { const t = towerById(p.id); return t ? evolveTower(t) : false; }
      case 'sell': { const t = towerById(p.id); if (t) removeTower(t); return !!t; }
      case 'start': if (!inputLocked() && !state.waveActive) startWave(); return true;
      case 'pause': togglePause(); return true;
      case 'speed': cycleSpeed(); return true;
      case 'restart': restartGame(); return true;
      case 'continue': continueEndless(); return true;
      case 'difficulty': return setDifficulty(p.key);
      default: return false;
    }
  }

  const inputLocked = () => state.gameOver || state.victory;

  // ---------- 타워 설치 / 진화 / 팔기 ----------
  function towerAt(c, r) {
    return state.towers.find((t) => t.c === c && t.r === r) || null;
  }
  function canPlace(c, r) {
    return inBoard(c, r) && !isPath(c, r) && !towerAt(c, r);
  }
  function buyCost(typeKey) {
    return TOWER_TYPES[typeKey].stages[0].cost;
  }
  function canAfford(typeKey) {
    return state.gold >= buyCost(typeKey);
  }
  function sellPrice(t) {
    return Math.floor(t.invested * SELL_RATIO);
  }
  function selectTower(t) {
    state.selected = t;
    if (t) clearPending();
    refreshInfo(true);
  }

  // ---------- 터치용 "여기에 심을까요?" 미리보기 ----------
  function setPending(c, r) {
    state.pending = { c, r };
    state.hover = { c, r };
    updatePlaceBar();
    ui.placeBar.classList.remove('hidden');
  }
  function clearPending() {
    if (!state.pending) return;
    state.pending = null;
    state.hover = null;
    ui.placeBar.classList.add('hidden');
  }
  function updatePlaceBar() {
    if (!state.pending) return;
    const def = TOWER_TYPES[state.shopType].stages[0];
    ui.placeText.textContent = def.name + '를 여기에 심을까요? (' + def.cost + '골드' + (canAfford(state.shopType) ? '' : ', 골드 부족') + ')';
    ui.btnPlaceOk.textContent = '심기 (' + def.cost + '골드)';
    ui.btnPlaceOk.disabled = !canAfford(state.shopType);
  }
  function confirmPending() {
    if (!state.pending) return;
    const { c, r } = state.pending;
    if (act('place', { c, r, type: state.shopType })) clearPending();
  }
  function placeTower(c, r, typeKey, owner) {
    if (!canPlace(c, r) || !TOWER_TYPES[typeKey]) return null;
    const def = TOWER_TYPES[typeKey].stages[0];
    if (!canAfford(typeKey)) {
      showNotice('골드가 부족해요 (' + def.name + ' ' + def.cost + '골드)');
      Sound.play('error');
      return null;
    }
    state.gold -= def.cost;
    const t = new Tower(c, r, typeKey);
    t.owner = owner || 'host';
    state.towers.push(t);
    spawnParticles(t.x, t.y, ELEMENTS[t.element].color, 8, 70);
    spawnFloater(t.x, t.y - 20, '-' + def.cost, '#ff8a80');
    showNotice(def.name + '를 심었어요! (-' + def.cost + '골드)');
    Sound.play('place');
    updateHud();
    return t;
  }
  function evolveTower(t) {
    const next = t.nextStage;
    if (!next) { showNotice(t.def.name + '는 이미 최종 진화예요'); Sound.play('error'); return false; }
    if (state.gold < next.cost) { showNotice('골드가 부족해요 (진화 ' + next.cost + '골드)'); Sound.play('error'); return false; }
    const before = t.def.name;
    state.gold -= next.cost;
    t.invested += next.cost;
    t.stage += 1;
    spawnParticles(t.x, t.y, '#ffffff', 16, 120);
    spawnParticles(t.x, t.y, ELEMENTS[t.element].color, 10, 90);
    spawnFloater(t.x, t.y - 24, '진화!', '#ffd54f');
    showNotice(before + '가 ' + t.def.name + '로 진화했어요!', 2.5);
    Sound.play('evolve');
    updateHud();
    refreshInfo(true);
    return true;
  }
  function removeTower(t) {
    const refund = sellPrice(t);
    state.gold += refund;
    state.towers = state.towers.filter((x) => x !== t);
    if (state.selected === t) selectTower(null);
    spawnParticles(t.x, t.y, '#b07a3c', 6, 60);
    spawnFloater(t.x, t.y - 20, '+' + refund, '#ffd54f');
    showNotice('타워를 팔아서 ' + refund + '골드를 돌려받았어요');
    Sound.play('sell');
    updateHud();
  }

  // ---------- 매 프레임 계산 ----------
  function update(dt) {
    // 1) 몬스터 소환
    if (state.waveActive && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const type = state.spawnQueue.shift();
        const e = new Enemy(type, state.wave);
        state.enemies.push(e);
        state.spawned[type] += 1;
        state.spawnTimer = e.boss ? SPAWN_GAP * 2 : SPAWN_GAP;
        if (e.boss) {
          showNotice('보스 등장! ' + e.name + '!', 3);
          spawnParticles(e.x + TILE, e.y, '#ffd54f', 20, 120);
          Sound.play('boss');
        }
      }
    }

    // 2) 타워가 적을 고르고 발사
    for (const t of state.towers) t.update(dt);

    // 3) 총알 날아가기 + 맞추기
    for (const b of state.bullets) b.update(dt);
    state.bullets = state.bullets.filter((b) => !b.done);

    // 4) 몬스터 이동
    for (const e of state.enemies) e.update(dt);

    // 5) 마을 도착 -> 생명 감소 / 쓰러진 적 치우기
    const arrived = state.enemies.filter((e) => e.reached && !e.dead);
    state.enemies = state.enemies.filter((e) => !e.reached && !e.dead);
    if (arrived.length > 0) {
      state.lives -= arrived.reduce((sum, e) => sum + e.livesDamage, 0);
      state.hitFlash = 0.4;
      netFx('flash', null);
      Sound.play('lifeLost');
      if (arrived.some((e) => e.boss)) showNotice('보스가 마을에 들어왔어요! 생명 -5', 2.5);
      if (state.lives <= 0) {
        state.lives = 0;
        gameOver();
        return;
      }
    }

    // 6) 웨이브가 끝나면 보너스 + 잠깐 쉬고 다음 웨이브
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.waveActive = false;
      state.breakTimer = BREAK_TIME;
      const bonus = waveBonus(state.wave);
      state.gold += bonus;
      showNotice(state.wave + '웨이브 방어 성공! 보너스 +' + bonus + '골드', 2.5);
      if (state.wave === VICTORY_WAVE && !state.endless) {
        victory();
        return;
      }
      Sound.play('waveClear');
    }
    if (state.started && !state.waveActive) {
      state.breakTimer -= dt;
      if (state.breakTimer <= 0) startWave();
    }

    if (state.hitFlash > 0) state.hitFlash -= dt;
    state.time += dt;
    updateHud();
  }

  function updateEffects(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floaters) {
      f.y -= 28 * dt;
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

  function drawShadow(x, y, w, dy) {
    w = w || 24;
    dy = dy || 13;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y + dy), w, 4);
  }

  function drawEnemy(e) {
    const img = spriteCache[ENEMY_TYPES[e.type].sprite];
    const slowed = e.slowTimer > 0;
    const bob = Math.round(Math.sin(e.t * (e.boss ? 6 : (slowed ? 4 : 10))) * 2);
    drawShadow(e.x, e.y, e.boss ? 40 : 24, e.boss ? 19 : 13);
    drawSprite(img, e.x, e.y + bob, e.dir);
    if (slowed) { // 느려진 적은 파랗게 얼어 보이고 머리 위에 얼음 조각
      ctx.fillStyle = 'rgba(120,200,255,0.35)';
      ctx.fillRect(Math.round(e.x - img.width / 2), Math.round(e.y - img.height / 2 + bob), img.width, img.height);
      ctx.fillStyle = '#eef8ff';
      ctx.fillRect(Math.round(e.x - 2), Math.round(e.y - img.height / 2 + bob - 8), 4, 4);
      ctx.fillRect(Math.round(e.x - 8), Math.round(e.y - img.height / 2 + bob - 5), 3, 3);
      ctx.fillRect(Math.round(e.x + 5), Math.round(e.y - img.height / 2 + bob - 5), 3, 3);
    }
    if (e.hp < e.maxHp) {
      const bw = e.boss ? 40 : 24;
      const bx = Math.round(e.x - bw / 2 - 1), by = Math.round(e.y - (e.boss ? 32 : 24) + bob);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(bx, by, bw + 2, 5);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(bx + 1, by + 1, bw, 3);
      ctx.fillStyle = '#43d16a';
      ctx.fillRect(bx + 1, by + 1, Math.round(bw * (e.hp / e.maxHp)), 3);
    }
  }

  // 보스가 살아 있으면 화면 위쪽에 큰 체력 막대
  function drawBossBar() {
    const boss = state.enemies.find((e) => e.boss && !e.dead);
    if (!boss) return;
    const w = 300, x = canvas.width / 2 - w / 2, y = 84;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 8, y - 22, w + 16, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('보스 ' + boss.name + ' ' + elementLabel(boss.element) + '  ' + boss.hp + ' / ' + boss.maxHp, canvas.width / 2, y - 7);
    ctx.fillStyle = '#5a1a1a';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = '#ff5252';
    ctx.fillRect(x, y, Math.round(w * (boss.hp / boss.maxHp)), 10);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, 10);
  }

  function drawTower(t) {
    const img = spriteCache[t.def.sprite];
    const hop = t.recoil > 0 ? -2 : 0;
    drawShadow(t.x, t.y);
    drawSprite(img, t.x, t.y + hop, t.dir);
    // 진화 단계 표시 (작은 별)
    if (t.stage > 0) {
      ctx.fillStyle = '#ffd54f';
      for (let i = 0; i < t.stage; i++) ctx.fillRect(Math.round(t.x + 12 - i * 5), Math.round(t.y - 20), 3, 3);
    }
    if (state.selected === t) {
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.c * TILE + 2, t.r * TILE + 2, TILE - 4, TILE - 4);
    }
    // 친구와 함께할 때: 누가 심었는지 작은 점으로 표시 (파랑 = 방장, 분홍 = 친구)
    if (state.role !== 'solo') {
      ctx.fillStyle = t.owner === 'guest' ? '#ff6fa3' : '#4fc3f7';
      ctx.fillRect(t.c * TILE + 3, t.r * TILE + 3, 6, 6);
    }
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
    ctx.fillStyle = b.element === 'fire' ? '#7a2200' : b.element === 'water' ? '#0d3b66' : '#1f4d2a';
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
    ctx.fillRect(canvas.width / 2 - 235, 14, 470, sub ? 56 : 36);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(text, canvas.width / 2, 38);
    if (sub) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(sub, canvas.width / 2, 58, 460);
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

    const shopDef = TOWER_TYPES[state.shopType].stages[0];
    const hoverPlaceable = state.hover && !state.gameOver && canPlace(state.hover.c, state.hover.r);
    const affordable = canAfford(state.shopType);
    if (state.selected) drawRange(state.selected.x, state.selected.y, state.selected.def.range, true);
    if (hoverPlaceable) {
      drawRange(state.hover.c * TILE + TILE / 2, state.hover.r * TILE + TILE / 2, shopDef.range, affordable);
    } else if (state.hover && !state.gameOver && !towerAt(state.hover.c, state.hover.r)) {
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(state.hover.c * TILE, state.hover.r * TILE, TILE, TILE);
    }

    const units = [];
    for (const t of state.towers) units.push({ y: t.y, draw: () => drawTower(t) });
    for (const e of state.enemies) units.push({ y: e.y, draw: () => drawEnemy(e) });
    units.sort((a, b) => a.y - b.y);
    for (const u of units) u.draw();

    for (const b of state.bullets) drawBullet(b);
    drawParticles();
    drawFloaters();
    drawBossBar();

    if (hoverPlaceable) {
      drawSprite(spriteCache[shopDef.sprite], state.hover.c * TILE + TILE / 2, state.hover.r * TILE + TILE / 2, 1, affordable ? 0.55 : 0.25);
    }
    // 터치 미리보기 중인 칸은 노란 테두리를 깜빡여서 "여기"라고 알려줌
    if (state.pending) {
      ctx.strokeStyle = Math.floor(state.time * 4) % 2 === 0 || !state.started ? '#ffd54f' : '#fff3b0';
      ctx.lineWidth = 3;
      ctx.strokeRect(state.pending.c * TILE + 2, state.pending.r * TILE + 2, TILE - 4, TILE - 4);
    }

    if (state.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + ((state.hitFlash / 0.4) * 0.35) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!state.started) {
      drawMessage('타워를 고르고 풀밭을 클릭해 심은 뒤, 웨이브 시작!', '[' + diff().label + '] 1웨이브: ' + describeWave(1) + ' · ' + VICTORY_WAVE + '웨이브를 막으면 승리!');
    } else if (!state.waveActive && !state.gameOver && !state.victory) {
      drawMessage('다음 웨이브까지 ' + Math.ceil(state.breakTimer) + '초', (state.wave + 1) + '웨이브: ' + describeWave(state.wave + 1));
    } else if (state.paused) {
      drawMessage('일시정지');
    }
    // 친구 화면: 방장 상태가 2.5초 넘게 안 오면 (방장이 다른 탭을 보는 중 등) 알려줌
    if (state.role === 'guest' && Net.isConnected() && lastSnapAt && performance.now() - lastSnapAt > 2500) {
      drawMessage('방장 쪽이 잠시 멈췄어요', '방장이 다른 화면을 보고 있으면 게임이 멈춰요. 돌아오면 이어져요.');
    }
    drawNotice();
  }

  // ---------- 화면 숫자 / 상점 / 정보창 갱신 ----------
  function updateHud() {
    ui.lives.textContent = state.lives;
    ui.wave.textContent = state.endless ? state.wave + ' (끝없는 모드)' : state.wave + ' / ' + VICTORY_WAVE;
    ui.enemies.textContent = state.enemies.length + state.spawnQueue.length;
    ui.kills.textContent = state.kills;
    ui.towers.textContent = state.towers.length;
    ui.gold.textContent = state.gold;
    ui.btnStart.textContent = state.started ? '다음 웨이브' : '웨이브 시작';
    ui.btnStart.disabled = state.waveActive || inputLocked();
    ui.btnPause.textContent = state.paused ? '계속하기' : '일시정지';
    ui.btnSpeed.textContent = '배속 x' + state.speed;
    ui.best.textContent = best.wave > 0 ? best.wave + '웨이브' + (best.victories > 0 ? ' (승리 ' + best.victories + '회)' : '') : '-';
    refreshDiffBar();
    refreshShop();
    refreshInfo(false);
  }

  const cardEls = {};
  function buildShop() {
    ui.cards.innerHTML = '';
    for (const key of TOWER_ORDER) {
      const type = TOWER_TYPES[key];
      const s0 = type.stages[0];
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.dataset.type = key;
      const icon = document.createElement('canvas');
      icon.className = 'icon';
      icon.width = 36; icon.height = 36;
      const g = icon.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(spriteCache[s0.sprite], 0, 0);
      const text = document.createElement('div');
      text.className = 'cardText';
      text.innerHTML = '<b>' + s0.name + '</b><span class="badge ' + key + '">' + elementLabel(type.element) + '</span> <span class="key">[' + type.key + ']</span><br>'
        + '<span class="cost">' + s0.cost + '골드</span><span class="sep"> · </span><span class="desc">' + type.desc + '</span>';
      btn.appendChild(icon);
      btn.appendChild(text);
      btn.addEventListener('click', () => { state.shopType = key; refreshShop(); });
      ui.cards.appendChild(btn);
      cardEls[key] = btn;
    }
  }
  function refreshShop() {
    for (const key of TOWER_ORDER) {
      const el = cardEls[key];
      el.classList.toggle('selected', state.shopType === key);
      el.querySelector('.cost').classList.toggle('poor', !canAfford(key));
    }
    updatePlaceBar();
  }

  let lastInfoKey = '';
  function refreshInfo(force) {
    const t = state.selected;
    if (!t) {
      if (force || lastInfoKey !== '') { ui.info.classList.add('hidden'); lastInfoKey = ''; }
      return;
    }
    const key = t.c + ',' + t.r + ',' + t.stage + ',' + state.gold;
    if (!force && key === lastInfoKey) return;
    lastInfoKey = key;
    ui.info.classList.remove('hidden');
    const g = ui.infoIcon.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 36, 36);
    g.drawImage(spriteCache[t.def.sprite], 0, 0);
    const d = t.def;
    const special = (s) => (s.slow ? ' · 맞은 적 ' + Math.round((1 - s.slow.factor) * 100) + '% 느려짐(' + s.slow.duration + '초)' : '')
      + (s.splash ? ' · 주변 ' + (s.splash / TILE).toFixed(1) + '칸 함께 피해' : '');
    let html = '<b>' + d.name + '</b> (' + (t.stage + 1) + '단계) <span class="badge ' + t.element + '">' + elementLabel(t.element) + '</span>'
      + ' · 사거리 ' + (d.range / TILE) + '칸 · 공격력 ' + d.damage + ' · ' + d.cooldown + '초마다 발사' + special(d)
      + (state.role !== 'solo' ? (t.owner === 'guest' ? ' · 🩷친구가 심음' : ' · 💙방장이 심음') : '');
    const next = t.nextStage;
    if (next) {
      html += '<br>진화하면 → <b>' + next.name + '</b>: 사거리 ' + (next.range / TILE) + '칸 · 공격력 ' + next.damage + ' · ' + next.cooldown + '초마다 발사' + special(next);
      ui.btnEvolve.textContent = '진화 (' + next.cost + '골드)';
      ui.btnEvolve.disabled = state.gold < next.cost;
    } else {
      html += '<br>최종 진화 완료! 더 강해질 수 없어요.';
      ui.btnEvolve.textContent = '최종 진화';
      ui.btnEvolve.disabled = true;
    }
    ui.infoText.innerHTML = html;
    ui.btnSell.textContent = '팔기 (+' + sellPrice(t) + '골드)';
  }

  // ---------- 마우스 ----------
  function tileFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * canvas.width / rect.width;
    const y = (ev.clientY - rect.top) * canvas.height / rect.height;
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  }
  // 마우스는 올려두면 미리보기, 손가락(터치)은 움직여도 스크롤일 수 있으니 미리보기를 바꾸지 않음
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch' || state.pending) return;
    const t = tileFromEvent(ev);
    state.hover = inBoard(t.c, t.r) ? t : null;
  });
  canvas.addEventListener('pointerleave', () => { if (!state.pending) state.hover = null; });

  // 누르기 시작한 위치를 기억해서, 많이 움직였으면(스크롤/드래그) 탭으로 치지 않음
  let pressStart = null;
  canvas.addEventListener('pointerdown', (ev) => { pressStart = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointercancel', () => { pressStart = null; });
  canvas.addEventListener('pointerup', (ev) => {
    const start = pressStart;
    pressStart = null;
    if (!start || ev.button !== 0) return;
    if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 12) return;
    handleTap(tileFromEvent(ev), ev.pointerType === 'touch');
  });

  function handleTap(t, isTouch) {
    if (inputLocked() || !inBoard(t.c, t.r)) return;
    const existing = towerAt(t.c, t.r);
    if (existing) {
      selectTower(state.selected === existing ? null : existing);
      return;
    }
    if (!canPlace(t.c, t.r)) {
      showNotice('길 위에는 타워를 놓을 수 없어요');
      Sound.play('error');
      clearPending();
      return;
    }
    if (!isTouch) { // 마우스: 바로 심기
      if (act('place', { c: t.c, r: t.r, type: state.shopType })) selectTower(null);
      return;
    }
    // 터치: 한 번 누르면 미리보기, 같은 곳을 다시 누르면 심기
    if (state.pending && state.pending.c === t.c && state.pending.r === t.r) {
      confirmPending();
      return;
    }
    selectTower(null);
    setPending(t.c, t.r);
    showNotice('같은 곳을 한 번 더 누르거나 [심기]를 누르면 심어요', 2);
  }
  ui.btnPlaceOk.addEventListener('click', () => { if (!inputLocked()) confirmPending(); });
  ui.btnPlaceCancel.addEventListener('click', () => clearPending());
  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (inputLocked()) return;
    const t = tileFromEvent(ev);
    const existing = towerAt(t.c, t.r);
    if (existing) act('sell', { id: existing.id });
  });

  // ---------- 버튼 / 키보드 ----------
  ui.btnStart.addEventListener('click', () => {
    if (inputLocked() || state.waveActive) return;
    act('start');
  });
  ui.btnContinue.addEventListener('click', () => { if (state.victory) act('continue'); });
  ui.btnPause.addEventListener('click', () => { if (!state.gameOver) act('pause'); });
  ui.btnMute.addEventListener('click', () => {
    Sound.setMuted(!Sound.isMuted());
    updateMuteLabel();
  });
  // 전체화면 (안드로이드 크롬 등에서 동작. 아이폰 사파리는 지원하지 않아 버튼을 숨김)
  if (!document.documentElement.requestFullscreen) ui.btnFull.style.display = 'none';
  ui.btnFull.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    document.documentElement.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  });
  ui.btnSpeed.addEventListener('click', () => act('speed'));
  ui.btnRestart.addEventListener('click', () => act('restart'));
  for (const b of ui.diffButtons) {
    b.addEventListener('click', () => {
      if (state.role === 'guest') { showNotice('난이도는 방장만 바꿀 수 있어요'); return; }
      act('difficulty', { key: b.dataset.diff });
    });
  }
  ui.btnEvolve.addEventListener('click', () => { if (state.selected && !inputLocked()) act('evolve', { id: state.selected.id }); });
  ui.btnSell.addEventListener('click', () => { if (state.selected && !inputLocked()) act('sell', { id: state.selected.id }); });
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; // 글자 입력 중엔 단축키 끔
    if (e.code === 'Space') { e.preventDefault(); ui.btnPause.click(); return; }
    if (e.code === 'Digit1') { state.shopType = 'grass'; refreshShop(); }
    if (e.code === 'Digit2') { state.shopType = 'fire'; refreshShop(); }
    if (e.code === 'Digit3') { state.shopType = 'water'; refreshShop(); }
    if (e.code === 'Digit4') { state.shopType = 'ice'; refreshShop(); }
    if (e.code === 'Digit5') { state.shopType = 'bomb'; refreshShop(); }
    if (e.code === 'KeyE' && state.selected && !inputLocked()) act('evolve', { id: state.selected.id });
    if (e.code === 'Delete' && state.selected && !inputLocked()) act('sell', { id: state.selected.id });
  });

  // ============================================================
  // 친구와 함께 (온라인 협동)
  // 방장(host) 컴퓨터가 게임을 계산하고, 0.1초마다 친구(guest)에게 상태를 보냅니다.
  // 친구는 받은 상태를 그려주고, 자기 조작(심기/진화/팔기/시작 등)은 방장에게 보냅니다.
  // ============================================================
  let netOutbox = [];   // 친구에게 보낼 효과(소리·반짝이·안내문) 모음
  let netTimer = 0;
  let lastSnapAt = 0;   // 친구 화면: 방장 상태를 마지막으로 받은 시각
  const guestEnemies = new Map(); // 친구 화면용 몬스터 (번호표 → 객체)
  const guestTowers = new Map();  // 친구 화면용 타워

  function netFx(kind, p) {
    if (state.role === 'host' && Net.isConnected()) netOutbox.push([kind, p]);
  }
  // 모든 소리는 친구에게도 전달
  {
    const originalPlay = Sound.play;
    Sound.play = (name) => { originalPlay(name); netFx('sound', name); };
  }

  function buildSnapshot() {
    return {
      d: difficulty,
      l: state.lives, w: state.wave, g: state.gold, k: state.kills, st: state.started, wa: state.waveActive,
      bt: Math.round(state.breakTimer * 10) / 10, p: state.paused, sp: state.speed, go: state.gameOver, v: state.victory,
      en: state.endless, q: state.spawnQueue.length,
      e: state.enemies.map((e) => [e.id, e.type, Math.round(e.x), Math.round(e.y), e.dir, e.hp, e.maxHp, e.slowTimer > 0 ? 1 : 0]),
      tw: state.towers.map((t) => [t.id, t.c, t.r, t.typeKey, t.stage, t.dir, t.recoil > 0 ? 1 : 0, t.owner, t.invested]),
      b: state.bullets.map((b) => [Math.round(b.x), Math.round(b.y), b.element]),
    };
  }

  function applySnapshot(s, fx) {
    lastSnapAt = performance.now();
    const prev = { gameOver: state.gameOver, victory: state.victory, paused: state.paused };
    if (s.d && DIFFICULTIES[s.d] && s.d !== difficulty) { difficulty = s.d; state.difficulty = s.d; best = loadBest(); }
    state.lives = s.l; state.wave = s.w; state.gold = s.g; state.kills = s.k; state.started = s.st; state.waveActive = s.wa;
    state.breakTimer = s.bt; state.paused = s.p; state.speed = s.sp; state.gameOver = s.go; state.victory = s.v; state.endless = s.en;
    state.spawnQueue = new Array(s.q);

    const seen = new Set();
    for (const [id, type, x, y, dir, hp, maxHp, slowed] of s.e) {
      let e = guestEnemies.get(id);
      if (!e) {
        const def = ENEMY_TYPES[type];
        e = { id, type, element: def.element, name: def.name, boss: !!def.boss, x, y, tx: x, ty: y, dir, hp, maxHp, t: Math.random() * 10, dead: false, reached: false, slowTimer: 0 };
        guestEnemies.set(id, e);
      } else { e.tx = x; e.ty = y; e.dir = dir; e.hp = hp; e.maxHp = maxHp; }
      e.slowTimer = slowed ? 1 : 0;
      seen.add(id);
    }
    for (const id of Array.from(guestEnemies.keys())) if (!seen.has(id)) guestEnemies.delete(id);
    state.enemies = Array.from(guestEnemies.values());

    const seenT = new Set();
    for (const [id, c, r, typeKey, stage, dir, recoil, owner, invested] of s.tw) {
      let t = guestTowers.get(id);
      if (!t) { t = new Tower(c, r, typeKey); t.id = id; guestTowers.set(id, t); }
      t.stage = stage; t.dir = dir; if (recoil) t.recoil = 0.1; t.owner = owner; t.invested = invested;
      seenT.add(id);
    }
    for (const id of Array.from(guestTowers.keys())) if (!seenT.has(id)) guestTowers.delete(id);
    state.towers = Array.from(guestTowers.values());
    if (state.selected && !guestTowers.has(state.selected.id)) selectTower(null);

    state.bullets = s.b.map(([x, y, el]) => ({ x, y, element: el, color: BULLET_COLORS[el] }));

    for (const [kind, p] of fx) {
      if (kind === 'particles') spawnParticles(p[0], p[1], p[2], p[3], p[4]);
      else if (kind === 'floater') spawnFloater(p[0], p[1], p[2], p[3]);
      else if (kind === 'sound') Sound.play(p);
      else if (kind === 'notice') showNotice(p[0], p[1]);
      else if (kind === 'flash') state.hitFlash = 0.4;
    }

    if (state.paused !== prev.paused) { if (state.paused) Sound.suspend(); else Sound.resume(); }
    if (state.gameOver && !prev.gameOver) { selectTower(null); clearPending(); presentDefeat(); }
    else if (state.victory && !prev.victory) { selectTower(null); clearPending(); presentVictory(); }
    else if (!state.gameOver && !state.victory && (prev.gameOver || prev.victory)) ui.overlay.classList.add('hidden');
    if (state.started && !state.gameOver && !state.victory) Sound.startMusic(); else Sound.stopMusic();
    updateHud();
  }

  // 친구 화면: 방장이 보낸 위치 사이를 부드럽게 이어 그림
  function guestTick(dt) {
    const k = Math.min(1, dt * 15);
    const run = !state.paused && !inputLocked();
    for (const e of state.enemies) {
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
      if (run) e.t += dt * state.speed;
    }
    for (const t of state.towers) if (t.recoil > 0) t.recoil -= dt;
    if (run) {
      state.time += dt * state.speed;
      if (state.started && !state.waveActive && state.breakTimer > 0) state.breakTimer -= dt * state.speed;
    }
  }

  function handleNetData(data) {
    if (!data || typeof data !== 'object') return;
    if (data.t === 'act' && state.role === 'host') act(String(data.a), Object.assign({}, data.p || {}, { owner: 'guest' }));
    else if (data.t === 'snap' && state.role === 'guest') applySnapshot(data.s, data.fx || []);
  }

  // ---------- 친구 연결 창 ----------
  function setMpStatus(text) {
    ui.mpStatus.textContent = text;
    ui.mpStatus.classList.toggle('hidden', !text);
  }
  function mpMessage(text, isError) {
    ui.mpMessage.textContent = text || '';
    ui.mpMessage.style.color = isError ? '#ff8a80' : '#ffd54f';
  }
  const roomLink = (code) => location.origin + location.pathname + '?room=' + code;

  function startHosting() {
    mpMessage('방을 만드는 중...');
    Net.host({
      onReady: (code) => {
        state.role = 'host';
        ui.mpCode.textContent = code;
        ui.mpLink.textContent = roomLink(code);
        ui.mpHostInfo.classList.remove('hidden');
        ui.btnMpLeave.classList.remove('hidden');
        mpMessage('친구에게 코드나 링크를 보내 주세요. 친구가 들어오면 바로 같이 할 수 있어요.');
        setMpStatus('👥 방 코드 ' + code + ' · 친구를 기다리는 중');
      },
      onConnected: () => {
        showNotice('친구가 들어왔어요! 같이 막아요!', 3);
        Sound.play('waveClear');
        setMpStatus('🟢 친구 연결됨 · 방 코드 ' + Net.getCode());
        mpMessage('친구가 들어왔어요!');
        ui.mpPanel.classList.add('hidden');
        netTimer = 1; // 바로 상태를 보냄
      },
      onData: handleNetData,
      onDisconnected: () => {
        showNotice('친구 연결이 끊겼어요. 같은 코드로 다시 들어올 수 있어요.', 3);
        setMpStatus('👥 방 코드 ' + Net.getCode() + ' · 친구를 기다리는 중');
      },
      onError: (msg) => mpMessage(msg, true),
    });
  }

  function joinRoom(code) {
    mpMessage('연결하는 중... (최대 20초 정도 걸릴 수 있어요)');
    Net.join({
      onConnected: () => {
        state.role = 'guest';
        guestEnemies.clear();
        guestTowers.clear();
        resetState();
        selectTower(null);
        clearPending();
        ui.overlay.classList.add('hidden');
        ui.btnMpLeave.classList.remove('hidden');
        updateHud();
        showNotice('연결됐어요! 방장과 함께 플레이해요', 3);
        Sound.play('waveClear');
        setMpStatus('🟢 방장과 연결됨 · 방 코드 ' + Net.getCode());
        ui.mpPanel.classList.add('hidden');
      },
      onData: handleNetData,
      onDisconnected: () => {
        state.role = 'solo';
        Net.leave();
        setMpStatus('');
        ui.btnMpLeave.classList.add('hidden');
        Sound.stopMusic();
        state.gameOver = true;
        ui.overlayTitle.textContent = '연결 끊김';
        ui.overlayTitle.classList.remove('win');
        ui.overlayText.textContent = '방장과의 연결이 끊겼어요. "다시 시작"을 누르면 혼자 하기로 돌아가요.';
        ui.btnContinue.classList.add('hidden');
        ui.overlay.classList.remove('hidden');
      },
      onError: (msg) => mpMessage(msg, true),
    }, code);
  }

  function leaveRoom() {
    Net.leave();
    state.role = 'solo';
    guestEnemies.clear();
    guestTowers.clear();
    restartGame();
    setMpStatus('');
    ui.btnMpLeave.classList.add('hidden');
    ui.mpHostInfo.classList.add('hidden');
    mpMessage('');
    ui.mpPanel.classList.add('hidden');
    showNotice('혼자 하기로 돌아왔어요', 2);
  }

  ui.btnMp.addEventListener('click', () => {
    if (!Net.available()) mpMessage('연결 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.', true);
    ui.mpPanel.classList.remove('hidden');
  });
  ui.btnMpClose.addEventListener('click', () => ui.mpPanel.classList.add('hidden'));
  ui.btnMpHost.addEventListener('click', startHosting);
  ui.btnMpJoin.addEventListener('click', () => joinRoom(ui.mpJoinCode.value));
  ui.mpJoinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(ui.mpJoinCode.value); });
  ui.btnMpLeave.addEventListener('click', leaveRoom);
  ui.btnMpCopy.addEventListener('click', () => {
    const link = roomLink(Net.getCode());
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => mpMessage('링크를 복사했어요! 친구에게 붙여넣어 보내세요.')).catch(() => mpMessage('복사가 안 돼요. 링크를 직접 보내주세요: ' + link, true));
    } else mpMessage('링크를 직접 보내주세요: ' + link);
  });
  ui.btnMpShare.addEventListener('click', () => {
    const link = roomLink(Net.getCode());
    if (navigator.share) navigator.share({ title: '픽셀 몬스터 디펜스 같이 하자!', text: '방 코드: ' + Net.getCode(), url: link }).catch(() => {});
    else ui.btnMpCopy.click();
  });

  // ---------- 테스트용 주소 옵션 (예: index.html?autostart=1&speed=3) ----------
  const params = new URLSearchParams(location.search);
  if (params.get('speed')) state.speed = Math.max(1, Number(params.get('speed')) || 1);
  window.__game = state; // 자동 테스트에서 상태를 들여다보기 위한 창구
  window.__rules = { typeMultiplier, TOWER_TYPES, ENEMY_TYPES, waveComposition, describeWave, VICTORY_WAVE, DIFFICULTIES, getBest: () => best };

  // ---------- 시작 ----------
  buildShop();
  updateMuteLabel();
  updateHud();
  if (params.get('autostart') === '1') startWave();
  // 친구가 보낸 링크(?room=코드)로 열었으면 바로 그 방에 들어감
  if (params.get('room')) {
    ui.mpJoinCode.value = Net.normalizeCode(params.get('room'));
    ui.mpPanel.classList.remove('hidden');
    joinRoom(params.get('room'));
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (state.role === 'guest') {
      guestTick(dt);
    } else {
      if (state.started && !state.paused && !inputLocked()) update(dt * state.speed);
      if (state.role === 'host' && Net.isConnected()) {
        netTimer += dt;
        if (netTimer >= 0.1) {
          netTimer = 0;
          Net.send({ t: 'snap', s: buildSnapshot(), fx: netOutbox });
          netOutbox = [];
        }
      }
    }
    updateEffects(dt * (state.paused ? 0 : state.speed));
    if (state.noticeTimer > 0) state.noticeTimer -= dt;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
