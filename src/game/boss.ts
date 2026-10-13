import { boss as cfg } from './config';
import { isFree, type Point, type Rect, type RoomCollision } from './collision';
import { createRng, int, range, type Rng } from '../engine/random';
import type { Player } from './player';

// Mesma folga do player.ts: somar 1/60 várias vezes acumula erro de
// arredondamento (48 passos dão 0,7999999 em vez de 0,8), e a fase durava
// um passo a mais
const TIME_EPSILON = 1e-6;

// Estados do chefe (COMBATE.md, Chefe). 'dead': ele se desfez em faíscas
// (o boss-view cuida do visual, ESTILO 8) e a luta fica parada — o estado
// de vitória do jogo é terminal e sem tela até a Sprint 9
export type BossState = 'sleep' | 'awake' | 'dead';

// Ataques do COMBATE.md. 'roots' = Ataque 1, 'slam' = Ataque 2 (golpe em
// área, Tarefa 4). 'wave' (Ataque 3, opcional) nem entra na escolha ainda;
// quando cairia nela, viram raízes (ver chooseAttack)
export type BossAttack = 'roots' | 'slam';

// Ataque 1: uma marca no chão. Nasce em 'warn' (círculo de aviso, 0,8 s),
// vira 'active' (a raiz sai e fere por 0,4 s) e some da lista — a posição
// fica travada no disparo, então o aviso é a chance de sair de cima
export interface RootStrike {
  x: number;
  z: number;
  phase: 'warn' | 'active';
  // tempo dentro da fase atual, em segundos, contado no passo fixo
  time: number;
}

// Ataque 2: o golpe em área. Nasce no disparo já com a mira travada; fase
// 'windup' é a pose de 0,9 s (só marca o tempo — o perigo entra na
// 'active', que fere por 0,2 s e encerra o golpe)
export interface SlamAttack {
  // Direção da "frente" do golpe, normalizada. DÚVIDA DO COMBATE.md: a
  // frente de um chefe enraizado (não anda nem gira) não é definida no
  // doc. Decisão tomada, a revisar com o autor: mirar na direção do
  // jogador no instante do disparo, padrão souls, travada até o fim
  dirX: number;
  dirZ: number;
  phase: 'windup' | 'active';
  // tempo dentro da fase atual, em segundos, contado no passo fixo
  time: number;
  // Um acerto por golpe: a invencibilidade de 0,4 s do player já cobre os
  // 0,2 s da janela inteira, mas a flag garante mesmo se o update testar a
  // área em vários passos do mesmo slam
  hitDone: boolean;
}

// O Deus da Morte: só a lógica (posição no chão, estado, vida).
// Nada de three.js aqui: o que aparece na tela fica no boss-view.ts
// (mesma separação do player.ts / player-view.ts).
export class Boss implements Point {
  // Posição fixa: ele não anda, fica enraizado no lugar dele (COMBATE.md).
  // O corpo que empurra o jogador (círculo de raio 2,3) mora no arena.json,
  // junto dos outros obstáculos — não duplicar aqui pra não andar separado
  readonly x = cfg.position.x;
  readonly z = cfg.position.z;

  state: BossState = 'sleep';
  // COMBATE.md: 300 de vida (30 golpes de 10)
  health = cfg.maxHealth;
  // Cronômetro do flash branco do acerto (2 frames de jogo, ESTILO seção 8).
  // Público: o boss-view lê pra clarear o sprite — padrão do player.ts
  hurtFlashTime = 0;

  // --- Ataques (COMBATE.md, Escolha do ataque) ---
  // RNG próprio com semente fixa: a luta sai igual a cada abertura do jogo,
  // o que facilita comparar testes no olho (mesma razão das texturas da
  // cena). Se um dia a sessão ganhar semente própria, é só trocar aqui
  private readonly attackRng: Rng = createRng(0xb055);
  // Conta regressiva da pausa entre ataques: sorteada ao acordar e ao fim
  // de cada ataque. Público pra o debug mostrar a janela de punição
  attackPause = 0;
  // Ataque em andamento; null = em pausa. Público pro debug (F1)
  currentAttack: BossAttack | null = null;
  // Marcas e raízes do Ataque 1 em curso; lista vazia = chão limpo.
  // Público: o boss-view desenha e o debug circula, sem depender dos meshes
  roots: RootStrike[] = [];
  // Golpe em área do Ataque 2 em curso; null = chão limpo. Público: o
  // boss-view desenha a pose e o retângulo a partir daqui
  slam: SlamAttack | null = null;

