import { consumeAction, getMoveAxis, type Axis } from '../engine/input';
import { moveWithCollision, type Point, type RoomCollision } from './collision';
import { range } from '../engine/random';
import { player as cfg } from './config';

// Folga nas comparações de tempo. Somar 1/60 várias vezes acumula erro de arredondamento:
// 27 passos dão 0,4499999 em vez de 0,45, e a rolagem andava um passo a mais (51 px em vez de 48)
const TIME_EPSILON = 1e-6;

// Pra onde o sprite está virado. 'side' olha pra direita; esquerda é ele espelhado (ESTILO, seção 8)
export type Facing = 'down' | 'up' | 'side';

// Máquina de estados do protagonista (Sprint 2). 'healing' é o uso do
// cicatrizante: 1,0 s de animação, cura aos 0,7 s, andar a 30% (COMBATE.md)
export type PlayerState = 'normal' | 'rolling' | 'attacking' | 'healing';

// Fases do ataque (COMBATE.md, Atacar): preparo -> golpe -> recuperação.
// Só é válida enquanto state === 'attacking'.
export type AttackPhase = 'windup' | 'active' | 'recover';

// Área de acerto no plano do chão, em unidades do mundo. Quem for levar dano
// (chefe e inimigos, sprints futuras) testa se a própria base toca este
// retângulo. Fora do golpe o método getAttackHitbox devolve null.
export interface AttackHitbox {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

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
  // Cargas do cicatrizante: gasta 1 no aperto do R; se tomar dano antes de a
  // cura entrar (0,7 s), a carga se perde sem curar (COMBATE.md, Cicatrizante)
  healCharges = cfg.heal.startCharges;

  state: PlayerState = 'normal';
  // segundos desde o começo da rolagem: a janela de invencibilidade é medida nele
  rollTime = 0;
  // segundos desde o aperto do R: a cura entra aos 0,7 s e o uso acaba a 1,0 s
  healTime = 0;

  // Cronômetro e fase do ataque: os limites de cada fase moram no config
  attackTime = 0;
  attackPhase: AttackPhase = 'windup';
  // Direção travada do golpe: quem aperta mira com o olhar e a área fica
  // colada nessa direção até o ataque acabar (o facing não gira no meio)
  private attackDirX = 0;
  private attackDirZ = -1;

  // Direção travada da rolagem (COMBATE.md: não muda de direção no meio).
  // Guardada no começo da rolagem e usada até ela terminar.
  private rollDirX = 0;
  private rollDirZ = 0;
  // tempo desde o último gasto de stamina: a regeneração espera o atraso
  // do COMBATE.md (0,6 s) antes de encher
  private staminaIdleTime = Number.POSITIVE_INFINITY;
  // a cura do cicatrizante dispara uma única vez por uso (aos 0,7 s)
  private healedThisUse = false;
  // Cronômetros pós-acerto (COMBATE.md, Tomar dano): invencibilidade de
  // 0,4 s depois do golpe e flash branco de 2 frames de jogo. O flash é
  // público: o player-view lê pra clarear o sprite (ESTILO, seção 8)
  hurtInvulnTime = 0;
  hurtFlashTime = 0;

  // Invencível quando: rolando E dentro da janela [invulnStart, invulnEnd]
  // (0,10 a 0,35 s, limites inclusos — COMBATE.md), OU dentro dos 0,4 s de
  // invencibilidade depois de tomar dano. Quem causa dano pergunta isto
  // primeiro: takeDamage ignora golpe recebido em invencibilidade
  get invulnerable(): boolean {
    if (this.hurtInvulnTime > 0) return true;
    return (
      this.state === 'rolling' &&
      this.rollTime >= cfg.roll.invulnStart &&
      this.rollTime <= cfg.roll.invulnEnd
    );
  }

  placeAt(spot: Point): void {
    this.x = spot.x;
    this.z = spot.z;
    this.walkTime = 0;
  }

