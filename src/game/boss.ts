import { boss as cfg, player as playerCfg } from './config';
import { isFree, moveWithCollision, type Point, type Rect, type RoomCollision } from './collision';
import { createRng, range, type Rng } from '../engine/random';
import type { Player } from './player';

// Mesma folga do player.ts: somar 1/60 várias vezes acumula erro de
// arredondamento (48 passos dão 0,7999999 em vez de 0,8), e a fase durava
// um passo a mais
const TIME_EPSILON = 1e-6;

// Estados do chefe (COMBATE.md, Chefe). 'dead': ele se desfez em faíscas
// (o boss-view cuida do visual, ESTILO 8) e a luta fica parada — o estado
// de vitória do jogo é terminal e sem tela até a Sprint 9
export type BossState = 'sleep' | 'awake' | 'dead';

// Ataques do COMBATE.md (Sprint 9): Queda (Ataque 1) e Devastador
// (Ataque 2), que substituiu o golpe em área antigo. A união completa
// devolve as comparações diretas nos ramos do updateAttack/startAttack —
// os artifícios de tipo por string que a Tarefa 2 usou pra preservar o
// ramo antigo saíram junto com ele
export type BossAttack = 'fall' | 'devastator';

// Ataque 1: Queda, o pulo (COMBATE.md). Nasce no 'crouch' (agachado, 0,7 s,
// ainda sem alvo), trava o alvo NO FIM do agachar, voa em arco ('air',
// 0,8 s, sem dano e sem colisão), fere num círculo no ponto da queda
// ('impact', 0,1 s) e fica preso no chão ('stuck', 0,9 s — a janela de
// punição). Público: boss-view lê o arco (fallJumpY), o main lê o gatilho
// do impacto e o debug lê a fase pro HUD
export interface FallAttack {
  phase: 'crouch' | 'air' | 'impact' | 'stuck';
  // tempo dentro da fase atual, em segundos, contado no passo fixo
  time: number;
  // ponto de onde o pulo saiu: a posição do chefe no fim do agachar.
  // O voo interpola origin -> target no x/z
  originX: number;
  originZ: number;
  // ponto travado da queda: decidido NO FIM do agachar (COMBATE.md) e
  // nunca mais muda
  targetX: number;
  targetZ: number;
}

// Ataque 2: Devastador (COMBATE.md). Carga de 1,6 s parado com o círculo
// de aviso de raio 100 px em volta dele escurecendo (visual de tarefa
// futura, ESTILO seção 7 — aqui é só a lógica), estouro de 0,15 s com a
// área ativa no círculo inteiro centrado NELE e 1,4 s exausto — "a
// maior janela pra punir da luta". Público: o debug lê a fase pro HUD
// e o main lê o gatilho do estouro
export interface DevastatorAttack {
  phase: 'charge' | 'burst' | 'exhausted';
  // tempo dentro da fase atual, em segundos, contado no passo fixo
  time: number;
  // Um acerto por estouro: a invencibilidade de 0,4 s do player já cobre
  // a janela de 0,15 s inteira, mas a flag garante o acerto único mesmo
  // com o teste rodando em vários passos da mesma fase (mesma proteção
  // que o padrão do golpe antigo usava)
  hitDone: boolean;
}

// O Deus da Morte: só a lógica (posição no chão, estado, vida).
// Nada de three.js aqui: o que aparece na tela fica no boss-view.ts
// (mesma separação do player.ts / player-view.ts).
export class Boss implements Point {
  // Posição no chão: o chefe ANDA atrás do jogador (COMBATE.md, Chefe,
  // Movimento). Nasce no cfg.position — o centro do Símbolo da Morte
  // (0, -1,2), ponto de nascimento e reset (COMBATE.md, Acordar e
  // "Morrer na arena") — e daqui pra frente quem move é a perseguição
  // abaixo, com colisão. O corpo (raio 20 px = 1,07) é colisão tratada
  // aqui no código: o chefe saiu dos obstáculos do arena.json
  x = cfg.position.x;
  z = cfg.position.z;
  // Andou de fato neste passo? O boss-view liga o bob de andar (ESTILO,
  // seção 8) quando true — mesmo papel do moving dos inimigos
  moving = false;

