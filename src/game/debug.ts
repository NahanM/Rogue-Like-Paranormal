import * as THREE from 'three';
import type { Floor, Point, RoomCollision } from './collision';
import { debug as cfg, player as playerCfg } from './config';

// Modo debug (F1), da CENA3D: linhas finas no chão com a colisão e o FPS no HUD.
// As linhas são desenhadas por cima de tudo (depthTest desligado), pra dar pra ver
// o círculo inteiro mesmo quando um pilar tapa um pedaço dele.

const LINE_Y = 0.05;

function lineMaterial(color: string): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
}

function circleLine(x: number, z: number, radius: number, material: THREE.LineBasicMaterial): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(x + Math.cos(a) * radius, LINE_Y, z + Math.sin(a) * radius));
  }
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
  // por cima de tudo o que já foi desenhado
  line.renderOrder = 999;
  return line;
}

function floorLine(floor: Floor, material: THREE.LineBasicMaterial): THREE.LineLoop {
  if (floor.tipo === 'circulo') return circleLine(floor.x, floor.z, floor.raio, material);
  const corners = [
    new THREE.Vector3(floor.xMin, LINE_Y, floor.zMin),
    new THREE.Vector3(floor.xMax, LINE_Y, floor.zMin),
    new THREE.Vector3(floor.xMax, LINE_Y, floor.zMax),
    new THREE.Vector3(floor.xMin, LINE_Y, floor.zMax),
  ];
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), material);
  line.renderOrder = 999;
  return line;
}

export class DebugView {
  enabled = false;
  readonly object = new THREE.Group();
  private readonly playerCircle: THREE.LineLoop;
  private fps = 0;
  private frames = 0;
  private second = -1;

  constructor() {
    this.object.visible = false;
    this.playerCircle = circleLine(0, 0, playerCfg.radius, lineMaterial(cfg.playerColor));
    this.object.add(this.playerCircle);

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code !== 'F1') return;
      // sem isso o navegador abre a página de ajuda
      e.preventDefault();
      if (e.repeat) return;
      this.enabled = !this.enabled;
      this.object.visible = this.enabled;
    });
  }

  // Desenha a colisão de uma sala (chamar de novo ao trocar de sala)
  showRoom(room: RoomCollision): void {
    for (const child of [...this.object.children]) {
      if (child !== this.playerCircle) this.object.remove(child);
    }
    this.object.add(floorLine(room.chao, lineMaterial(cfg.floorColor)));
    const obstacleMaterial = lineMaterial(cfg.obstacleColor);
    for (const o of room.obstaculos) this.object.add(circleLine(o.x, o.z, o.r, obstacleMaterial));
  }

  // Uma vez por quadro desenhado: conta o FPS e acompanha o pé do jogador
  sync(player: Point): void {
    const second = Math.floor(performance.now() / 1000);
    if (second !== this.second) {
      this.fps = this.frames;
      this.frames = 0;
      this.second = second;
    }
    this.frames++;
    this.playerCircle.position.set(player.x, 0, player.z);
  }

  drawHud(g: CanvasRenderingContext2D): void {
    if (!this.enabled) return;
    // fonte do sistema só aqui: o debug não faz parte do jogo final
    g.fillStyle = cfg.textColor;
    g.font = '8px monospace';
    g.textBaseline = 'top';
    g.textAlign = 'right';
    g.fillText(`${this.fps} FPS`, cfg.fpsRightX, cfg.fpsY);
    g.textAlign = 'left';
  }
}