  update(dt: number, room: RoomCollision): void {
    // Regeneração: só depois de o atraso inteiro passar sem gastar, e nunca
    // passa do máximo. Vale em qualquer estado (o gasto da rolagem zera o
    // relógio, então ela nunca enche ANTES dos 0,6 s)
    this.staminaIdleTime += dt;
    if (this.staminaIdleTime >= cfg.staminaRegenDelay) {
      this.stamina = Math.min(cfg.maxStamina, this.stamina + cfg.staminaRegenPerSecond * dt);
    }

    // Cronômetros de dano correm no passo fixo: a invencibilidade pós-acerto
    // (0,4 s) e o flash branco (2 frames de jogo) contam tempo daqui
    this.hurtInvulnTime = Math.max(0, this.hurtInvulnTime - dt);
    this.hurtFlashTime = Math.max(0, this.hurtFlashTime - dt);

    // O aperto do Espaço é drenado em todo passo, rolando ou não: segurar a
    // tecla não rola em cadeia e um aperto no meio da rolagem é descartado
    // (sem buffer), pra não disparar outra rolagem colada no fim
    const rollPressed = consumeAction('roll');
    // O ataque (J / clique) segue a mesma regra de dreno: um aperto = uma
    // tentativa. Apertar no preparo, no golpe ou na rolagem morre aqui mesmo
    // (COMBATE.md: sem combo), não fica guardado pra depois
    const attackPressed = consumeAction('attack');
    // O R idem: um aperto = uma tentativa de cicatrizante. Apertado no meio
    // da rolagem, do ataque ou de outro uso, morre aqui sem gastar carga
    const healPressed = consumeAction('heal');

    if (this.state === 'rolling') {
      // rolando, o input de movimento não move o jogador: só a rolagem move
      this.updateRoll(dt, room);
      return;
    }

    if (this.state === 'attacking') {
      // atacando, o jogador fica parado: o input de movimento é ignorado e
      // o facing não muda até o ataque acabar (detalhe no updateAttack)
      this.updateAttack(dt, room, rollPressed);
      return;
    }

    if (this.state === 'healing') {
      // COMBATE.md só prevê uma saída antecipada do uso ("se tomar dano
      // antes dos 0,7 s, perde a carga") e não diz se rolar/atacar cancelam.
      // Sem cancelamento inventado: os apertos de rolar, atacar e de um
      // segundo R foram drenados no topo e se perdem aqui. O uso termina por
      // tempo (1,0 s) ou por dano (no takeDamage)
      this.updateHeal(dt, room);
      return;
    }

    // eixo já normalizado: na diagonal ele não anda mais rápido
    const axis = getMoveAxis();
    this.moving = axis.x !== 0 || axis.y !== 0;

    // Rolar: só do estado normal e com qualquer stamina acima de zero
    if (rollPressed && this.stamina > 0) {
      this.startRoll(axis);
      // no passo em que a rolagem começa, ela já anda o primeiro pedaço
      this.updateRoll(dt, room);
      return;
    }

    // Atacar: só do estado normal, com qualquer stamina acima de zero.
    // Se rolar e atacar chegarem no mesmo passo, a rolagem vence e o aperto
    // do ataque se perde (já foi consumido acima) — caso raro de duas teclas
    // no mesmo quadro, e vale a ordem defensiva primeiro
    if (attackPressed && this.stamina > 0) {
      this.startAttack();
      // como na rolagem, o passo em que o ataque começa já conta tempo
      this.updateAttack(dt, room, false);
      return;
    }

    // Cicatrizante: do estado normal, com pelo menos 1 carga. A carga é
    // gasta no aperto — dano antes dos 0,7 s perde a carga sem curar
    // (COMBATE.md). Se rolar/atacar chegaram no mesmo passo, eles venceram
    // acima e o R se perde sem gastar nada (caso raro de teclas juntas)
    if (healPressed && this.healCharges > 0) {
      this.startHeal();
      this.updateHeal(dt, room);
      return;
    }

    if (!this.moving) {
      this.walkTime = 0;
      return;
    }

    this.walkTime += dt;
    // y do teclado (pra baixo na tela) é o z do mundo
    const next = moveWithCollision(room, this, axis.x * cfg.speed * dt, axis.y * cfg.speed * dt, cfg.radius);
    this.x = next.x;
    this.z = next.z;
    this.updateFacingFromDirection(axis.x, axis.y);
  }

  private startRoll(axis: Axis): void {
    // Regra da stamina (COMBATE.md): dá pra agir com qualquer quantidade acima
    // de zero, mesmo que o custo seja maior que o resto — ao gastar, a stamina
    // para no zero, nunca fica negativa
    this.stamina = Math.max(0, this.stamina - cfg.roll.cost);
    this.staminaIdleTime = 0;

    this.state = 'rolling';
    this.rollTime = 0;

    // Direção travada até o fim: andando, é a direção do eixo; parado, é a
    // direção em que o sprite olha (cima = pra cima na tela = z negativo)
    if (axis.x !== 0 || axis.y !== 0) {
      this.rollDirX = axis.x;
      this.rollDirZ = axis.y;
    } else if (this.facing === 'side') {
      this.rollDirX = this.facingLeft ? -1 : 1;
      this.rollDirZ = 0;
    } else {
      this.rollDirX = 0;
      this.rollDirZ = this.facing === 'up' ? -1 : 1;
    }
    this.updateFacingFromDirection(this.rollDirX, this.rollDirZ);
  }