  state: BossState = 'sleep';
  // COMBATE.md: 300 de vida (30 golpes de 10)
  health = cfg.maxHealth;
  // Cronômetro do flash branco do acerto (2 frames de jogo, ESTILO seção 8).
  // Público: o boss-view lê pra clarear o sprite — padrão do player.ts
  hurtFlashTime = 0;
  // Vetor de OLHAR, normalizado, em unidades do mundo: é ele que o view
  // usa pra escolher a fatia de 45° do sprite de 8 direções (ESTILO,
  // seção 8). Nasce olhando pra south (0, 1) — de frente pra entrada da
  // arena, por onde o jogador chega (decisão visual da Sprint 8)
  lookX = 0;
  lookZ = 1;

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
  // Queda em curso; null = nenhuma. Público: o boss-view lê o arco pelo
  // fallJumpY, o debug lê a fase pro HUD e o main lê o gatilho do impacto
  fall: FallAttack | null = null;
  // Devastador em curso; null = nenhum. Público: o debug lê a fase pro
  // HUD e o main lê o gatilho do estouro (o círculo de aviso desenhado é
  // o visual da tarefa futura da ESTILO, seção 7)
  devastator: DevastatorAttack | null = null;
  // Último ataque usado, pra a escolha respeitar o "NUNCA dois
  // Devastadores seguidos" (COMBATE.md). PRIVADO: só o chooseAttack lê
  private lastAttackKind: BossAttack | null = null;

  // "Um golpe do chefe ACERTOU o jogador neste passo" (Queda ou Devastador;
  // rolar por dentro não conta — o takeDamage do player devolve se pegou).
  // Zerada no começo de todo update e lida pelo main.ts logo depois, só pra
  // disparar a tremida de tela do acerto (ESTILO, seção 2: 2 px, 120 ms)
  playerHitLanded = false;
  // "O chefe ATERRISSOU neste passo" (transição do voo pro impacto da
  // Queda). Mesma mecânica do playerHitLanded: zerada no começo de todo
  // update e lida pelo main logo depois — a tremida do impacto no chão
  // (ESTILO, seção 2: 3 px, 200 ms) é INCONDICIONAL, pegue o jogador ou não
  fallImpactTrigger = false;
  // "O chefe ESTOUROU neste passo" (transição da carga pro estouro do
  // Devastador). Mesma mecânica do fallImpactTrigger: zerada no começo de
  // todo update e lida pelo main logo depois — a tremida do estouro
  // (ESTILO, seção 2: 4 px, 400 ms) é INCONDICIONAL, pegue o jogador ou não
  devastatorBurstTrigger = false;

  // "No ar" da Queda (COMBATE.md: "No ar não leva dano e não colide com
  // nada"). Público: o main suspende a machadinha e o corpo em cima dele, e
  // o takeDamage/o golpe do jogador o respeitam via hittable
  get inAir(): boolean {
    return this.fall?.phase === 'air';
  }

  // Altura do arco durante o voo, em UNIDADES REAIS do mundo (COMBATE.md:
  // "subindo até 2 unidades"). DECISÃO já tomada: horizontal linear, a
  // curva só na altura — parábola senoidal: sin(π·progress) tem o pico
  // EXATO de jumpHeight (2 un) no MEIO do voo, zera nas duas pontas e
  // nunca fica negativo. 0 fora do ar: agachado, no impacto e preso, o
  // chefe está no chão
  get fallJumpY(): number {
    if (!this.inAir || !this.fall) return 0;
    // clamp no 1: o último passo do voo pode passar de cfg.fall.air por um
    // fósfogo do passo fixo, e sin(π·>1) viraria negativo (embaixo do chão)
    const progress = Math.min(1, this.fall.time / cfg.fall.air);
    return cfg.fall.jumpHeight * Math.sin(Math.PI * progress);
  }

  // Pode levar dano agora? Acordado E no chão — "no ar não leva dano"
  // (COMBATE.md). Usado dentro do takeDamage (barrar) e pelo main (não
  // gastar o golpe do jogador marcando attackHitDone num ar que não fere)
  get hittable(): boolean {
    return this.state === 'awake' && !this.inAir;
  }

