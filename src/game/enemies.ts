import { enemies as cfg, player as playerCfg } from './config';
import {
  moveWithCollision,
  rectsOverlap,
  type Point,
  type Rect,
  type RoomCollision,
  type SpawnEntry,
} from './collision';
import { createRng, range, type Rng } from '../engine/random';
import type { Player } from './player';

// Mesma folga do player.ts e do boss.ts: somar 1/60 várias vezes acumula
// erro de arredondamento nas comparações de tempo
const TIME_EPSILON = 1e-6;

// Tipos de inimigo comum (COMBATE.md, "Inimigos comuns"): os dois do jogo
// original, nomeados como na lista "inimigos" do sala1.json
export type EnemyKind = 'perturbado' | 'mulher';

export type EnemyState = 'alive' | 'dead';

// Inimigo comum: só a lógica (posição no chão, vida, estado). Nada de
// three.js aqui: o que aparece na tela fica no enemy-view.ts, mesma
// separação do player.ts/player-view.ts e do boss.ts/boss-view.ts
export interface Enemy extends Point {
  readonly kind: EnemyKind;
  state: EnemyState;
  health: number;
  // Cronômetro do flash branco do acerto (2 frames de jogo, ESTILO seção 8).
  // Público: o enemy-view lê pra clarear o sprite — padrão do player/boss
  hurtFlashTime: number;
  // Passo fixo. Recebe o jogador e a colisão da sala porque o dano de
  // encostar entra pelo player.takeDamage (empurrão com colisão) — como o
  // boss.ts faz com as raízes dele, o main só chama
  update(dt: number, player: Player, room: RoomCollision): void;
  // Dano do ataque do jogador (a Tarefa 2 chama isto). Morto não toma dano
  takeDamage(amount: number): void;
  // Retângulo que leva dano, no plano do chão, centrado no pé: a Tarefa 2
  // testa a área de acerto do jogador contra ele com rectsOverlap (mesma
  // forma do getBossHurtbox da arena)
  hurtbox(): Rect;
  // Volta ao spawn com vida cheia: o respawn dos inimigos no "recomeçar a
  // sala 1" do COMBATE.md (Morrer) é a Tarefa 4 — o método já fica pronto
  reset(spawn: SpawnEntry): void;
}

// Perturbado de Energia (COMBATE.md, Inimigos comuns): fraco e perdido.
// Ignora o jogador, anda numa direção aleatória trocada a cada 0,8–1,6 s e
// só machuca encostando
class Perturbado implements Enemy {
  readonly kind: EnemyKind = 'perturbado';
  x: number;
  z: number;
  state: EnemyState = 'alive';
  health = cfg.perturbado.maxHealth;
  hurtFlashTime = 0;

  // RNG próprio com semente derivada do índice do spawn: cada Perturbado
  // anda de jeito reproduzível entre testes (padrão da cena e do boss), e
  // o reset re-semeia igual pra sala recomeçar com o mesmo passeio
  private readonly rngSeed: number;
  private moveRng: Rng;
  // Direção atual (unitária) e conta regressiva da próxima troca
  private dirX = 0;
  private dirZ = 0;
  private directionTime = 0;

  constructor(spawn: SpawnEntry, spawnIndex: number) {
    // O ponto de spawn não é guardado: o reset (Tarefa 4) recebe o spawn de
    // novo por parâmetro, e duplicar aqui seria estado andando separado
    this.x = spawn.x;
    this.z = spawn.z;
    this.rngSeed = 0x9e37 + spawnIndex;
    this.moveRng = createRng(this.rngSeed);
    this.pickDirection();
  }

