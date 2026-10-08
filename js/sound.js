// ============================================================
// 소리 모듈: 소리 파일 없이 브라우저가 직접 소리를 만들어냅니다 (Web Audio API)
// - 효과음: Sound.play('kill') 처럼 이름으로 부릅니다
// - 배경음: Sound.startMusic() / Sound.stopMusic()
// - 브라우저 규칙상 사용자가 클릭/키를 누른 뒤에야 소리를 낼 수 있어서,
//   첫 클릭 때 Sound.init()을 불러줍니다.
// ============================================================

const Sound = (() => {
  // 음 이름 -> 주파수(Hz). 예: NOTE.A4 = 440
  const NOTE = {};
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let oct = 2; oct <= 6; oct++) {
    for (let i = 0; i < 12; i++) NOTE[NAMES[i] + oct] = 440 * Math.pow(2, (oct - 4) + (i - 9) / 12);
  }

  const MUTE_KEY = 'pixelDefense.muted';
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 그냥 켜진 상태 */ }

  const stats = {};        // 어떤 소리를 몇 번 요청했는지 (테스트용)
  const lastPlayed = {};   // 같은 소리 연타 제한
  let noiseBuf = null;

  function init() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      resume();
      if (musicWanted) startMusic();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }

  // ---------- 기본 재료: 삐- 소리와 치익- 소리 ----------
  function tone(o) {
    const t0 = ctx.currentTime + Math.max(0, o.at || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(o.dest || sfxGain);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }
  function noise(o) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + Math.max(0, o.at || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.cutoff || 1000;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.dest || sfxGain);
    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
  }
  // 음 이름 목록을 차례로 연주 (null 은 쉼표)
  function melody(list, step, type, vol, dest) {
    list.forEach((n, i) => { if (n) tone({ type, freq: NOTE[n], dur: step * 0.95, vol, at: i * step, dest }); });
  }

  // ---------- 효과음 모음 ----------
  const SFX = {
    shoot_grass: () => tone({ type: 'square', freq: 700, to: 450, dur: 0.06, vol: 0.12 }),
    shoot_fire:  () => { tone({ type: 'sawtooth', freq: 240, to: 120, dur: 0.07, vol: 0.1 }); noise({ dur: 0.04, vol: 0.06, filter: 'highpass', cutoff: 2000 }); },
    shoot_water: () => tone({ type: 'sine', freq: 900, to: 300, dur: 0.12, vol: 0.16 }),
    hit:         () => noise({ dur: 0.03, vol: 0.07, filter: 'bandpass', cutoff: 1500 }),
    kill:        () => { tone({ type: 'square', freq: 600, to: 150, dur: 0.16, vol: 0.2 }); noise({ dur: 0.1, vol: 0.12 }); },
    place:       () => melody(['C5', 'G5'], 0.08, 'triangle', 0.3),
    evolve:      () => { melody(['C5', 'E5', 'G5', 'C6'], 0.09, 'square', 0.22); noise({ dur: 0.3, vol: 0.08, filter: 'highpass', cutoff: 5000, at: 0.1 }); },
    sell:        () => melody(['G5', 'C5'], 0.09, 'triangle', 0.25),
    error:       () => tone({ type: 'square', freq: 160, to: 120, dur: 0.12, vol: 0.2 }),
    lifeLost:    () => { tone({ type: 'sawtooth', freq: 140, to: 70, dur: 0.3, vol: 0.3 }); noise({ dur: 0.2, vol: 0.1, filter: 'lowpass', cutoff: 500 }); },
    waveClear:   () => melody(['E5', 'G5', 'C6'], 0.1, 'square', 0.25),
    boss:        () => {
      tone({ type: 'sine', freq: 55, dur: 1.2, vol: 0.9 });
      tone({ type: 'sawtooth', freq: 82, to: 41, dur: 1.0, vol: 0.25 });
      noise({ dur: 0.8, vol: 0.15, filter: 'lowpass', cutoff: 300 });
      tone({ type: 'square', freq: 110, dur: 0.15, vol: 0.3 });
      tone({ type: 'square', freq: 110, dur: 0.15, vol: 0.3, at: 0.4 });
    },
    victory:     () => {
      melody(['C5', 'E5', 'G5', 'C6', null, 'G5', 'C6', null, 'E6', 'E6', 'E6'], 0.13, 'square', 0.3);
      melody(['C3', 'C3', 'G3', 'G3', 'C3', 'C3', 'G3', 'G3', 'C3', null, 'C3'], 0.13, 'triangle', 0.4);
    },
    defeat:      () => {
      melody(['A4', 'F4', 'D4', 'C4'], 0.32, 'triangle', 0.4);
      melody(['A2', 'F2', 'D2', 'C2'], 0.32, 'sawtooth', 0.15);
    },
  };
  // 너무 자주 울리면 시끄러운 소리들: 최소 간격(초)
  const MIN_GAP = { shoot: 0.05, hit: 0.04 };

  function play(name) {
    stats[name] = (stats[name] || 0) + 1;
    if (!ctx || muted || !SFX[name]) return;
    const group = name.indexOf('shoot_') === 0 ? 'shoot' : name;
    const gap = MIN_GAP[group];
    if (gap) {
      const now = ctx.currentTime;
      if (lastPlayed[group] !== undefined && now - lastPlayed[group] < gap) return;
      lastPlayed[group] = now;
    }
    try { SFX[name](); } catch (e) { /* 소리가 실패해도 게임은 계속 */ }
  }

  // ---------- 배경음: 8마디 칩튠 반복 ----------
  const BPM = 140;
  const STEP = 60 / BPM / 2; // 8분음표 길이(초)
  const MELODY = [
    'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5',
    'E5', 'E5', 'G5', 'A5', 'C6', null, 'A5', 'G5',
    'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'A4',
    'C5', 'D5', 'E5', null, 'G5', null, 'E5', null,
    'A5', 'G5', 'E5', 'G5', 'A5', 'C6', 'A5', 'G5',
    'E5', 'D5', 'C5', 'D5', 'E5', null, null, null,
    'C5', 'D5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5',
    'C5', null, null, null, 'E5', 'G5', 'C6', null,
  ];
  const BASS = ['C3', 'A2', 'C3', 'G2', 'A2', 'F2', 'C3', 'G2']; // 마디별 베이스 음
  let musicOn = false, musicWanted = false, musicTimer = null, nextTime = 0, stepIdx = 0;

  function playStep(i, t) {
    const at = t - ctx.currentTime;
    const n = MELODY[i];
    if (n) tone({ type: 'square', freq: NOTE[n], dur: STEP * 0.9, vol: 0.5, at, dest: musicGain });
    const bar = Math.floor(i / 8), beat = i % 8;
    if (beat % 2 === 0) {
      const root = NOTE[BASS[bar]];
      tone({ type: 'triangle', freq: (beat === 2 || beat === 6) ? root * 1.5 : root, dur: STEP * 1.8, vol: 0.6, at, dest: musicGain });
    }
    if (beat === 0 || beat === 4) tone({ type: 'sine', freq: 150, to: 40, dur: 0.12, vol: 0.9, at, dest: musicGain }); // 쿵
    noise({ dur: 0.03, vol: beat % 2 === 0 ? 0.12 : 0.06, at, dest: musicGain, filter: 'highpass', cutoff: 6000 });  // 칙
  }
  function scheduler() {
    if (!ctx || !musicOn) return;
    while (nextTime < ctx.currentTime + 0.35) {
      try { playStep(stepIdx, nextTime); } catch (e) { /* 무시 */ }
      nextTime += STEP;
      stepIdx = (stepIdx + 1) % MELODY.length;
    }
  }
  function startMusic() {
    musicWanted = true;
    if (!ctx || musicOn) return;
    musicOn = true;
    nextTime = ctx.currentTime + 0.05;
    stepIdx = 0;
    musicTimer = setInterval(scheduler, 90);
  }
  function stopMusic() {
    musicWanted = false;
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // ---------- 소리 켜기/끄기 ----------
  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 1;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 무시 */ }
  }
  const isMuted = () => muted;
  const isMusicOn = () => musicOn;
  const getContext = () => ctx;

  return { init, play, startMusic, stopMusic, setMuted, isMuted, isMusicOn, suspend, resume, stats, getContext, NOTE };
})();