  // Passo fixo. Precisa do jogador e da colisão da sala: o acordar mede a
  // distância do jogador, a escolha do ataque também, a perseguição anda
  // com colisão, o alvo da Queda precisa caber no chão andável e o dano
  // do impacto entra pelo player.takeDamage (que usa a sala pro empurrão)
  update(dt: number, player: Player, room: RoomCollision): void {
    this.hurtFlashTime = Math.max(0, this.hurtFlashTime - dt);
    // a conta do passo: qualquer acerto (Queda ou Devastador) a levanta
    this.playerHitLanded = false;
    this.fallImpactTrigger = false;
    this.devastatorBurstTrigger = false;
    // todo passo começa parado: só a perseguição abaixo liga, e só quando
    // o pé mexeu de verdade
    this.moving = false;

    // Corpo sólido ANTES de qualquer early-return: dormindo também (um
    // corpo parado continua sólido — sem isto, o jogador atravessaria o
    // chefe dormindo). Morto, o corpo se desfez em faíscas e não colide;
    // NO AR da Queda também não (COMBATE.md: "no ar não colide com nada")
    if (this.state !== 'dead' && !this.inAir) {
      this.pushPlayerOutOfBody(player, room);
    }

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

    // Vetor até o jogador: alimenta o olhar logo abaixo e a perseguição
    // mais abaixo, num cálculo só
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const len = Math.hypot(dx, dz);

    // Olhar: a regra geral é "virado pro jogador, menos no meio de um
    // ataque, que trava a direção" (COMBATE.md, Movimento) — com UMA
    // exceção, decidida pelo orquestrador: na fase 'crouch' da Queda o
    // olhar ACOMPANHA o jogador, porque a linha ESPECÍFICA da fase
    // ("Agachar: Parado, virado pro jogador", COMBATE.md, Ataque 1)
    // prevalece sobre a regra geral. O alvo só trava NO FIM do agachar;
    // com o olhar acompanhando até lá, o sprite nasce coerente com a
    // direção do pulo — travando antes, ele costuma saltar "desvirado"
    // (sprite pro norte, pulo pro leste). Da transição pro 'air' em
    // diante (voo, impacto, preso no chão) e no Devastador INTEIRO
    // (carga, estouro e exausto), congela onde estava; na pausa, volta a
    // virar pro jogador como sempre. O Devastador não ganha exceção: a
    // Carga não traz o "virado pro jogador" que o Agachar da Queda tem
    // (COMBATE.md, Ataque 2) — vale a regra geral do meio do ataque
    // Roda ANTES do updateAttack: no passo em que um ataque nasce, o
    // olhar já aponta pro jogador, e no passo em que o agachar vira voo,
    // o olhar final bate com o alvo travado no mesmo instante. Dormindo
    // e morto a rotina nem chega aqui — mantém o último olhar
    const trackingLook = this.currentAttack === null || this.fall?.phase === 'crouch';
    // Pé em cima do centro do chefe é impossível na prática (o corpo
    // dele empurra o jogador pra fora todo passo); a guarda só evita
    // dividir por zero, mantendo o último olhar
    if (trackingLook && len > 0) {
      this.lookX = dx / len;
      this.lookZ = dz / len;
    }

    // Perseguição (COMBATE.md, Movimento): fora dos ataques, anda em
    // linha reta na direção do jogador, com colisão — desliza em pilar
    // e estátua como o jogador, no raio do próprio corpo. Para a
    // stopDistance dos pés dele (30 px, decisão no config). A pausa
    // entre ataques roda aqui embaixo, então ele anda nesse tempo
    // também ("andando atrás do jogador nesse tempo"). No meio de um
    // ataque, NEM AGACHADO, anda: o agachar é "Parado" (COMBATE.md,
    // Ataque 1) — só o olhar acompanha nele (bloco acima)
    if (this.currentAttack === null && len > cfg.stopDistance) {
      const next = moveWithCollision(room, this, (dx / len) * cfg.speed * dt, (dz / len) * cfg.speed * dt, cfg.bodyRadius);
      // "andou de fato": espremido entre pilar e muro, o deslize pode
      // terminar parado — o bob só liga quando o pé mexeu
      const moved = next.x !== this.x || next.z !== this.z;
      this.x = next.x;
      this.z = next.z;
      this.moving = moved;
    }

    this.updateAttack(dt, player, room);
  }