  update(dt: number, player: Player, room: RoomCollision): void {
    this.hurtFlashTime = Math.max(0, this.hurtFlashTime - dt);
    if (this.state !== 'alive') return; // morto não anda, não machuca

    // Troca de direção por tempo: a cada 0,8–1,6 s sorteados (COMBATE.md)
    this.directionTime -= dt;
    if (this.directionTime <= TIME_EPSILON) this.pickDirection();

    // Anda ignorando o jogador. O moveWithCollision desliza na parede e nos
    // pilares; se ficar preso num canto, o deslize resolve e a próxima troca
    // muda o rumo — não precisa de tratamento especial (COMBATE.md: ele é
    // perdido, não esperto)
    const c = cfg.perturbado;
    const next = moveWithCollision(room, this, this.dirX * c.speed * dt, this.dirZ * c.speed * dt, c.radius);
    this.x = next.x;
    this.z = next.z;

    // Ataque: só por encostar (COMBATE.md) — o retângulo de 14x14 px no pé
    // dele contra o quadrado do corpo do jogador (decisão no config.ts).
    // O takeDamage resolve dano, empurrão pra longe do bicho, invencibilidade
    // de 0,4 s e flash do jogador; encostar de novo dentro da invencibilidade
    // não faz nada. SEM tremida de tela (ESTILO, seção 2: tremida só existe
    // pro chefe), então o retorno é ignorado de propósito
    const half = playerCfg.radius;
    const body: Rect = {
      xMin: player.x - half,
      xMax: player.x + half,
      zMin: player.z - half,
      zMax: player.z + half,
    };
    if (rectsOverlap(this.touchArea(), body)) {
      player.takeDamage(c.touchDamage, this.x, this.z, room);
    }
  }

  // Dano recebido: baixa a vida e liga o flash branco (2 frames de jogo,
  // ESTILO seção 8). SEM empurrão: o COMBATE só define empurrão pro jogador.
  // Vida 0: para de andar, de machucar e de tomar dano — o view dispara as
  // faíscas e esconde o corpo lendo este estado (padrão do boss-view)
  takeDamage(amount: number): void {
    if (this.state !== 'alive') return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlashTime = cfg.perturbado.hurt.flashDuration;
    if (this.health === 0) this.state = 'dead';
  }

  // DÚVIDA DO DOC, decidida: o COMBATE.md não define a "área que leva dano"
  // dos inimigos comuns (só a do chefe, 40x60). Fica o mesmo quadrado do
  // corpo de colisão (2 × radius centrado no pé) — é o que o jogador vê e
  // toca, e espelha a leitura do "encostar" na direção contrária
  hurtbox(): Rect {
    const half = cfg.perturbado.radius;
    return { xMin: this.x - half, xMax: this.x + half, zMin: this.z - half, zMax: this.z + half };
  }

  // Tarefa 4 (morrer na sala 1 recomeça a sala inteira): volta ao spawn com
  // vida cheia e vivo, e o passeio recomeça igual — o RNG é re-semeado com
  // a mesma semente da criação
  reset(spawn: SpawnEntry): void {
    this.x = spawn.x;
    this.z = spawn.z;
    this.health = cfg.perturbado.maxHealth;
    this.state = 'alive';
    this.hurtFlashTime = 0;
    this.moveRng = createRng(this.rngSeed);
    this.pickDirection();
  }

  // Área de dano por encostar: 14x14 px (no config, em unidades) centrada
  // no pé dele, no plano do chão
  private touchArea(): Rect {
    const half = cfg.perturbado.touchArea / 2;
    return { xMin: this.x - half, xMax: this.x + half, zMin: this.z - half, zMax: this.z + half };
  }

  // Direção uniforme no círculo: ângulo sorteado em [0, 2π). Junto sai o
  // tempo até a próxima troca (0,8–1,6 s, sorteado a cada vez — COMBATE.md)
  private pickDirection(): void {
    const angle = this.moveRng() * Math.PI * 2;
    this.dirX = Math.cos(angle);
    this.dirZ = Math.sin(angle);
    this.directionTime = range(this.moveRng, cfg.perturbado.directionChange.min, cfg.perturbado.directionChange.max);
  }
}

// Comportamento da Mulher Afogada (COMBATE.md, Inimigos comuns): "persegue
// enquanto está saudável e foge quando está ferida". 'idle' = ainda não viu
// o jogador; 'chase' = perseguindo; 'windup' = preparo do golpe; 'strike' =
// o ÚNICO passo do golpe (instantâneo: o doc define alcance, não duração —
// ver o update); 'cooldown' = a espera de 1,0 s depois do golpe; 'flee' =
// fugindo ferida
export type MulherBehavior = 'idle' | 'chase' | 'windup' | 'strike' | 'cooldown' | 'flee';

// Mulher Afogada: caçadora. PARADA no spawn até ver o jogador; depois
// persegue, ataca corpo a corpo num ciclo preparo → golpe → espera e,
// abaixo de 40% de vida, foge — a menos que fique encurralada, aí ataca
// mesmo assim (COMBATE.md). A classe é EXPORTADA pro debug.ts ler o
// behavior na linha de QA (Tarefa 4)
export class Mulher implements Enemy {
  readonly kind: EnemyKind = 'mulher';
  x: number;
  z: number;
  state: EnemyState = 'alive';
  health = cfg.mulher.maxHealth;
  hurtFlashTime = 0;

