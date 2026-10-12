// Protagonista placeholder (sprite real chega na Sprint 7).
// A posição (x, y) é o PÉ do personagem: centro da base do retângulo.
// Isso casa com a regra de ordenação por Y do pé (ESTILO, seção 4) e
// com a colisão futura, que testa um ponto no chão.

// CanvasRenderingContext2D é tipo global do DOM; sem import.
import { getMoveAxis } from '../engine/input';
import { player as playerConfig } from './config';
import { resolveMove } from './arena';

export class Player {
  x = playerConfig.startX;
  y = playerConfig.startY;

  update(dt: number): void {
    // Eixo de movimento já vem normalizado do input (diagonal não é mais rápida)
    const axis = getMoveAxis();

    // Movimento resolvido contra a arena (arena.json): o pé não sai do polígono
    // nem entra nos pilares, deslizando pelas bordas (resolveMove é eixo a eixo).
    const dx = axis.x * playerConfig.speed * dt;
    const dy = axis.y * playerConfig.speed * dt;
    const next = resolveMove(this.x, this.y, dx, dy);
    this.x = next.x;
    this.y = next.y;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Math.round em toda posição: ESTILO seção 1 (desenho sempre inteiro).
    const px = Math.round(this.x);
    const py = Math.round(this.y);

    // Sombra ANTES do corpo (camada 2 da seção 4 do ESTILO): elipse no pé.
    ctx.save();
    ctx.globalAlpha = playerConfig.shadowOpacity;
    ctx.fillStyle = playerConfig.shadowColor;
    ctx.beginPath();
    ctx.ellipse(
      px,
      py,
      playerConfig.shadowWidth / 2,
      playerConfig.shadowHeight / 2,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    // Corpo: retângulo cujo FUNDO (base) fica no pé, centrado no x.
    const rx = Math.round(this.x - playerConfig.width / 2);
    const ry = Math.round(this.y - playerConfig.height);
    ctx.fillStyle = playerConfig.color;
    ctx.fillRect(rx, ry, playerConfig.width, playerConfig.height);
  }
}
