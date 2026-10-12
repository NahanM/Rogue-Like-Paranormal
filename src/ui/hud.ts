import { GAME_HEIGHT, GAME_WIDTH, hud as cfg, player as playerCfg } from '../game/config';
import type { Player } from '../game/player';

// HUD no canvas 2D por cima da cena (ESTILO, seção 9), em pixels da tela de 480x270.
// Por enquanto só vida e stamina. O rastro de dano entra na Sprint 7.

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

export function drawHud(g: CanvasRenderingContext2D, player: Player): void {
  g.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBar(g, cfg.health, player.health / playerCfg.maxHealth);
  drawBar(g, cfg.stamina, player.stamina / playerCfg.maxStamina);
}
