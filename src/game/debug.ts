import * as THREE from 'three';
import type { Floor, RoomCollision } from './collision';
import type { Player } from './player';
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
  // retângulo da área de acerto do ataque: vértices reescritos a cada quadro,
  // visível só enquanto o golpe está ativo
  private readonly attackBox: THREE.LineLoop;
  private readonly attackPositions: THREE.BufferAttribute;
  private fps = 0;
  private frames = 0;
  private second = -1;
  // referência do player pra linha de QA no HUD (estado, vida, stamina, etc.)
  private player: Player | null = null;
  // aperto da tecla H acumulado: o dano de teste é aplicado no passo fixo
  // (updateTestDamage), como os botões de ação do input.ts
  private testDamageQueued = false;

  constructor() {
    this.object.visible = false;
    this.playerCircle = circleLine(0, 0, playerCfg.radius, lineMaterial(cfg.playerColor));
    this.object.add(this.playerCircle);

    // A área muda de lugar e de forma junto com o jogador, então os 4 cantos
    // ficam num atributo dinâmico em vez de uma geometria nova por quadro
    this.attackPositions = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
    this.attackPositions.setUsage(THREE.DynamicDrawUsage);
    const attackGeometry = new THREE.BufferGeometry();
    attackGeometry.setAttribute('position', this.attackPositions);
    this.attackBox = new THREE.LineLoop(attackGeometry, lineMaterial(cfg.attackColor));
    this.attackBox.renderOrder = 999;
    // o culling usaria a esfera da geometria vazia e esconderia a caixa
    // longe do centro; pra linha de debug, desligar é mais barato que recalcular
    this.attackBox.frustumCulled = false;
    this.attackBox.visible = false;
    this.object.add(this.attackBox);

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'F1') {
        // sem isso o navegador abre a página de ajuda
        e.preventDefault();
        if (e.repeat) return;
        this.enabled = !this.enabled;
        this.object.visible = this.enabled;
        return;
      }
      // H: fila um dano de teste, só com o debug ligado. O consumo acontece
      // no passo fixo (updateTestDamage), pra colidir com o resto do jogo
      if (e.code === 'KeyH' && !e.repeat && this.enabled) {
        this.testDamageQueued = true;
      }
    });
  }

  // Tecla H = dano de teste no jogador, com a fonte no centro da arena
  // (0, 0). Provisório até o chefe existir (Sprint 3): hoje é o único jeito
  // de machucar o player. Roda no passo fixo pra empurrão e cronômetros de
  // dano andarem junto com o resto do jogo. Se o jogador estiver invencível
  // (rolagem ou pós-acerto), o takeDamage ignora: dá pra conferir a janela
  // de invencibilidade apertando H no meio da rolagem
  updateTestDamage(player: Player, room: RoomCollision): void {
    if (!this.testDamageQueued) return;
    this.testDamageQueued = false;
    player.takeDamage(cfg.testDamage.amount, cfg.testDamage.sourceX, cfg.testDamage.sourceZ, room);
  }

  // Desenha a colisão de uma sala (chamar de novo ao trocar de sala)
  showRoom(room: RoomCollision): void {
    for (const child of [...this.object.children]) {
      if (child !== this.playerCircle && child !== this.attackBox) this.object.remove(child);
    }
    this.object.add(floorLine(room.chao, lineMaterial(cfg.floorColor)));
    const obstacleMaterial = lineMaterial(cfg.obstacleColor);
    for (const o of room.obstaculos) this.object.add(circleLine(o.x, o.z, o.r, obstacleMaterial));
  }

  // Uma vez por quadro desenhado: conta o FPS e acompanha o pé do jogador
  sync(player: Player): void {
    this.player = player;
    const second = Math.floor(performance.now() / 1000);
    if (second !== this.second) {
      this.fps = this.frames;
      this.frames = 0;
      this.second = second;
    }
    this.frames++;
    this.playerCircle.position.set(player.x, 0, player.z);

    // A área de acerto só existe enquanto o golpe está ativo (fase 'active');
    // no resto do tempo a caixa fica escondida
    const hitbox = player.getAttackHitbox();
    if (hitbox) {
      const p = this.attackPositions.array as Float32Array;
      // cantos na ordem pro LineLoop fechar o retângulo
      p[0] = hitbox.xMin; p[1] = LINE_Y; p[2] = hitbox.zMin;
      p[3] = hitbox.xMax; p[4] = LINE_Y; p[5] = hitbox.zMin;
      p[6] = hitbox.xMax; p[7] = LINE_Y; p[8] = hitbox.zMax;
      p[9] = hitbox.xMin; p[10] = LINE_Y; p[11] = hitbox.zMax;
      this.attackPositions.needsUpdate = true;
      this.attackBox.visible = true;
    } else {
      this.attackBox.visible = false;
    }
  }

  drawHud(g: CanvasRenderingContext2D): void {
    if (!this.enabled) return;
    // fonte do sistema só aqui: o debug não faz parte do jogo final
    g.fillStyle = cfg.textColor;
    g.font = '8px monospace';
    g.textBaseline = 'top';
    g.textAlign = 'right';
    g.fillText(`${this.fps} FPS`, cfg.fpsRightX, cfg.fpsY);
    // linha de QA: estado do player, vida, stamina, cargas de cura e a flag
    // de invencibilidade (só ferramenta de teste; o HUD final mora em ui/hud.ts)
    if (this.player) {
      // no ataque, a fase entra junto do estado ("attacking:active"), pra
      // conferir os tempos do COMBATE.md de olho
      const phase = this.player.state === 'attacking' ? `:${this.player.attackPhase}` : '';
      const invuln = this.player.invulnerable ? ' | invuln' : '';
      const hp = Math.round(this.player.health);
      const stamina = Math.round(this.player.stamina);
      g.fillText(
        `${this.player.state}${phase} | hp ${hp} | st ${stamina} | heal ${this.player.healCharges}${invuln}`,
        cfg.fpsRightX,
        cfg.playerInfoY,
      );
    }
    g.textAlign = 'left';
  }
}
