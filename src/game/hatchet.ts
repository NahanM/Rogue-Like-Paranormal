import { items as cfg } from './config';
import { moveWithCollision, type Point, type Rect, type RoomCollision } from './collision';

// Mesma folga das comparações de tempo do player.ts: somar speed × 1/60
// várias vezes acumula erro de arredondamento na distância percorrida
const RANGE_EPSILON = 1e-6;

// Projétil da machadinha (COMBATE.md, Itens; Sprint 6, Tarefa 2):
// arremessada com F na direção em que o jogador olha, em linha reta, a
// 200 px/s, até 64 px de alcance — e "a machadinha some depois de
// arremessada": NUNCA volta pro chão, some no ar. Só lógica (voo e colisão
// com a sala); o desenho fica no hatchet-view.ts e QUEM ela acerta (os
// inimigos) é decidido no main.ts, mesmo padrão dos itens e dos inimigos
export class Hatchet implements Point {
  x: number;
  z: number;
  // Direção travada no disparo: a machadinha não vira no ar
  readonly dirX: number;
  readonly dirZ: number;
  // Distância já percorrida: é nela que o alcance do COMBATE.md é medido
  traveled = 0;
  // Viva até estourar o alcance, bater na parede/pilar/corpo do chefe ou
  // acertar um inimigo (o acerto a mata por fora, no main)
  alive = true;

  constructor(x: number, z: number, dirX: number, dirZ: number) {
    this.x = x;
    this.z = z;
    this.dirX = dirX;
    this.dirZ = dirZ;
  }

  update(dt: number, room: RoomCollision): void {
    if (!this.alive) return;
    const step = cfg.hatchet.speed * dt;
    // Colide com a sala com o mesmo moveWithCollision do jogador (raio
    // pequeno, no config), então muro, pilares e o corpo do chefe seguram.
    // Mas projétil NÃO desliza: o deslize serve só de DETECTOR — se a
    // posição final não é a pedida, é porque algo entrou na frente
    const wantX = this.x + this.dirX * step;
    const wantZ = this.z + this.dirZ * step;
    const next = moveWithCollision(room, this, this.dirX * step, this.dirZ * step, cfg.hatchet.radius);
    this.traveled += Math.hypot(next.x - this.x, next.z - this.z);
    this.x = next.x;
    this.z = next.z;

    if (this.traveled >= cfg.hatchet.range - RANGE_EPSILON) {
      // fim do alcance (64 px ≈ 3,42 un): some no ar
      this.alive = false;
    } else if (next.x !== wantX || next.z !== wantZ) {
      // a colisão impediu o avanço pedido neste passo: bateu e morre no
      // impacto. A comparação exata é segura: quando o caminho está livre,
      // o moveWithCollision devolve exatamente `from + passo`
      this.alive = false;
    }
  }

  // Retângulo de acerto no plano do chão: quadrado de lado items.size
  // (0,45 un, a cara do sprite — ESTILO, seção 3) centrado no projétil.
  // O main testa contra o hurtbox() dos inimigos com rectsOverlap, mesmo
  // padrão do golpe da espada
  hitbox(): Rect {
    const half = cfg.size / 2;
    return { xMin: this.x - half, xMax: this.x + half, zMin: this.z - half, zMax: this.z + half };
  }
}
