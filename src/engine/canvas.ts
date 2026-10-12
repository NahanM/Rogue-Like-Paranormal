import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from '../game/config';

// Canvas interno de 480x270 (ESTILO, seção 1).
// Tudo do jogo é desenhado aqui e depois a página exibe esse canvas
// ampliado por múltiplo inteiro, pra nunca borrar pixel.
export const canvas = document.createElement('canvas');
export const ctx = canvas.getContext('2d')!;

canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Pixel art não pode ser suavizada em lugar nenhum
ctx.imageSmoothingEnabled = false;
canvas.style.imageRendering = 'pixelated';

document.body.appendChild(canvas);

// Ajusta o tamanho do canvas na janela: só escala inteira (2x, 3x, ...),
// centralizado com margem via CSS, e o que sobrar fica na cor do body.
function resize(): void {
  const scaleX = window.innerWidth / GAME_WIDTH;
  const scaleY = window.innerHeight / GAME_HEIGHT;
  // Math.floor nunca deixa passar de 1x; em janela menor que o jogo, fica 1x
  const scale = Math.max(1, Math.floor(Math.min(scaleX, scaleY)));

  canvas.style.width = `${GAME_WIDTH * scale}px`;
  canvas.style.height = `${GAME_HEIGHT * scale}px`;
}

window.addEventListener('resize', resize);
resize();

// CSS aplicado via style.css importado no main.ts.
// Exportado aqui só pra deixar claro que a cor da borda vem da config.
export const borderColor = BACKGROUND_COLOR;
