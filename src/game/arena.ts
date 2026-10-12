// Colisão da arena: o layout vem do arena.json (não da imagem — ESTILO seção 4).
// - floor: polígono do chão andável, vértices em ordem, pixels 480x270
// - pillars: centros dos pilares; os raios moram em config.ts (números de ajuste)
// Todos os testes usam o PÉ do personagem (um ponto no chão).

import { arena as arenaConfig, debugCollision } from './config';
import geometry from './arena.json';

export interface Point {
  x: number;
  y: number;
}

// Monta os círculos dos pilares: posição do JSON, raio do config (mesmo índice).
const pillarCircles = geometry.pillars.map((p, i) => ({
  x: p.x,
  y: p.y,
  r: arenaConfig.pillarRadii[i] ?? arenaConfig.pillarRadii[0] ?? 0,
}));

// Point-in-polygon clássico (ray casting horizontal).
// Serve pra saber se um ponto está dentro do chão andável.
export function pointInFloor(x: number, y: number): boolean {
  const poly = geometry.floor;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    // Ray casting: conta quantas arestas cruzam o raio à direita do ponto.
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

// Distância ao quadrado de um ponto a um círculo é suficiente pro teste:
// se o pé está mais perto do centro do que o raio, ele entrou no pilar.
export function pointInPillar(x: number, y: number): boolean {
  for (const c of pillarCircles) {
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy < c.r * c.r) return true;
  }
  return false;
}

// Posição válida: dentro do chão E fora de todos os pilares.
export function isWalkable(x: number, y: number): boolean {
  return pointInFloor(x, y) && !pointInPillar(x, y);
}

// Resolve movimento do pé (px, py) com deslocamento (dx, dy).
// Estratégia eixo a eixo, na ordem: movimento completo -> só X -> só Y.
// Isso faz o personagem deslizar nas bordas do chão e nos pilares,
// em vez de travar de vez ou teleportar.
export function resolveMove(px: number, py: number, dx: number, dy: number): Point {
  if (isWalkable(px + dx, py + dy)) {
    return { x: px + dx, y: py + dy };
  }
  if (isWalkable(px + dx, py)) {
    return { x: px + dx, y: py };
  }
  if (isWalkable(px, py + dy)) {
    return { x: px, y: py + dy };
  }
  // Nenhum eixo livre: fica parado (encurralado entre pilar e borda).
  return { x: px, y: py };
}

// Overlay de debug da colisão (desligado por padrão; liga com F1 no main.ts).
// Desenha por cima da cena: chão andável, pilares e o pé do jogador.
// Cores e opacidades ficam no config.ts (debugCollision), então aqui só
// há geometria. O preenchimento translúcido foi escolhido em vez de só
// contorno porque deixa óbvio até onde o pé pode chegar.
export function drawDebugCollision(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number
): void {
  // Chão andável: polígono preenchido translúcido.
  // Math.round nos vértices conforme ESTILO seção 1 (desenho sempre inteiro).
  ctx.save();
  ctx.globalAlpha = debugCollision.floorOpacity;
  ctx.fillStyle = debugCollision.floorColor;
  ctx.beginPath();
  const poly = geometry.floor;
  ctx.moveTo(Math.round(poly[0][0]), Math.round(poly[0][1]));
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(Math.round(poly[i][0]), Math.round(poly[i][1]));
  }
  ctx.closePath();
  ctx.fill();

  // Pilares: círculos translúcidos (centro + raio reais da colisão).
  ctx.globalAlpha = debugCollision.pillarOpacity;
  ctx.fillStyle = debugCollision.pillarColor;
  for (const c of pillarCircles) {
    ctx.beginPath();
    ctx.arc(Math.round(c.x), Math.round(c.y), c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Pé do jogador: 1 px em cor sólida, pra comparar com o polígono/pilares.
  ctx.fillStyle = debugCollision.footColor;
  ctx.fillRect(Math.round(footX), Math.round(footY), 1, 1);
}