  // Corpo que empurra (COMBATE.md, Corpo): círculo de raio 20 px no pé.
  // O pé do jogador que entra no círculo (distância centro a centro menor
  // que bodyRadius + raio do jogador) volta pra EXATAMENTE a borda, ao
  // longo da linha que liga os dois — SEM dano, SEM invencibilidade e
  // SEM flash: "empurra o jogador, mas encostar não dá dano". A guarda do
  // "no ar" da Queda (inAir) mora no update, quem chama: aqui o corpo é
  // sempre sólido — separado do resto do passo de propósito
  private pushPlayerOutOfBody(player: Player, room: RoomCollision): void {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const len = Math.hypot(dx, dz);
    // o quanto o pé do jogador penetrou no corpo: empurrão do tamanho
    // exato da penetração deixa os dois ENCOSTADOS (bordas se tocando)
    const overlap = cfg.bodyRadius + playerCfg.radius - len;
    if (overlap > 0) {
      player.shoveAway(this.x, this.z, overlap, room);
    }
  }

  // Reset da luta depois da morte do jogador (COMBATE.md, "Morrer na
  // arena": o chefe volta pro centro do símbolo, dormindo, com vida
  // cheia). Sem Queda nem Devastador no ar. A luz vermelha e o símbolo
  // apagam sozinhos, porque o boss-view e o main leem este estado a cada
  // passo. O RNG de ataques segue de onde parou: a próxima tentativa não
  // repete a sequência da anterior
  reset(): void {
    this.state = 'sleep';
    this.health = cfg.maxHealth;
    // volta ao ponto de nascimento: o centro do Símbolo da Morte
    this.x = cfg.position.x;
    this.z = cfg.position.z;
    this.moving = false;
    this.fall = null;
    this.devastator = null;
    this.currentAttack = null;
    // a memória do "nunca dois Devastadores seguidos" sai junto: entre
    // tentativas diferentes da luta a regra não faz diferença pro jogador
    // (o chefe nem acorda resetado), e recomeçar limpo é o simples
    this.lastAttackKind = null;
    this.attackPause = 0;
    this.hurtFlashTime = 0;
    // olhar volta pra south, de frente pra entrada da arena, igual ao
    // nascimento do chefe
    this.lookX = 0;
    this.lookZ = 1;
  }

  // Enquanto 'awake': ou o ataque atual corre até o chão limpar, ou a
  // pausa conta até o próximo. Nunca os dois ao mesmo tempo: é o que
  // impede spam de ataque (COMBATE.md, Pausa entre ataques)
  private updateAttack(dt: number, player: Player, room: RoomCollision): void {
    if (this.currentAttack === 'fall') {
      this.updateFall(dt, player, room);
      if (this.fall === null) this.endAttack();
      return;
    }
    if (this.currentAttack === 'devastator') {
      this.updateDevastator(dt, player, room);
      if (this.devastator === null) this.endAttack();
      return;
    }

    this.attackPause -= dt;
    if (this.attackPause <= 0) {
      this.startAttack(this.chooseAttack(player));
    }
  }

  // Fim de qualquer ataque: a pausa de 1,2 a 2,0 s é sorteada de novo
  // (COMBATE.md — é a janela pra punir o chefe)
  private endAttack(): void {
    this.currentAttack = null;
    this.attackPause = range(this.attackRng, cfg.attackPause.min, cfg.attackPause.max);
  }

  // COMBATE.md, Escolha do ataque (FINAL): jogador a menos de 70 px do
  // chefe (attackChoice.nearRange, distância pé a pé), 50% Queda / 50%
  // Devastador; mais longe, Queda. O "NUNCA dois Devastadores seguidos"
  // entra pela memória lastAttackKind: o sorteio de perto só deixa SAIR
  // Devastador quando o ataque anterior foi outro
  private chooseAttack(player: Player): BossAttack {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const near = Math.hypot(dx, dz) < cfg.attackChoice.nearRange;
    if (near && this.lastAttackKind !== 'devastator' && this.attackRng() < cfg.attackChoice.devastatorChanceNear) {
      return 'devastator';
    }
    return 'fall';
  }