  // A máquina é pública pro debug (Tarefa 4) e pro view lerem, no estilo do
  // boss.currentAttack. O ESTADO VIVO/MORTO continua no `state` da
  // interface: behavior é o comportamento enquanto viva
  behavior: MulherBehavior = 'idle';
  // Tempo de preparo decorrido, público pra quando o sprite real do
  // preparo existir (ASSETS.md prevê a animação de atacar): o view anima
  // lendo isto. ENQUANTO NÃO EXISTE sprite: NENHUM aviso visual — o flash
  // branco é TRAVADO pra dano (ESTILO 8) e qualquer outro pisca seria
  // inventado. PENDENTE: o preparo de 0,5 s fica sem telegrafia até a arte
  // chegar; por ora o jogador lê só a aproximação parada
  windupTime = 0;
  // Relógio da espera pós-golpe (interno: quem lê de fora só precisa do
  // behavior, como o boss)
  private cooldownTime = 0;

  // Sem RNG: perseguir e fugir são determinísticos (só posição e vida),
  // então o passeio semeado do Perturbado não existe aqui — e o reset não
  // tem o que re-semear
  constructor(spawn: SpawnEntry) {
    this.x = spawn.x;
    this.z = spawn.z;
  }

  update(dt: number, player: Player, room: RoomCollision): void {
    this.hurtFlashTime = Math.max(0, this.hurtFlashTime - dt);
    if (this.state !== 'alive') return; // morta não age, não machuca

    const c = cfg.mulher;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    // Cruzar o limiar de 40% conta A CADA PASSO (decisão do orquestrador):
    // perseguindo e levou dano pra baixo dele, vira fuga já. E não existe
    // cura pra inimigo: uma vez abaixo, foge até morrer
    const hurt = this.health < c.maxHealth * c.fleeBelowFraction;

    if (this.behavior === 'idle') {
      // Parada no spawn até VER o jogador. DÚVIDA DO DOC, decidida: o
      // COMBATE diz "percebe a 120 px" e se cala sobre esquecer — a sala é
      // pequena: uma vez vista, ela SEMPRE sabe onde ele está (não
      // inventamos memória curta). Cai pro chase já neste passo
      if (dist > c.noticeRange) return;
      this.behavior = 'chase';
    }

    if (this.behavior === 'strike') {
      // O golpe em si saiu na transição do preparo (abaixo). Este passo
      // parada existe pra o estado ficar legível de fora por um ciclo
      // inteiro (debug da Tarefa 4, view com sprite)
      this.behavior = 'cooldown';
      this.cooldownTime = 0;
      return;
    }

    if (this.behavior === 'windup') {
      // Preparo de 0,5 s, parada. Nenhum aviso visual nesta sprint
      // (pendência documentada no windupTime): o COMBATE não define
      // telegrafia pra ela e o flash branco está travado pro dano
      this.windupTime += dt;
      if (this.windupTime < c.windup - TIME_EPSILON) return;
      // Golpe INSTANTÂNEO ao fim do preparo: se o jogador está a ≤ 20 px
      // do pé NESTE instante, toma 15 (COMBATE.md). DÚVIDA DO DOC,
      // decidida: o doc diz só "alcance de 20 px", sem forma — leitura
      // mais simples: CÍRCULO ao redor dela, não cone. O takeDamage
      // resolve empurrão, invencibilidade de 0,4 s e flash do jogador; a
      // tela NÃO treme (ESTILO, seção 2: tremida só existe pro chefe), e
      // o retorno é ignorado de propósito
      this.behavior = 'strike';
      if (dist <= c.attackRange) {
        player.takeDamage(c.damage, this.x, this.z, room);
      }
      return;
    }

    if (this.behavior === 'cooldown') {
      // 1,0 s parada depois do golpe (COMBATE.md) e cai pro comportamento
      // novo já neste passo: ferida foge, sadia persegue
      this.cooldownTime += dt;
      if (this.cooldownTime < c.cooldown - TIME_EPSILON) return;
      this.behavior = hurt ? 'flee' : 'chase';
    }

    // O limiar de 40% também desvia uma perseguição EM CURSO (a checagem
    // aqui vale a cada passo de movimento). Se o preparo ou a recuperação
    // estavam rolando quando a vida cruzou o limiar, eles NÃO interrompem:
    // interromper seria inventar stagger, que o COMBATE não define pra
    // ninguém — o ciclo termina e a decisão acontece na troca de estado
    if (this.behavior === 'chase' && hurt) this.behavior = 'flee';

    // Encurralada a ≤ 20 px — perseguindo é o comportamento normal ("chegou
    // a 20 px, ataca"); em FUGA vale igual, a qualquer momento ("se ficar
    // encurralada a menos de 20 px, ataca mesmo assim" — COMBATE.md). O
    // ciclo é sempre o mesmo: preparo → golpe → espera → volta a fugir se
    // continuar abaixo de 40%
    if (dist <= c.attackRange) {
      this.startWindup();
      return;
    }

    // Persegue na direção do jogador ou foge na oposta, deslizando na
    // parede e nos pilares; presa num canto, fica (decisão do orquestrador
    // — ela é caçadora, não esperta). dist > attackRange > 0 aqui, então a
    // normalização nunca divide por zero
    const ux = this.behavior === 'flee' ? -dx / dist : dx / dist;
    const uz = this.behavior === 'flee' ? -dz / dist : dz / dist;
    const speed = this.behavior === 'flee' ? c.fleeSpeed : c.chaseSpeed;
    const next = moveWithCollision(room, this, ux * speed * dt, uz * speed * dt, c.radius);
    this.x = next.x;
    this.z = next.z;
  }