  // "Um golpe do chefe ACERTOU o jogador neste passo" (raiz ou slam; rolar
  // por dentro não conta — o takeDamage do player devolve se pegou). Zerada
  // no começo de todo update e lida pelo main.ts logo depois, só pra
  // disparar a tremida de tela do acerto (ESTILO, seção 2: 2 px, 120 ms)
  playerHitLanded = false;

  // Passo fixo. Precisa do jogador e da colisão da sala: o acordar mede a
  // distância do jogador, a escolha do ataque também, e o dano das raízes
  // entra pelo player.takeDamage (que usa a sala pra empurrão com colisão)
  update(dt: number, player: Player, room: RoomCollision): void {
    this.hurtFlashTime = Math.max(0, this.hurtFlashTime - dt);
    // a conta do passo: qualquer acerto em updateRoots/updateSlam a levanta
    this.playerHitLanded = false;

    if (this.state === 'sleep') {
      // Ainda dorme: o acordar acontece uma única vez, quando o jogador
      // pisa no círculo de ritual (COMBATE.md, Acordar)
      const dx = player.x - this.x;
      const dz = player.z - this.z;
      if (dx * dx + dz * dz <= cfg.wakeRadius * cfg.wakeRadius) {
        this.state = 'awake';
        // Acordou já sorteando a primeira pausa: o jogador ganha a janela
        // de 1,2 a 2,0 s antes do primeiro ataque sair
        this.attackPause = range(this.attackRng, cfg.attackPause.min, cfg.attackPause.max);
      }
      return;
    }

    if (this.state !== 'awake') return; // morto não ataca
    this.updateAttack(dt, player, room);
  }

  // Reset da luta depois da morte do jogador (COMBATE.md, "Morrer": o chefe
  // volta com vida cheia). Dorme de novo, sem raízes nem slam no ar. A luz
  // vermelha e o círculo de ritual apagam sozinhos, porque o boss-view e o
  // main leem este estado a cada passo. O RNG de ataques segue de onde
  // parou: a próxima tentativa não repete a sequência da anterior
  reset(): void {
    this.state = 'sleep';
    this.health = cfg.maxHealth;
    this.roots = [];
    this.slam = null;
    this.currentAttack = null;
    this.attackPause = 0;
    this.hurtFlashTime = 0;
  }

  // Enquanto 'awake': ou o ataque atual corre até o chão limpar, ou a
  // pausa conta até o próximo. Nunca os dois ao mesmo tempo: é o que
  // impede spam de ataque (COMBATE.md, Pausa entre ataques)
  private updateAttack(dt: number, player: Player, room: RoomCollision): void {
    if (this.currentAttack === 'roots') {
      this.updateRoots(dt, player, room);
      if (this.roots.length === 0) this.endAttack();
      return;
    }
    if (this.currentAttack === 'slam') {
      this.updateSlam(dt, player, room);
      if (this.slam === null) this.endAttack();
      return;
    }

    this.attackPause -= dt;
    if (this.attackPause <= 0) {
      this.startAttack(this.chooseAttack(player), player, room);
    }
  }

  // Fim de qualquer ataque: a pausa de 1,2 a 2,0 s é sorteada de novo
  // (COMBATE.md — é a janela pra punir o chefe)
  private endAttack(): void {
    this.currentAttack = null;
    this.attackPause = range(this.attackRng, cfg.attackPause.min, cfg.attackPause.max);
  }