  private startAttack(kind: BossAttack): void {
    this.currentAttack = kind;
    // registra o ataque aqui, no único caminho de entrada de qualquer um
    // deles: é a memória que o chooseAttack lê no próximo sorteio
    this.lastAttackKind = kind;
    if (kind === 'devastator') {
      this.startDevastator();
      return;
    }
    this.startFall();
  }

  // Disparo da Queda (COMBATE.md, Ataque 1): começa AGACHADO onde o chefe
  // está. O alvo NÃO existe ainda — trava só no fim do agachar
  // (lockFallTarget), que é a janela do jogador de abrir distância
  private startFall(): void {
    this.fall = {
      phase: 'crouch',
      time: 0,
      originX: this.x,
      originZ: this.z,
      targetX: this.x,
      targetZ: this.z,
    };
  }

  // Máquina da Queda (COMBATE.md, tabela do Ataque 1): agachar -> ar ->
  // impacto -> preso no chão -> fim. Nenhuma fase anda nem ataca por fora
  // do alvo: no update, o bloco de perseguição/olhar só roda em pausa
  private updateFall(dt: number, player: Player, room: RoomCollision): void {
    const fall = this.fall;
    // currentAttack === 'fall' com fall null não existe na máquina, mas a
    // guarda desarma o ataque em vez de travar o chefe pra sempre
    if (!fall) return;
    fall.time += dt;

    switch (fall.phase) {
      case 'crouch':
        // Agachar (0,7 s): parado, o olhar ACOMPANHANDO o jogador
        // (exceção do update comentada lá: "Parado, virado pro
        // jogador" — o sprite nasce coerente com a direção do pulo).
        // NO FIM, trava o alvo na posição do jogador naquele instante
        if (fall.time >= cfg.fall.crouch - TIME_EPSILON) {
          this.lockFallTarget(fall, player, room);
          fall.phase = 'air';
          fall.time = 0;
        }
        break;

      case 'air': {
        // Voo (0,8 s): o x/z anda em linha do origin ao target — o
        // horizontal é LINEAR; a curva do pulo é toda na ALTURA, lida
        // pelo fallJumpY (decisão comentada lá). `moving` fica false: o
        // bob de andar não rola num voo, e o corpo não empurra (a guarda
        // do inAir no update)
        const progress = Math.min(1, fall.time / cfg.fall.air);
        this.x = fall.originX + (fall.targetX - fall.originX) * progress;
        this.z = fall.originZ + (fall.targetZ - fall.originZ) * progress;
        if (fall.time >= cfg.fall.air - TIME_EPSILON) {
          // aterrissa EXATAMENTE no alvo travado (o progress linear pode
          // parar um fósfogo antes) e levanta a tremida do passo: o main
          // lê o fallImpactTrigger logo depois do update
          this.x = fall.targetX;
          this.z = fall.targetZ;
          fall.phase = 'impact';
          fall.time = 0;
          this.fallImpactTrigger = true;
        }
        break;
      }

      case 'impact': {
        // Área ativa (0,1 s): círculo de raio cfg.fall.radius no ponto da
        // queda (COMBATE.md: "círculo de raio 40 px no ponto da queda").
        // O teste roda a cada passo da janela, mas a invencibilidade de
        // 0,4 s pós-acerto do jogador (COMBATE.md, Tomar dano) impede o
        // duplo acerto — mesma proteção que as raízes usavam. A fonte do
        // empurrão é o alvo; o empurrão é o de 18 px da Queda
        // (COMBATE.md, "Dano e empurrão"), não os 6 px padrão
        const dx = player.x - fall.targetX;
        const dz = player.z - fall.targetZ;
        if (dx * dx + dz * dz < cfg.fall.radius * cfg.fall.radius) {
          // true = pegou de verdade (não rolou por dentro): levanta a
          // conta do passo, que o main transforma na tremida de acerto
          if (player.takeDamage(cfg.fall.damage, fall.targetX, fall.targetZ, room, cfg.fall.knockback)) {
            this.playerHitLanded = true;
          }
        }
        if (fall.time >= cfg.fall.impact - TIME_EPSILON) {
          fall.phase = 'stuck';
          fall.time = 0;
        }
        break;
      }

      case 'stuck':
        // Preso no chão (0,9 s): "não anda nem ataca" (COMBATE.md) — nada
        // acontece, é a janela de punição. No fim, o updateAttack chama o
        // endAttack, que sorteia a pausa de 1,2 a 2,0 s de novo
        if (fall.time >= cfg.fall.stuck - TIME_EPSILON) {
          this.fall = null;
        }
        break;
    }
  }

