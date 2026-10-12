import * as THREE from 'three';
import { GAME_HEIGHT, GAME_WIDTH, camera as cfg } from './config';
import type { Point } from './collision';

// Câmera de ângulo fixo (ESTILO, seção 2).
// Ela nunca gira nem dá zoom: só a posição acompanha o jogador, pela metade,
// pra arena ficar quase toda na tela e ainda assim a câmera andar junto.
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly target = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly offset = new THREE.Vector3(cfg.offset.x, cfg.offset.y, cfg.offset.z);

  constructor() {
    this.camera = new THREE.PerspectiveCamera(cfg.fov, GAME_WIDTH / GAME_HEIGHT, cfg.near, cfg.far);
  }

  // Pula direto pro jogador, sem suavizar (início do jogo e troca de sala)
  snapTo(player: Point): void {
    this.goalFor(player);
    this.target.copy(this.goal);
    this.apply();
  }

  // Passo fixo: aproxima o alvo do destino com 1 - e^(-k·dt)
  update(dt: number, player: Point, reducedMotion: boolean): void {
    this.goalFor(player);
    const t = reducedMotion ? 1 : 1 - Math.exp(-cfg.smoothing * dt);
    this.target.lerp(this.goal, t);
    this.apply();
  }

  private goalFor(player: Point): void {
    this.goal.set(player.x * cfg.follow, 0, player.z * cfg.follow + cfg.targetShiftZ);
  }

  private apply(): void {
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
