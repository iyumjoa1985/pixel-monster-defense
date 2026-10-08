// ============================================================
// 오리지널 픽셀 몬스터 도감
// 12x12 격자. 글자 하나가 픽셀 하나이고 '.'은 투명(비어 있음)입니다.
// palette: 글자 -> 색깔
// ============================================================

const SPRITES = {
  // 몽글이: 느리지만 튼튼한 초록 슬라임
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

  // 불티: 빠르지만 약한 불꽃 몬스터
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