  // COMBATE.md: a menos de 70 px, 60% golpe em área e 40% raízes; mais
  // longe, 80% raízes e 20% onda. A onda é opcional (Ataque 3) e ficou de
  // fora da Sprint 3: PENDENTE — quando a sorte cairia nela, voltamos pras
  // raízes, então de longe o ramo é sempre 'roots' até a onda existir
  private chooseAttack(player: Player): BossAttack {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const near = Math.hypot(dx, dz) < cfg.attackChoice.nearRange;
    if (near) {
      return this.attackRng() < cfg.attackChoice.slamChanceNear ? 'slam' : 'roots';
    }
    return 'roots';
  }

  private startAttack(kind: BossAttack, player: Player, room: RoomCollision): void {
    this.currentAttack = kind;
    if (kind === 'slam') {
      this.startSlamAttack(player);
      return;
    }
    this.startRootsAttack(player, room);
  }

  // Ataque 1 (COMBATE.md, Raízes): uma marca embaixo do jogador e mais 2 a
  // 4 em pontos aleatórios do chão andável, tudo travado no disparo
  private startRootsAttack(player: Player, room: RoomCollision): void {
    this.roots.push({ x: player.x, z: player.z, phase: 'warn', time: 0 });

    const extras = cfg.roots.extraMin + int(this.attackRng, cfg.roots.extraMax - cfg.roots.extraMin + 1);
    let attempts = 0;
    // isFree garante a raiz inteira dentro do chão e fora dos pilares.
    // Se 20 tentativas não acharem ponto (praticamente impossível na arena,
    // raio 10,2), a marca simplesmente falta — melhor faltar do que nascer
    // atravessando o muro
    while (this.roots.length < 1 + extras && attempts < 20) {
      attempts++;
      const spot = this.randomFloorSpot(room);
      if (spot) this.roots.push({ x: spot.x, z: spot.z, phase: 'warn', time: 0 });
    }
  }

  // Ponto uniforme no chão. No círculo: r = sqrt(rng) * raio — sem a raiz
  // quadrada os pontos se acumulam no centro, porque a área cresce com r².
  // Se uma sala futura for retângulo, sorteia x e z direto
  private randomFloorSpot(room: RoomCollision): Point | null {
    const floor = room.chao;
    let x = 0;
    let z = 0;
    if (floor.tipo === 'circulo') {
      const angle = this.attackRng() * Math.PI * 2;
      const r = Math.sqrt(this.attackRng()) * floor.raio;
      x = floor.x + Math.cos(angle) * r;
      z = floor.z + Math.sin(angle) * r;
    } else {
      x = range(this.attackRng, floor.xMin, floor.xMax);
      z = range(this.attackRng, floor.zMin, floor.zMax);
    }
    return isFree(room, x, z, cfg.roots.radius) ? { x, z } : null;
  }

  private updateRoots(dt: number, player: Player, room: RoomCollision): void {
    for (const strike of this.roots) {
      strike.time += dt;
      if (strike.phase === 'warn') {
        if (strike.time >= cfg.roots.warnTime - TIME_EPSILON) {
          strike.phase = 'active';
          strike.time = 0;
        }
        continue;
      }
      // Acerto: círculo no plano do chão — distância do pé do jogador ao
      // centro da raiz menor que o raio (12 px). A invencibilidade pós-acerto
      // do jogador (0,4 s, COMBATE.md Tomar dano) já impede o mesmo disparo
      // de bater duas vezes, então nenhuma flag "já acertou" por raiz: o
      // takeDamage dela ignora golpe recebido em invencibilidade
      const dx = player.x - strike.x;
      const dz = player.z - strike.z;
      if (dx * dx + dz * dz < cfg.roots.radius * cfg.roots.radius) {
        // true = pegou de verdade: levanta a conta do passo, que o main
        // transforma em tremida de tela (ESTILO, seção 2)
        if (player.takeDamage(cfg.roots.damage, strike.x, strike.z, room)) {
          this.playerHitLanded = true;
        }
      }
    }
    // Cumpriu o tempo ativa, some. Chão limpo = fim do ataque
    this.roots = this.roots.filter(
      (s) => s.phase === 'warn' || s.time < cfg.roots.activeTime - TIME_EPSILON,
    );
  }