  // Trava o alvo da Queda NO FIM do agachar (COMBATE.md: "No fim, trava o
  // alvo na posição do jogador naquele instante"). Duas regras do doc
  // antes do alvo valer:
  //   1. Alcance máximo do pulo: 160 px. Jogador mais longe, o alvo fica a
  //      160 px do chefe, na direção do jogador
  //   2. O ponto da queda tem que CABER o corpo (raio 20 px) no chão
  //      andável: "se não couber (pilar, estátua, borda), puxa o alvo de
  //      volta na direção do chefe até caber". O clamp anda em passos
  //      pequenos na direção do chefe; sem lugar nenhum (espremido contra
  //      o muro), o fallback é a própria posição dele — sempre livre, o
  //      corpo já está lá em pé
  private lockFallTarget(fall: FallAttack, player: Player, room: RoomCollision): void {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    let targetX: number;
    let targetZ: number;
    if (dist > cfg.fall.maxRange) {
      // caso degenerado dist = 0 não chega aqui (0 < maxRange); a direção
      // normalizada do chefe pro jogador é a linha do pulo encurtado
      const dirX = dx / dist;
      const dirZ = dz / dist;
      targetX = this.x + dirX * cfg.fall.maxRange;
      targetZ = this.z + dirZ * cfg.fall.maxRange;
    } else {
      targetX = player.x;
      targetZ = player.z;
    }

    // CLAMP de caber no chão: puxa o alvo em passos de 0,1 un na direção
    // do chefe enquanto (a) o corpo não cabe ali e (b) o alvo ainda está
    // mais longe do chefe que o próprio raio do corpo — mais perto que
    // isso, "puxar de volta" não tem mais pra onde ir. Passo pequeno de
    // algoritmo (não número de ajuste do jogo): escolhido pequeno pra o
    // corpo de 1,07 un nunca nascer atravessando a borda
    const pullStep = 0.1;
    const toBossX = this.x - targetX;
    const toBossZ = this.z - targetZ;
    const toBossLen = Math.hypot(toBossX, toBossZ);
    if (toBossLen > 0) {
      const stepX = (toBossX / toBossLen) * pullStep;
      const stepZ = (toBossZ / toBossLen) * pullStep;
      while (
        !isFree(room, targetX, targetZ, cfg.bodyRadius) &&
        Math.hypot(this.x - targetX, this.z - targetZ) > cfg.bodyRadius
      ) {
        targetX += stepX;
        targetZ += stepZ;
      }
    }
    // não coube em lugar nenhum: a posição do chefe (fallback do doc)
    if (!isFree(room, targetX, targetZ, cfg.bodyRadius)) {
      targetX = this.x;
      targetZ = this.z;
    }

    fall.targetX = targetX;
    fall.targetZ = targetZ;
  }

  // Disparo do Devastador (COMBATE.md, Ataque 2): começa na CARGA, no
  // lugar. Sem mira e sem alvo — a área é o círculo EM VOLTA dele, não
  // há o que travar (a Queda trava o alvo no fim do agachar; aqui nada).
  // Ele fica PARADO na carga: a perseguição do update só roda com
  // currentAttack === null
  private startDevastator(): void {
    this.devastator = { phase: 'charge', time: 0, hitDone: false };
  }