  private updateRoll(dt: number, room: RoomCollision): void {
    this.rollTime += dt;
    // Velocidade constante: percorre `distance` em `duration`, colidindo com
    // o mesmo raio do andar
    const speed = cfg.roll.distance / cfg.roll.duration;
    const next = moveWithCollision(room, this, this.rollDirX * speed * dt, this.rollDirZ * speed * dt, cfg.radius);
    this.x = next.x;
    this.z = next.z;

    // Placeholder visual: não existe sprite de rolagem, então o boneco usa o
    // sprite de andar (moving = true mantém a animação de lado rolando no
    // player-view, e o balanço de 1 px pra cima/baixo). O facing acompanha a
    // direção travada, pra aparência seguir a rolagem
    this.moving = true;
    this.walkTime += dt;

    if (this.rollTime >= cfg.roll.duration - TIME_EPSILON) {
      this.state = 'normal';
    }
  }

  private startAttack(): void {
    // Mesma regra de stamina da rolagem (COMBATE.md): age com qualquer valor
    // acima de zero, o gasto para no zero e reinicia o atraso de regeneração
    this.stamina = Math.max(0, this.stamina - cfg.attack.cost);
    this.staminaIdleTime = 0;

    this.state = 'attacking';
    this.attackTime = 0;
    this.attackPhase = 'windup';

    // O COMBATE.md só cita movimento reduzido pro cicatrizante ("anda a 30%");
    // pro ataque não diz nada, então adotamos a leitura conservadora: parado
    // durante TODO o ataque (preparo, golpe e recuperação), com input de
    // movimento ignorado. Placeholder visual: não existe sprite de ataque,
    // então o view continua mostrando o sprite parado da direção atual
    this.moving = false;
    this.walkTime = 0;

    // O golpe sai na direção em que o sprite olhava no aperto. O facing fica
    // travado até o fim: a área de acerto não acompanha as teclas depois
    if (this.facing === 'side') {
      this.attackDirX = this.facingLeft ? -1 : 1;
      this.attackDirZ = 0;
    } else {
      this.attackDirX = 0;
      this.attackDirZ = this.facing === 'up' ? -1 : 1;
    }
  }

  private updateAttack(dt: number, room: RoomCollision, rollPressed: boolean): void {
    this.attackTime += dt;

    // Transições por tempo (COMBATE.md, Atacar): preparo 0,15 -> golpe 0,10 ->
    // recuperação 0,30 -> normal. Só no golpe a área de acerto está ativa
    const total = cfg.attack.windup + cfg.attack.active + cfg.attack.recover;
    if (this.attackTime < cfg.attack.windup - TIME_EPSILON) {
      this.attackPhase = 'windup';
    } else if (this.attackTime < cfg.attack.windup + cfg.attack.active - TIME_EPSILON) {
      this.attackPhase = 'active';
    } else if (this.attackTime < total - TIME_EPSILON) {
      this.attackPhase = 'recover';
    } else {
      this.state = 'normal';
      return;
    }

    // Rolar no preparo ou no golpe é proibido — o aperto já foi consumido no
    // topo do update e morre aqui, sem buffer. Na recuperação pode: rola na
    // hora e cancela o resto do ataque (COMBATE.md).
    // A rolagem paga o custo de stamina dela, como sempre
    if (this.attackPhase === 'recover' && rollPressed && this.stamina > 0) {
      this.startRoll(getMoveAxis());
      this.updateRoll(dt, room);
    }
  }

  private startHeal(): void {
    // A carga se gasta NO APERTO, antes de qualquer cura: é o risco do
    // COMBATE.md ("se tomar dano antes dos 0,7 s, perde a carga e não cura")
    this.healCharges--;
    this.state = 'healing';
    this.healTime = 0;
    this.healedThisUse = false;
  }

