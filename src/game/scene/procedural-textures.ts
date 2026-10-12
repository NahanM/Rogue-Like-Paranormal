import type * as THREE from 'three';
import { canvasTexture, pixel, wrappedPixel, wrappedRect } from '../../engine/textures';
import { createRng, int, pick, type Rng } from '../../engine/random';

// Texturas provisórias geradas por código (CENA3D, seção Texturas), no estilo do protótipo.
// Ficam até as finais chegarem em public/assets/texturas/ (docs/ASSETS.md).
// Todas são repetíveis sem costura: o que passa de uma borda reaparece na outra.
// Cada uma tem a sua semente, então mudar uma não muda as outras.

// Rampa da pedra (ESTILO, seção 5) com variações intermediárias do protótipo
const STONE = ['#4c3d4c', '#463a4b', '#3f3446', '#524454'];
const STONE_SPECKLE = ['#5e4e5e', '#3a2f3f', '#6b5a6b'];
const MORTAR = '#191927';
const CRACK = '#2b2234';
const MOSS = ['#313525', '#4a5235', '#4a5235', '#252d1d'];

// Rachadura: uma linha torta de poucos pixels
function crack(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, length: number): void {
  let cx = x;
  let cy = y;
  for (let i = 0; i < length; i++) {
    wrappedPixel(g, cx, cy, CRACK);
    cx += rng() < 0.6 ? 1 : 0;
    cy += rng() < 0.5 ? 1 : -1;
  }
}

// Mancha de musgo: um punhado de pixels juntos
function mossPatch(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, count: number, w: number, h: number): void {
  for (let k = 0; k < count; k++) {
    wrappedPixel(g, x + int(rng, w), y + int(rng, h), pick(rng, MOSS));
  }
}

// Chão: lajes de 16x16 desencontradas em meia laje, rejunte escuro, desgaste, rachaduras e musgo
export function floorTexture(): THREE.CanvasTexture {
  const rng = createRng(7);
  return canvasTexture(32, 32, (g) => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x0 = col * 16 + row * 8;
        const y0 = row * 16;
        wrappedRect(g, x0, y0, 16, 16, pick(rng, STONE));
        for (let i = 0; i < 18; i++) {
          wrappedPixel(g, x0 + int(rng, 16), y0 + int(rng, 16), pick(rng, STONE_SPECKLE));
        }
        // rejunte em cima e à esquerda: a laje vizinha fecha o outro lado
        wrappedRect(g, x0, y0, 16, 1, MORTAR);
        wrappedRect(g, x0, y0, 1, 16, MORTAR);
      }
    }
    for (let c = 0; c < 2; c++) crack(g, rng, int(rng, 32), int(rng, 32), 4 + int(rng, 3));
    for (let m = 0; m < 3; m++) mossPatch(g, rng, int(rng, 32), int(rng, 32), 14, 6, 4);
  });
}

// Muro: tijolos de 16x8 desencontrados, luz no topo de cada tijolo e musgo no alto
export function brickTexture(): THREE.CanvasTexture {
  const rng = createRng(11);
  const bricks = ['#5a4a5a', '#4c3d4c', '#665566', '#544656'];
  return canvasTexture(32, 32, (g) => {
    g.fillStyle = MORTAR;
    g.fillRect(0, 0, 32, 32);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        const x0 = col * 16 + (row % 2) * 8;
        const y0 = row * 8;
        wrappedRect(g, x0 + 1, y0 + 1, 15, 7, pick(rng, bricks));
        wrappedRect(g, x0 + 1, y0 + 1, 15, 1, '#7a6878');
        for (let i = 0; i < 6; i++) {
          wrappedPixel(g, x0 + 1 + int(rng, 15), y0 + 2 + int(rng, 6), '#3d3242');
        }
      }
    }
    mossPatch(g, rng, 0, 0, 26, 32, 6);
  });
}

// Topo dos pilares: pedra lisa e mais clara, com pouco desgaste (16x16)
export function capTexture(): THREE.CanvasTexture {
  const rng = createRng(13);
  return canvasTexture(16, 16, (g) => {
    g.fillStyle = '#8a7a88';
    g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 20; i++) {
      wrappedPixel(g, int(rng, 16), int(rng, 16), pick(rng, ['#7c6c7a', '#968694', '#806f7e']));
    }
    crack(g, rng, int(rng, 16), int(rng, 16), 4);
  });
}

// Chama do braseiro: 4 quadros de 8x12 (ESTILO, seção 6), só com as cores travadas do fogo.
// a = #dd7530 (borda), b = #f29465, c = #ffdd9b (núcleo)
const FIRE_FRAMES = [
  [
    '....a...',
    '...aa...',
    '...aba..',
    '..abba..',
    '..abba..',
    '.abcba..',
    '.abccba.',
    '.bccccb.',
    'abccccba',
    'abccccba',
    '.bccccb.',
    '..bbbb..',
  ],
  [
    '..a.....',
    '..aa....',
    '..aba...',
    '..abba..',
    '.abbba..',
    '.abcba..',
    '.abccba.',
    'abccccb.',
    'abccccba',
    'abccccba',
    '.bccccb.',
    '..bbbb..',
  ],
  [
    '........',
    '........',
    '....a...',
    '...aba..',
    '..abba..',
    '..abcba.',
    '.abccba.',
    '.bccccb.',
    'abccccba',
    'abccccba',
    '.bccccb.',
    '..bbbb..',
  ],
  [
    '.....a..',
    '..a..aa.',
    '..aa.ab.',
    '..abaab.',
    '..abbba.',
    '.abcbba.',
    '.abccba.',
    '.bccccba',
    'abccccba',
    'abccccba',
    '.bccccb.',
    '..bbbb..',
  ],
];
const FIRE_COLORS: Record<string, string> = { a: '#dd7530', b: '#f29465', c: '#ffdd9b' };

export const FIRE_WIDTH_PX = 8;
export const FIRE_HEIGHT_PX = 12;

export function fireTextures(): THREE.CanvasTexture[] {
  return FIRE_FRAMES.map((rows) =>
    canvasTexture(
      FIRE_WIDTH_PX,
      FIRE_HEIGHT_PX,
      (g) => {
        rows.forEach((line, y) => {
          for (let x = 0; x < line.length; x++) {
            const color = FIRE_COLORS[line[x]];
            if (color) pixel(g, x, y, color);
          }
        });
      },
      false,
    ),
  );
}
