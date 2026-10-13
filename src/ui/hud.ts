import { GAME_HEIGHT, GAME_WIDTH, hud as cfg, player as playerCfg } from '../game/config';
import type { Player } from '../game/player';
import { drawPixelText, measurePixelText } from '../engine/pixel-text';

// HUD no canvas 2D por cima da cena (ESTILO, seção 9), em pixels da tela de 480x270.
// Vida, stamina e a legenda dos controles. O rastro de dano entra na Sprint 7.

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

// Barra com contorno de 1 px, fundo escuro e a parte cheia na cor dela.
// Arredonda pra baixo pra nunca desenhar meio pixel.
function drawBar(g: CanvasRenderingContext2D, bar: Bar, fraction: number): void {
  const clamped = Math.min(1, Math.max(0, fraction));
  g.fillStyle = cfg.outline;
  g.fillRect(bar.x - 1, bar.y - 1, bar.width + 2, bar.height + 2);
  g.fillStyle = cfg.barBackground;
  g.fillRect(bar.x, bar.y, bar.width, bar.height);
  g.fillStyle = bar.color;
  g.fillRect(bar.x, bar.y, Math.floor(bar.width * clamped), bar.height);
}

// Legenda começa visível; a tecla C esconde e mostra
let controlsVisible = true;
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === cfg.controls.toggleKey && !e.repeat) controlsVisible = !controlsVisible;
});

// Duas colunas: teclas alinhadas pela direita, ações pela esquerda, no canto de baixo
function drawControls(g: CanvasRenderingContext2D): void {
  const c = cfg.controls;
  const gap = 4;
  const keyWidth = Math.max(...c.lines.map(([key]) => measurePixelText(key)));
  const labelWidth = Math.max(...c.lines.map(([, label]) => measurePixelText(label)));
  const left = c.rightX - keyWidth - gap - labelWidth;
  const top = c.bottomY - c.lines.length * c.lineHeight;

  g.globalAlpha = c.backdropOpacity;
  g.fillStyle = c.backdrop;
  g.fillRect(left - 3, top - 3, keyWidth + gap + labelWidth + 6, c.lines.length * c.lineHeight + 4);
  g.globalAlpha = 1;

  c.lines.forEach(([key, label], i) => {
    const y = top + i * c.lineHeight;
    drawPixelText(g, key, left + keyWidth, y, c.keyColor, 'right');
    drawPixelText(g, label, left + keyWidth + gap, y, c.labelColor);
  });
}

export function drawHud(g: CanvasRenderingContext2D, player: Player): void {
  g.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBar(g, cfg.health, player.health / playerCfg.maxHealth);
  drawBar(g, cfg.stamina, player.stamina / playerCfg.maxStamina);
  if (controlsVisible) drawControls(g);
}