  private updateHeal(dt: number, room: RoomCollision): void {
    this.healTime += dt;

    // A cura entra uma única vez, aos 0,7 s: valor sorteado entre 25 e 50
    // (Math.random como Rng do helper range), travado no máximo de vida
    if (!this.healedThisUse && this.healTime >= cfg.heal.healAt - TIME_EPSILON) {
      this.healedThisUse = true;
      const amount = range(Math.random, cfg.heal.healMin, cfg.heal.healMax);
      this.health = Math.min(cfg.maxHealth, this.health + amount);
    }

    // Enquanto usa, anda a 30% da velocidade: dá pra mirar a direção e o
    // facing acompanha o eixo. Não existe sprite de cura, então o view segue
    // com o parado/andando da direção atual (placeholder, como no ataque)
    const axis = getMoveAxis();
    this.moving = axis.x !== 0 || axis.y !== 0;
    if (this.moving) {
      this.walkTime += dt;
      const slowSpeed = cfg.speed * cfg.heal.slowFactor;
      const next = moveWithCollision(room, this, axis.x * slowSpeed * dt, axis.y * slowSpeed * dt, cfg.radius);
      this.x = next.x;
      this.z = next.z;
      this.updateFacingFromDirection(axis.x, axis.y);
    } else {
      this.walkTime = 0;
    }

    if (this.healTime >= cfg.heal.duration - TIME_EPSILON) {
      this.state = 'normal';
    }
  }

  // Área de acerto do golpe, só enquanto a fase 'active' durar; fora dela,
  // null. O retângulo (24x16 px do COMBATE.md, convertidos no config) fica
  // colado na frente do personagem, começando na borda do raio de colisão:
  // ex. olhando pra cima, vai de z - radius - depth até z - radius.
  // O chefe e os inimigos (sprints futuras) vão consultar isto pra tomar dano
  getAttackHitbox(): AttackHitbox | null {
    if (this.state !== 'attacking' || this.attackPhase !== 'active') return null;
    const near = cfg.radius;
    const far = cfg.radius + cfg.attack.depth;
    const half = cfg.attack.width / 2;
    // A direção travada é sempre um eixo puro (o sprite só olha pra cima,
    // baixo ou lado), então o retângulo sai alinhado aos eixos
    if (this.attackDirX !== 0) {
      const a = this.x + this.attackDirX * near;
      const b = this.x + this.attackDirX * far;
      return { xMin: Math.min(a, b), xMax: Math.max(a, b), zMin: this.z - half, zMax: this.z + half };
    }
    const a = this.z + this.attackDirZ * near;
    const b = this.z + this.attackDirZ * far;
    return { xMin: this.x - half, xMax: this.x + half, zMin: Math.min(a, b), zMax: Math.max(a, b) };
  }

  // Dano ao jogador (COMBATE.md, Tomar dano). A fonte é o ponto de onde
  // parte o empurrão: ele é jogado 6 px pra LONGE dela. Invencível (janela
  // da rolagem ou os 0,4 s pós-acerto), o golpe passa direto: sem vida,
  // sem empurrão e sem flash
  takeDamage(amount: number, sourceX: number, sourceZ: number, room: RoomCollision): void {
    if (this.invulnerable) return;
    this.health = Math.max(0, this.health - amount);

    // Empurrão com a mesma colisão do andar (se bater na parede, desliza e
    // anda o que der). Direção: da fonte até o jogador, normalizada. Caso
    // degenerado: exatamente em cima da fonte não existe "pra longe" e ele
    // fica sem empurrão (só acontece no teste da tecla H, no centro da arena)
    const dx = this.x - sourceX;
    const dz = this.z - sourceZ;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const k = cfg.hurt.knockback / len;
      const next = moveWithCollision(room, this, dx * k, dz * k, cfg.radius);
      this.x = next.x;
      this.z = next.z;
    }

    this.hurtInvulnTime = cfg.hurt.invulnTime;
    this.hurtFlashTime = cfg.hurt.flashDuration;

    // Dano durante o cicatrizante: a carga já foi gasta no aperto e a cura
    // não entra mais. O COMBATE.md só diz "perde a carga e não cura" e não
    // fala se a animação segue até 1,0 s — adotamos a leitura direta de
    // souls: o golpe interrompe o uso na hora e o jogador volta ao normal
    // (já protegido pelos 0,4 s de invencibilidade). Ataque e rolagem NÃO
    // são interrompidos pelo dano: o documento não fala disso, não inventamos
    if (this.state === 'healing') {
      this.state = 'normal';
    }

    // Vida 0: a morte (animação e tela de derrota) fica pra Sprint 3/9.
    // Por ora a vida só trava em 0 e o jogador segue controlável
  }

  // Escolhe o sprite pela direção: mais pro lado do que pra cima/baixo = sprite
  // de lado; na diagonal exata, vale cima/baixo. Usado pelo andar e pela rolagem
  private updateFacingFromDirection(dx: number, dz: number): void {
    if (Math.abs(dx) > Math.abs(dz)) {
      this.facing = 'side';
      this.facingLeft = dx < 0;
    } else {
      this.facing = dz < 0 ? 'up' : 'down';
    }
  }
}