  // Dano recebido: idêntico ao Perturbado (Tarefa 2) — vida e flash; SEM
  // empurrão nela: o COMBATE só define empurrão pro jogador. Vida 0: para
  // de agir, de machucar e de tomar dano; as faíscas saem no view
  takeDamage(amount: number): void {
    if (this.state !== 'alive') return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlashTime = cfg.mulher.hurt.flashDuration;
    if (this.health === 0) this.state = 'dead';
  }

  // Quadrado de 16x16 px no pé (decisão no config.ts: o porte do sprite,
  // 16x32 como o protagonista)
  hurtbox(): Rect {
    const half = cfg.mulher.hurtbox / 2;
    return { xMin: this.x - half, xMax: this.x + half, zMin: this.z - half, zMax: this.z + half };
  }

  // Tarefa 4 (morrer na sala 1 recomeça a sala inteira): volta ao spawn com
  // vida cheia, viva e sem memória do jogador — 'idle' de novo, parada até
  // ver de novo. Não há RNG pra re-semear: ela é determinística
  reset(spawn: SpawnEntry): void {
    this.x = spawn.x;
    this.z = spawn.z;
    this.health = cfg.mulher.maxHealth;
    this.state = 'alive';
    this.behavior = 'idle';
    this.windupTime = 0;
    this.cooldownTime = 0;
    this.hurtFlashTime = 0;
  }

  // Entra no preparo do golpe: parada, cronômetro zerado. O golpe sai ao
  // fim dos 0,5 s, no update
  private startWindup(): void {
    this.behavior = 'windup';
    this.windupTime = 0;
  }
}

// Tipos que o createEnemies conhece, na forma de filtro. O main usa a
// MESMA lista pra casar inimigo ↔ spawn original na foto do reset (Tarefa
// 4): uma fonte só, senão um tipo futuro esquecido num dos dois lados
// descasava o mapa
export const KNOWN_ENEMY_KINDS: readonly string[] = ['perturbado', 'mulher'];

// Monta os inimigos da sala a partir da lista do .json (parseSpawnList do
// collision.ts já validou o formato). Tipo fora de KNOWN_ENEMY_KINDS é
// ignorado: melhor faltar um bicho do que quebrar a sala por um typo.
// A ORDEM dos spawns é preservada — o main conta com isso pro mapa de reset
export function createEnemies(spawns: SpawnEntry[]): Enemy[] {
  const enemies: Enemy[] = [];
  spawns.forEach((spawn, index) => {
    if (spawn.tipo === 'perturbado') {
      // a semente do passeio deriva do índice do spawn (reproduzível)
      enemies.push(new Perturbado(spawn, index));
      return;
    }
    if (spawn.tipo === 'mulher') {
      enemies.push(new Mulher(spawn));
      return;
    }
    // tipos desconhecidos caem aqui
  });
  return enemies;
}
