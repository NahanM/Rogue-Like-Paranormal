import { getMoveAxis } from '../engine/input';
import { moveWithCollision, type Point, type RoomCollision } from './collision';
import { player as cfg } from './config';

// Pra onde o sprite está virado. 'side' olha pra direita; esquerda é ele espelhado (ESTILO, seção 8)
export type Facing = 'down' | 'up' | 'side';

// Protagonista: só a lógica (posição no chão, direção, vida, stamina).
// O desenho fica no player-view.ts, pra dar pra mexer em um sem quebrar o outro.
export class Player implements Point {
  x = 0;
  z = 0;
  facing: Facing = 'up';
  facingLeft = false;
  moving = false;
  // tempo andando sem parar: a animação começa do primeiro quadro toda vez que ele sai andando
  walkTime = 0;

  health = cfg.maxHealth;
  stamina = cfg.maxStamina;

  placeAt(spot: Point): void {
    this.x = spot.x;
    this.z = spot.z;
    this.walkTime = 0;
  }

  update(dt: number, room: RoomCollision): void {
    // eixo já normalizado: na diagonal ele não anda mais rápido
    const axis = getMoveAxis();
    this.moving = axis.x !== 0 || axis.y !== 0;

    if (!this.moving) {
      this.walkTime = 0;
      return;
    }

    this.walkTime += dt;
    // y do teclado (pra baixo na tela) é o z do mundo
    const next = moveWithCollision(room, this, axis.x * cfg.speed * dt, axis.y * cfg.speed * dt, cfg.radius);
    this.x = next.x;
    this.z = next.z;

    // Mais pro lado do que pra cima/baixo: sprite de lado. Na diagonal exata, vale cima/baixo
    if (Math.abs(axis.x) > Math.abs(axis.y)) {
      this.facing = 'side';
      this.facingLeft = axis.x < 0;
    } else {
      this.facing = axis.y < 0 ? 'up' : 'down';
    }
  }
}
