import * as THREE from 'three';
import type { Floor, Rect, RoomCollision } from './collision';
import type { Player } from './player';
import { getBossHurtbox, type Boss } from './boss';
import { debug as cfg, player as playerCfg, boss as bossCfg } from './config';

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

function rectLine(rect: Rect, material: THREE.LineBasicMaterial): THREE.LineLoop {
  const corners = [
    new THREE.Vector3(rect.xMin, LINE_Y, rect.zMin),
    new THREE.Vector3(rect.xMax, LINE_Y, rect.zMin),
    new THREE.Vector3(rect.xMax, LINE_Y, rect.zMax),
    new THREE.Vector3(rect.xMin, LINE_Y, rect.zMax),
  ];
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), material);
  line.renderOrder = 999;
  return line;
}

function floorLine(floor: Floor, material: THREE.LineBasicMaterial): THREE.LineLoop {
  if (floor.tipo === 'circulo') return circleLine(floor.x, floor.z, floor.raio, material);
  return rectLine(floor, material);
}

export class DebugView {
  enabled = false;
  readonly object = new THREE.Group();
  private readonly playerCircle: THREE.LineLoop;
  // retângulo da área de acerto do ataque: vértices reescritos a cada quadro,
  // visível só enquanto o golpe está ativo
  private readonly attackBox: THREE.LineLoop;
  private readonly attackPositions: THREE.BufferAttribute;
  // hurtbox do chefe: fixa (ele não anda), então os vértices nascem prontos
  private readonly bossBox: THREE.LineLoop;
  // Círculos das marcas do Ataque 1: pré-criados com raio 1 (o real vem do
  // scale); um a mais que o máximo de marcas por folga. Aviso sai na cor de
  // sangue, raiz estalada na cor de faísca
  private readonly rootCircles: THREE.LineLoop[] = [];
  private readonly rootWarnMaterial = lineMaterial(cfg.rootWarnColor);
  private readonly rootActiveMaterial = lineMaterial(cfg.rootActiveColor);
  private fps = 0;
  private frames = 0;
  private second = -1;
  // referências pras linhas de QA no HUD (estado, vida, stamina, etc.)
  private player: Player | null = null;
  private boss: Boss | null = null;
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

    // Serve pra conferir de olho o acerto do ataque no F1. Guardada em campo
    // porque o showRoom, ao trocar de sala, limpa as linhas da sala sem
    // tocar nos desenhos fixos (player, ataque e esta caixa)
    this.bossBox = rectLine(getBossHurtbox(), lineMaterial(cfg.bossColor));
    this.object.add(this.bossBox);

    // 1 marca embaixo do jogador + até extraMax sorteadas (config), mais
    // uma de folga. frustumCulled desligado, como a caixa do ataque: o
    // culling usaria o círculo unitário parado na origem
    for (let i = 0; i < 2 + bossCfg.roots.extraMax; i++) {
      const circle = circleLine(0, 0, 1, this.rootWarnMaterial);
      circle.frustumCulled = false;
      circle.visible = false;
      this.rootCircles.push(circle);
      this.object.add(circle);
    }

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

  // Desenha a colisão de uma sala (chamar de novo ao trocar de sala).
  // Limpa só as linhas da sala anterior: player, ataque, hurtbox do chefe
  // e círculos das raízes são fixos e ficam
  showRoom(room: RoomCollision): void {
    for (const child of [...this.object.children]) {
      if (child === this.playerCircle || child === this.attackBox || child === this.bossBox) continue;
      if ((this.rootCircles as THREE.Object3D[]).includes(child)) continue;
      this.object.remove(child);
    }
    this.object.add(floorLine(room.chao, lineMaterial(cfg.floorColor)));
    const obstacleMaterial = lineMaterial(cfg.obstacleColor);
    for (const o of room.obstaculos) this.object.add(circleLine(o.x, o.z, o.r, obstacleMaterial));
  }

  // Uma vez por quadro desenhado: conta o FPS e acompanha o pé do jogador
  sync(player: Player, boss: Boss): void {
    this.player = player;
    this.boss = boss;
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

    // Marcas do Ataque 1: seguem a lista do boss com o raio real do acerto
    // no scale; a cor muda com a fase, pra ler o perigo de olho
    for (let i = 0; i < this.rootCircles.length; i++) {
      const circle = this.rootCircles[i];
      const strike = boss.roots[i];
      if (!strike) {
        circle.visible = false;
        continue;
      }
      circle.position.set(strike.x, 0, strike.z);
      const r = bossCfg.roots.radius;
      circle.scale.set(r, 1, r);
      circle.material = strike.phase === 'warn' ? this.rootWarnMaterial : this.rootActiveMaterial;
      circle.visible = true;
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
    // linha do chefe: estado, vida e ataque atual ('-' em pausa) — é o
    // confirmador do dano de 10 por golpe enquanto a barra do chefe não
    // existe (Sprint 7), e do ciclo pausa -> ataque
    if (this.boss) {
      g.fillText(
        `boss ${this.boss.state} | hp ${Math.round(this.boss.health)} | atk ${this.boss.currentAttack ?? '-'}`,
        cfg.fpsRightX,
        cfg.bossInfoY,
      );
    }
    g.textAlign = 'left';
  }
}
