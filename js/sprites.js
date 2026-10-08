// ============================================================
// 오리지널 픽셀 몬스터 도감
// 12x12 격자. 글자 하나가 픽셀 하나이고 '.'은 투명(비어 있음)입니다.
// palette: 글자 -> 색깔
// ============================================================

const SPRITES = {
  // ===================== 적 =====================

  // 몽글이 (풀): 느리지만 튼튼한 초록 슬라임
  mongle: {
    name: '몽글이',
    palette: { o: '#1f4d2a', g: '#5ad66b', l: '#a8f0a0', w: '#ffffff', k: '#1a1a1a', p: '#ff9ab0' },
    rows: [
      '............',
      '....oooo....',
      '..oollggoo..',
      '.ollggggggo.',
      'olgwkggwkggo',
      'oggwkggwkggo',
      'ogpggggggpgo',
      'ogggoooogggo',
      'oggggggggggo',
      '.oggggggggo.',
      '..oooooooo..',
      '............',
    ],
  },

  // 불티 (불): 빠르지만 약한 불꽃 몬스터
  bulti: {
    name: '불티',
    palette: { o: '#7a2200', y: '#ffe14d', r: '#ff7a2a', w: '#ffffff', k: '#1a1a1a' },
    rows: [
      '.....oo.....',
      '....oyyo....',
      '...oyyyyo...',
      '..oyyrryyo..',
      '.oyrrrrrryo.',
      '.orrwkrwkro.',
      'orrrrrrrrrro',
      'orrrkkkkrrro',
      'orrrrrrrrrro',
      '.orrrrrrrro.',
      '..oo.oo.oo..',
      '............',
    ],
  },

  // 물컹이 (물): 물렁물렁한 파란 젤리 몬스터
  mulkeong: {
    name: '물컹이',
    palette: { o: '#0d3b66', B: '#bfe9ff', u: '#4fc3f7', w: '#ffffff', k: '#1a1a1a' },
    rows: [
      '.....oo.....',
      '....oBBo....',
      '..ooBBuuoo..',
      '.oBBuuuuuuo.',
      'oBuwkuuwkuuo',
      'ouuwkuuwkuuo',
      'ouuuuuuuuuuo',
      'ouuuukkuuuuo',
      'ouuuuuuuuuuo',
      '.ouuuuuuuuo.',
      '..oooooooo..',
      '............',
    ],
  },

  // ===================== 풀 타워: 새싹이 → 잎사귀 → 꽃나래 =====================

  saessak: {
    name: '새싹이',
    palette: { o: '#1f4d2a', L: '#7fe36b', D: '#3fae4a', g: '#d6f59a', w: '#ffffff', k: '#1a1a1a', p: '#ff9ab0', b: '#8b5a2b', t: '#b07a3c' },
    rows: [
      '.....oo.....',
      '....oLLo....',
      '.oo.oLLo.oo.',
      'oLLooDDooLLo',
      '.ooogggggoo.',
      '.oggwkgwkgo.',
      'ogpggggggpgo',
      'oggggggggggo',
      '.oggggggggo.',
      '..oobbbboo..',
      '..obbttbbo..',
      '...oooooo...',
    ],
  },

  ipsagwi: {
    name: '잎사귀',
    palette: { o: '#1f4d2a', L: '#5fcf4e', D: '#3fae4a', g: '#c8f08a', w: '#ffffff', k: '#1a1a1a', p: '#ff9ab0', P: '#ff6fa3', b: '#8b5a2b', t: '#b07a3c' },
    rows: [
      '....oooo....',
      '...oPPPPo...',
      '.oo.oPPo.oo.',
      'oLLLoDDoLLLo',
      'oLLoggggoLLo',
      'ogwkggggwkgo',
      'ogpggggggpgo',
      'oggggkkggggo',
      '.oggggggggo.',
      '..oobbbboo..',
      '..obbttbbo..',
      '...oooooo...',
    ],
  },

  kkotnarae: {
    name: '꽃나래',
    palette: { o: '#1f4d2a', L: '#5fcf4e', D: '#3fae4a', g: '#f0ffc0', w: '#ffffff', k: '#1a1a1a', p: '#ff9ab0', P: '#ff6fa3', Y: '#ffe14d', b: '#8b5a2b', t: '#b07a3c' },
    rows: [
      '....oPPo....',
      '..oPPYYPPo..',
      '.oo.oPPo.oo.',
      'oLLLoDDoLLLo',
      'oLLoggggoLLo',
      'ogwkggggwkgo',
      'ogpggggggpgo',
      'oggggkkggggo',
      '.oggggggggo.',
      '..oobbbboo..',
      '..obbttbbo..',
      '...oooooo...',
    ],
  },

  // ===================== 불 타워: 불씨 → 불꼬리 → 화르르 =====================

  bulssi: {
    name: '불씨',
    palette: { o: '#7a2200', y: '#ffe14d', r: '#ff4d1f', R: '#ff8c42', w: '#ffffff', k: '#1a1a1a', s: '#8d8d8d', S: '#b5b5b5' },
    rows: [
      '......o.....',
      '.....oyo....',
      '....oyyo....',
      '...oorroo...',
      '..oRRRRRRo..',
      '.oRwkRRwkRo.',
      'oRRRRRRRRRRo',
      'oRRRkkkkRRRo',
      '.oRRRRRRRRo.',
      '..oossssoo..',
      '..ossSSsso..',
      '...oooooo...',
    ],
  },

  bulkkori: {
    name: '불꼬리',
    palette: { o: '#7a2200', y: '#ffe14d', r: '#ff4d1f', R: '#ff8c42', w: '#ffffff', k: '#1a1a1a', s: '#8d8d8d', S: '#b5b5b5' },
    rows: [
      '...o....o...',
      '..oyo..oyo..',
      '..oyyooyyo..',
      '.oorrrrrroo.',
      '.oRRRRRRRRo.',
      'oRRwkRRwkRRo',
      'oRRRRRRRRRRo',
      'oRRRkkkkRRRo',
      '.oRRRRRRRRo.',
      '..oossssoo..',
      '..ossSSsso..',
      '...oooooo...',
    ],
  },

  hwareureu: {
    name: '화르르',
    palette: { o: '#7a2200', y: '#ffe14d', r: '#ff4d1f', R: '#ff8c42', W: '#fff6cc', w: '#ffffff', k: '#1a1a1a', s: '#8d8d8d', S: '#b5b5b5' },
    rows: [
      '.o...oo...o.',
      'oyo.oyyo.oyo',
      'oyyooyyooyyo',
      'orrrrWWrrrro',
      'oRRRRRRRRRRo',
      'oRkwRRRRwkRo',
      'oRRRRRRRRRRo',
      'oRRkkkkkkRRo',
      '.oRRRRRRRRo.',
      '..oossssoo..',
      '..ossSSsso..',
      '...oooooo...',
    ],
  },

  // ===================== 물 타워: 물방울 → 물결이 → 파도리 =====================

  mulbangul: {
    name: '물방울',
    palette: { o: '#0d3b66', B: '#bfe9ff', u: '#5ec8ff', w: '#ffffff', k: '#1a1a1a', m: '#7a9cc6', M: '#a9c4e8' },
    rows: [
      '.....oo.....',
      '....oBBo....',
      '...oBBBBo...',
      '..oBBuuBBo..',
      '.oBuuuuuuBo.',
      '.ouwkuuwkuo.',
      'ouuuuuuuuuuo',
      'ouuuukkuuuuo',
      '.ouuuuuuuuo.',
      '..oommmmoo..',
      '..ommMMmmo..',
      '...oooooo...',
    ],
  },

  mulgyeori: {
    name: '물결이',
    palette: { o: '#0d3b66', B: '#bfe9ff', u: '#5ec8ff', w: '#ffffff', k: '#1a1a1a', m: '#7a9cc6', M: '#a9c4e8' },
    rows: [
      '.....oo.....',
      '....oBBo....',
      '.o.oBBBBo.o.',
      'oBoBBuuBBoBo',
      'oBBuuuuuuBBo',
      'ouwkuuuuwkuo',
      'ouuuuuuuuuuo',
      'ouuuukkuuuuo',
      '.ouuuuuuuuo.',
      '..oommmmoo..',
      '..ommMMmmo..',
      '...oooooo...',
    ],
  },

  padori: {
    name: '파도리',
    palette: { o: '#0d3b66', B: '#bfe9ff', u: '#5ec8ff', W: '#ffffff', w: '#ffffff', k: '#1a1a1a', m: '#7a9cc6', M: '#a9c4e8' },
    rows: [
      '.o..o..o..o.',
      'oBooBooBooBo',
      'oBBBBBBBBBBo',
      'oBBuuuuuuBBo',
      'ouuuuWWuuuuo',
      'ouwkuuuuwkuo',
      'ouuuuuuuuuuo',
      'ouuuukkuuuuo',
      '.ouuuuuuuuo.',
      '..oommmmoo..',
      '..ommMMmmo..',
      '...oooooo...',
    ],
  },
};

// 도감 데이터를 실제 그림(캔버스)으로 바꿔줍니다. scale배 만큼 키웁니다.
function buildSprite(def, scale) {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = def.rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = def.palette[ch] || '#ff00ff';
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}
