import * as THREE from 'three';
import type { Floor, Rect, RoomCollision } from './collision';
import type { Player } from './player';
import type { Boss } from './boss';
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
  // hurtbox do chefe: RETÂNGULO DINÂMICO — os cantos nascem centrados NA
  // ORIGEM (a forma 40x30 vem do config, COMBATE.md) e o LineLoop segue o
  // pé dele com position no sync, como os círculos dos inimigos, porque o
  // chefe anda desde a Sprint 9. Guardado em campo porque o showRoom, ao
  // trocar de sala, limpa as linhas da sala sem tocar nos desenhos fixos
  // (player, ataque, este retângulo, o corpo e as áreas dos ataques)
  private readonly bossBox: THREE.LineLoop;
  // Círculo do CORPO do chefe (raio bodyRadius, COMBATE.md, Corpo): colisão
  // tratada no código desde que ele saiu dos obstáculos do arena.json, e o
  // F1 mostra onde ela está. Na cor de obstáculo (#b03a48, CENA3D, Debug),
  // porque corpo de colisão é obstáculo. Segue o pé no sync; morto esconde
  // (o corpo se desfaz em faíscas)
  private readonly bossBodyCircle: THREE.LineLoop;
  // Círculo da ÁREA DO IMPACTO da Queda (raio fall.radius, COMBATE.md,
  // Ataque 1): centrado no ALVO travado (fall.targetX/targetZ), visível no
  // voo (mostra onde vai cair) e na fase 'impact' (a área ativa). Nas
  // outras fases não fere, então some
  private readonly fallCircle: THREE.LineLoop;
  // Círculo do DEVASTADOR (raio devastator.radius, COMBATE.md, Ataque 2):
  // centrado no PÉ do chefe (a área é em volta dele), visível na carga
  // (o aviso) e no estouro (a área ativa); no exausto já não fere mais
  private readonly devastatorCircle: THREE.LineLoop;
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

    // Serve pra conferir de olho o acerto do ataque no F1. Cantos centrados
    // na origem (a forma vem do config): a posição é do sync, que segue o pé
    const halfW = bossCfg.hurtbox.width / 2;
    const halfD = bossCfg.hurtbox.depth / 2;
    this.bossBox = rectLine(
      { xMin: -halfW, xMax: halfW, zMin: -halfD, zMax: halfD },
      lineMaterial(cfg.bossColor),
    );
    // como as linhas dos inimigos: o culling mediria a geometria na origem
    this.bossBox.frustumCulled = false;
    this.object.add(this.bossBox);

    // Corpo do chefe: raio fixo do config no construtor, centrado na
    // origem; frustumCulled desligado pelo mesmo motivo do bossBox
    this.bossBodyCircle = circleLine(0, 0, bossCfg.bodyRadius, lineMaterial(cfg.obstacleColor));
    this.bossBodyCircle.frustumCulled = false;
    this.object.add(this.bossBodyCircle);

    // Áreas dos ataques do chefe: raios fixos do config (bloco boss, não
    // duplicados aqui), círculos centrados na origem criados UMA vez como
    // o corpo — no sync só o position muda (alvo da Queda, pé no
    // Devastador). Cor de área perigosa do inimigo (bossAttackColor).
    // frustumCulled desligado pelo mesmo motivo: o culling mediria a
    // geometria na origem
    this.fallCircle = circleLine(0, 0, bossCfg.fall.radius, lineMaterial(cfg.bossAttackColor));
    this.devastatorCircle = circleLine(0, 0, bossCfg.devastator.radius, lineMaterial(cfg.bossAttackColor));
    this.fallCircle.frustumCulled = false;
    this.devastatorCircle.frustumCulled = false;
    this.object.add(this.fallCircle, this.devastatorCircle);

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
  // Limpa só as linhas da sala anterior: player, ataque, hurtbox e corpo
  // do chefe, as áreas dos ataques dele e as linhas dos inimigos são
  // fixos e ficam
  showRoom(room: RoomCollision): void {
    for (const child of [...this.object.children]) {
      if (child === this.playerCircle || child === this.attackBox || child === this.bossBox) continue;
      if (child === this.bossBodyCircle || child === this.fallCircle || child === this.devastatorCircle) continue;
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

    // Hurtbox e corpo do chefe seguem o PÉ dele (anda desde a Sprint 9),
    // como os círculos dos inimigos. O corpo esconde na morte: o chefe se
    // desfez em faíscas e não há colisão nenhuma ali
    this.bossBox.position.set(boss.x, 0, boss.z);
    this.bossBodyCircle.position.set(boss.x, 0, boss.z);
    this.bossBodyCircle.visible = boss.state !== 'dead';

    // Área do impacto da Queda: no ALVO travado, visível no voo (aviso de
    // onde vai cair) e na fase 'impact' (a área ativa de 0,1 s). A partir
    // do 'stuck' o chão já não fere (COMBATE.md), então some — e cai no
    // else também quando morre no meio do pulo (o takeDamage zera o fall)
    const fall = boss.fall;
    if (fall && (fall.phase === 'air' || fall.phase === 'impact')) {
      this.fallCircle.visible = true;
      this.fallCircle.position.set(fall.targetX, 0, fall.targetZ);
    } else {
      this.fallCircle.visible = false;
    }

    // Devastador: círculo no PÉ do chefe (a área é em volta dele, COMBATE),
    // visível na carga (o aviso que o jogo desenha escurecendo) e no
    // estouro (a área ativa de 0,15 s); no exausto já não fere mais
    const devastator = boss.devastator;
    if (devastator && (devastator.phase === 'charge' || devastator.phase === 'burst')) {
      this.devastatorCircle.visible = true;
      this.devastatorCircle.position.set(boss.x, 0, boss.z);
    } else {
      this.devastatorCircle.visible = false;
    }

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
    // linha do chefe: estado, vida e ataque em curso COM A FASE (ex.:
    // 'fall:air'), pra conferir os tempos do COMBATE.md de olho no F1;
    // '-' em pausa (o currentAttack e o ataque em andamento são
    // consistentes no fim de todo passo, então a fase bate com o tipo)
    if (this.boss) {
      let atk = this.boss.currentAttack ?? '-';
      if (this.boss.fall) atk = `fall:${this.boss.fall.phase}`;
      else if (this.boss.devastator) atk = `devastator:${this.boss.devastator.phase}`;
      g.fillText(
        `boss ${this.boss.state} | hp ${Math.round(this.boss.health)} | atk ${atk}`,
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