  // Máquina do Devastador (COMBATE.md, tabela do Ataque 2): carga ->
  // estouro -> exausto -> fim. Nenhuma fase anda (a perseguição do
  // update só roda em pausa) e o olhar congela nas três (regra geral do
  // "no meio de um ataque", ver o bloco do olhar no update)
  private updateDevastator(dt: number, player: Player, room: RoomCollision): void {
    const devastator = this.devastator;
    // currentAttack === 'devastator' com devastator null não existe na
    // máquina, mas a guarda desarma o ataque em vez de travar o chefe
    // pra sempre (mesma do updateFall)
    if (!devastator) return;
    devastator.time += dt;

    switch (devastator.phase) {
      case 'charge':
        // Carga (1,6 s): parado, o círculo de aviso escurecendo em volta
        // é o visual da tarefa futura (ESTILO, seção 7) — aqui só o tempo
        // corre. No fim o ESTOURO explode e levanta a flag de passo: o
        // main lê o devastatorBurstTrigger logo depois e treme a tela
        if (devastator.time >= cfg.devastator.charge - TIME_EPSILON) {
          devastator.phase = 'burst';
          devastator.time = 0;
          this.devastatorBurstTrigger = true;
        }
        break;

      case 'burst': {
        // Estouro (0,15 s): área ativa é o CÍRCULO INTEIRO de raio
        // cfg.devastator.radius centrado no pé do chefe (COMBATE.md: "o
        // círculo inteiro"). A FONTE do empurrão é o próprio chefe — o
        // círculo é em volta dele, o jogador sai voando pra longe do
        // centro. hitDone fecha um único acerto: a invencibilidade de
        // 0,4 s do jogador já cobre a janela de 0,15 s, mas a flag garante
        // mesmo com o teste rodando a cada passo (padrão do golpe antigo)
        if (!devastator.hitDone) {
          const dx = player.x - this.x;
          const dz = player.z - this.z;
          if (dx * dx + dz * dz < cfg.devastator.radius * cfg.devastator.radius) {
            devastator.hitDone = true;
            // true = pegou de verdade (não rolou por dentro): levanta a
            // conta do passo, que o main transforma na tremida de acerto
            if (player.takeDamage(cfg.devastator.damage, this.x, this.z, room, cfg.devastator.knockback)) {
              this.playerHitLanded = true;
            }
          }
        }
        if (devastator.time >= cfg.devastator.burst - TIME_EPSILON) {
          devastator.phase = 'exhausted';
          devastator.time = 0;
        }
        break;
      }

      case 'exhausted':
        // Exausto (1,4 s): "não anda nem ataca" (COMBATE.md) — a maior
        // janela pra punir da luta. Nada acontece; no fim o updateAttack
        // chama o endAttack, que sorteia a pausa de 1,2 a 2,0 s de novo
        if (devastator.time >= cfg.devastator.exhausted - TIME_EPSILON) {
          this.devastator = null;
        }
        break;
    }
  }

  // Dano do ataque do jogador (10 por golpe, COMBATE.md). A guarda é o
  // getter hittable: dormindo e morto continuam barrados como sempre, e
  // NO AR da Queda também não leva ("no ar não leva dano", COMBATE.md)
  takeDamage(amount: number): void {
    if (!this.hittable) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlashTime = cfg.hurt.flashDuration;
    if (this.health === 0) {
      this.state = 'dead';
      // Queda e Devastador morrem junto (o chão não pode ficar com estado
      // pendurado de um chefe morto — morto na carga, o estouro nunca
      // explode). As faíscas do ESTILO 8 saem no boss-view ao ler a
      // virada pra 'dead'; a tremida de 3 px/400 ms sai no main.ts
      this.fall = null;
      this.devastator = null;
      this.currentAttack = null;
    }
  }

  // Retângulo que leva dano, no plano do chão e centrado no PÉ ATUAL do
  // chefe (COMBATE.md, Chefe: 40x30 px na base do corpo) — ele anda, a
  // área segue junto. Mesma forma do getAttackHitbox do jogador, pra a
  // sobreposição sair pelo rectsOverlap do collision.ts
  hurtbox(): Rect {
    const halfW = cfg.hurtbox.width / 2;
    const halfD = cfg.hurtbox.depth / 2;
    return {
      xMin: this.x - halfW,
      xMax: this.x + halfW,
      zMin: this.z - halfD,
      zMax: this.z + halfD,
    };
  }
}
