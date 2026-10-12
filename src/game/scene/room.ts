import type * as THREE from 'three';
import type { Point, RoomCollision } from '../collision';

// O que toda sala montada entrega pro jogo.
// A arena é a primeira; a sala 1 (Sprint 4) segue o mesmo formato.
export interface Room {
  // tudo que é da sala (peças, luzes, partículas), pra pôr e tirar da cena de uma vez
  readonly object: THREE.Group;
  readonly collision: RoomCollision;
  // onde o jogador aparece ao entrar
  readonly spawn: Point;
  // luzes piscando, partículas, chefe provisório
  update(dt: number, reducedMotion: boolean): void;
}