  // Disparo do Ataque 2: a mira nasce aqui e não muda mais — o preparo de
  // 0,9 s é a janela do jogador pra sair da frente
  private startSlamAttack(player: Player): void {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const len = Math.hypot(dx, dz);
    // Caso degenerado: jogador exatamente no centro do chefe. Na prática
    // impossível (o corpo dele é obstáculo de raio 2,3 no arena.json);
    // vale direção pra baixo da tela, a cara do sprite
    const dirX = len > 0 ? dx / len : 0;
    const dirZ = len > 0 ? dz / len : 1;
    this.slam = { dirX, dirZ, phase: 'windup', time: 0, hitDone: false };
  }

  private updateSlam(dt: number, player: Player, room: RoomCollision): void {
    const slam = this.slam;
    if (!slam) return;
    slam.time += dt;
    if (slam.phase === 'windup') {
      if (slam.time >= cfg.slam.windup - TIME_EPSILON) {
        slam.phase = 'active';
        slam.time = 0;
      }
      return;
    }
    // Área ativa: pé do jogador dentro do retângulo girado toma o golpe uma
    // única vez (hitDone). A fonte do empurrão é o chefe: o jogador é jogado
    // pra longe dele (COMBATE.md, Tomar dano)
    if (!slam.hitDone && this.playerInsideSlam(player, slam)) {
      slam.hitDone = true;
      // true = pegou de verdade (não rolou por dentro): conta pra tremida
      if (player.takeDamage(cfg.slam.damage, this.x, this.z, room)) {
        this.playerHitLanded = true;
      }
    }
    if (slam.time >= cfg.slam.active - TIME_EPSILON) {
      this.slam = null;
    }
  }

  // Teste do retângulo girado: a mira é um ângulo qualquer, então não dá
  // pra usar o rectsOverlap do collision.ts (só caixas alinhadas aos
  // eixos). O pé do jogador é projetado na linha da mira: `along` conta do
  // centro do chefe (0) até a ponta do golpe, `across` mede o desvio
  // lateral contra metade da largura. A área começa na BORDA do corpo
  // (bodyRadius) e vai até bodyRadius + reach — decisão no config.ts: do
  // centro, o corpo empurraria o jogador pra sempre pra fora do golpe.
  // Tem que bater 1:1 com o retângulo do boss-view.ts (mesma origem, mesma
  // rotação, mesmos limites)
  private playerInsideSlam(player: Player, slam: SlamAttack): boolean {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const along = dx * slam.dirX + dz * slam.dirZ;
    const across = -dx * slam.dirZ + dz * slam.dirX;
    return (
      along >= cfg.bodyRadius &&
      along <= cfg.bodyRadius + cfg.slam.reach &&
      Math.abs(across) <= cfg.slam.width / 2
    );
  }

  // Dano do ataque do jogador (10 por golpe, COMBATE.md). Dormindo ou morto,
  // o golpe não faz nada: ele só leva dano acordado
  takeDamage(amount: number): void {
    if (this.state === 'sleep' || this.state === 'dead') return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlashTime = cfg.hurt.flashDuration;
    if (this.health === 0) {
      this.state = 'dead';
      // Raízes e golpe no ar morrem junto (pra não sobrar lixo no chão com
      // o chefe morto). As faíscas do ESTILO 8 saem no boss-view ao ler a
      // virada pra 'dead'; a tremida de 3 px/400 ms sai no main.ts
      this.roots = [];
      this.slam = null;
      this.currentAttack = null;
    }
  }
}

// Retângulo que leva dano, no plano do chão e centrado no chefe (COMBATE.md:
// 40x60 na base do corpo). Mesma forma do getAttackHitbox do jogador, pra
// sobreposição sair pelo rectsOverlap do collision.ts. É função pura e não
// método porque o retângulo é fixo (o chefe não anda): o debug (debug.ts)
// desenha a mesma caixa sem precisar da instância
export function getBossHurtbox(): Rect {
  const halfW = cfg.hurtbox.width / 2;
  const halfD = cfg.hurtbox.depth / 2;
  return {
    xMin: cfg.position.x - halfW,
    xMax: cfg.position.x + halfW,
    zMin: cfg.position.z - halfD,
    zMax: cfg.position.z + halfD,
  };
}
