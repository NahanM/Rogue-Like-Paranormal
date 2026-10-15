import * as THREE from 'three';
import type { Floor, Rect, RoomCollision } from './collision';
import type { Player } from './player';
import { getBossHurtbox, type Boss } from './boss';
import { Mulher, type Enemy } from './enemies';
import { debug as cfg, enemies as enemiesCfg, player as playerCfg, boss as bossCfg } from './config';

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
  // Inimigos (Sprint 5): pool criado UMA vez no attachEnemies — a lista é
  // fixa (vem do sala1.json), então não precisa crescer nem encolher. Cada
  // inimigo ganha duas linhas: o círculo do corpo (raio de colisão) e o
  // quadrado da hurtbox, ambos centrados na origem e transladados pro pé
  // no sync
  private enemies: Enemy[] = [];
  private readonly enemyLines: { enemy: Enemy; circle: THREE.LineLoop; box: THREE.LineLoop }[] = [];
  // Inimigos não passam pra arena (COMBATE.md): os desenhos deles seguem a
  // sala 1. Começa ligada porque o jogo começa na sala 1; a transição
  // desliga (main.ts, enterArena)
  private enemiesShown = true;
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

  // Liga os inimigos ao debug, uma vez no arranque (main.ts). As duas
  // linhas por inimigo usam os MESMOS números do jogo: o raio de colisão
  // lido do config por tipo e a hurtbox pela própria hurtbox() do inimigo
  // (lida uma vez, no spawn, só pra extrair a FORMA — a posição é reescrita
  // a cada quadro no sync)
  attachEnemies(enemies: Enemy[]): void {
    this.enemies = enemies;
    const bodyMaterial = lineMaterial(cfg.enemyColor);
    const hurtMaterial = lineMaterial(cfg.enemyHurtboxColor);
    for (const enemy of enemies) {
      const radius = enemiesCfg[enemy.kind].radius;
      const circle = circleLine(0, 0, radius, bodyMaterial);
      const hurt = enemy.hurtbox();
      const halfW = (hurt.xMax - hurt.xMin) / 2;
      const halfD = (hurt.zMax - hurt.zMin) / 2;
      const box = rectLine(
        { xMin: -halfW, xMax: halfW, zMin: -halfD, zMax: halfD },
        hurtMaterial,
      );
      // como a caixa do ataque: o culling mediria a geometria na origem
      circle.frustumCulled = false;
      box.frustumCulled = false;
      this.enemyLines.push({ enemy, circle, box });
      this.object.add(circle, box);
    }
  }

  // Liga/desliga os desenhos dos inimigos junto da sala 1 (eles não passam
  // pra arena — COMBATE.md). O main chama isto na troca de sala, no mesmo
  // lugar onde liga e desliga o enemiesView
  showEnemies(visible: boolean): void {
    this.enemiesShown = visible;
  }

  // Desenha a colisão de uma sala (chamar de novo ao trocar de sala).
  // Limpa só as linhas da sala anterior: player, ataque, hurtbox do chefe,
  // círculos das raízes e as linhas dos inimigos são fixos e ficam
  showRoom(room: RoomCollision): void {
    for (const child of [...this.object.children]) {
      if (child === this.playerCircle || child === this.attackBox || child === this.bossBox) continue;
      if ((this.rootCircles as THREE.Object3D[]).includes(child)) continue;
      if (this.enemyLines.some((l) => l.circle === child || l.box === child)) continue;
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

    // Inimigos: círculo do corpo e quadrado da hurtbox seguindo o pé dos
    // VIVOS; morto esconde os dois (o corpo também some da cena — faíscas
    // no lugar), e fora da sala 1 não aparece nada (showEnemies)
    for (const line of this.enemyLines) {
      const visible = this.enemiesShown && line.enemy.state === 'alive';
      line.circle.visible = visible;
      line.box.visible = visible;
      if (!visible) continue;
      line.circle.position.set(line.enemy.x, 0, line.enemy.z);
      line.box.position.set(line.enemy.x, 0, line.enemy.z);
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
    // linha de QA: estado do player, vida, stamina, cargas de cura, munição
    // de machadinha e proteção (Sprint 6: confere o pegar/resetar de olho)
    // e a flag de invencibilidade (só ferramenta de teste; o HUD final mora
    // em ui/hud.ts)
    if (this.player) {
      // no ataque, a fase entra junto do estado ("attacking:active"), pra
      // conferir os tempos do COMBATE.md de olho
      const phase = this.player.state === 'attacking' ? `:${this.player.attackPhase}` : '';
      const invuln = this.player.invulnerable ? ' | invuln' : '';
      const hp = Math.round(this.player.health);
      const stamina = Math.round(this.player.stamina);
      const prot = this.player.hasProtection ? 'ON' : 'off';
      g.fillText(
        `${this.player.state}${phase} | hp ${hp} | st ${stamina} | heal ${this.player.healCharges} | mach ${this.player.hatchetAmmo} prot ${prot}${invuln}`,
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
    // Linha de QA dos inimigos (Sprint 5): vivos/total e, por inimigo,
    // inicial do tipo + vida, com o comportamento da mulher entre
    // parênteses (o perturbado não tem máquina própria). Confirma de olho
    // o ciclo chase→flee e o reset da sala sem abrir o console
    if (this.enemies.length > 0) {
      const alive = this.enemies.filter((e) => e.state === 'alive').length;
      const parts = this.enemies.map((e) => {
        const letter = e.kind[0];
        if (e.state !== 'alive') return `${letter}:dead`;
        const behavior = e instanceof Mulher ? `(${e.behavior})` : '';
        return `${letter}:${Math.round(e.health)}${behavior}`;
      });
      g.fillText(`enemies ${alive}/${this.enemies.length}: ${parts.join(' ')}`, cfg.fpsRightX, cfg.enemyInfoY);
    }
    g.textAlign = 'left';
  }
}
