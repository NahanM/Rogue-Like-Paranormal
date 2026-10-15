import { items as cfg, player as playerCfg } from './config';
import type { Point, SpawnEntry } from './collision';
import { range } from '../engine/random';
import type { Player } from './player';

// Itens no chão da sala 1 (COMBATE.md, "Itens"; Sprint 6). Só a lógica:
// posição, tipo, vivo/pego. Nada de three.js aqui — o que aparece na tela
// fica no item-view.ts, mesma separação do enemies.ts/enemy-view.ts

// Os três tipos da tabela do COMBATE.md, nomeados como na lista "itens" do
// sala1.json. O mesmo conjunto vale de tipo dos EVENTOS de pickup: a fila
// que o main preenche pra Tarefa 3 (caixa de descrição do LORE.md) carrega
// estes valores — uma fonte só, senão os dois lados descasam
export type ItemKind = 'machadinha' | 'protecao' | 'cicatrizante';

export class Item implements Point {
  x: number;
  z: number;
  readonly kind: ItemKind;
  // pego = morto: some do chão e o teste de pisar não dispara mais
  alive = true;
  // Cronômetro do balanço visual (ESTILO, seção 8: sobe e desce 1 px a cada
  // 0,5 s). A fase inicial é sorteada DENTRO do período, pra os 5 itens da
  // sala não subirem e descerem juntos. Math.random como Rng do range: a
  // fase não precisa ser reproduzível (diferente do passeio do Perturbado)
  bobTime = range(Math.random, 0, cfg.bobPeriod);

  constructor(spawn: SpawnEntry, kind: ItemKind) {
    this.x = spawn.x;
    this.z = spawn.z;
    this.kind = kind;
  }

  // Volta ao spawn, vivo: morrer na sala 1 "recomeça a sala inteira
  // (inimigos e itens voltam)" (COMBATE.md, Morrer). O bobTime NÃO
  // ressorteia nem zera: a onda senoidal é contínua, e um revivido
  // retomando do meio do ciclo é indistinguível de um novo — mesma decisão
  // do cronômetro de opacidade dos inimigos (ver o reset no main.ts)
  reset(spawn: SpawnEntry): void {
    this.x = spawn.x;
    this.z = spawn.z;
    this.alive = true;
  }
}

// Tipos que o createItems conhece, na forma de filtro — espelho do
// KNOWN_ENEMY_KINDS do enemies.ts: o main usa a MESMA lista pra casar
// item ↔ spawn original na foto do reset, e uma fonte só impede um tipo
// futuro esquecido num dos dois lados de descasar o mapa
export const KNOWN_ITEM_KINDS: readonly string[] = ['machadinha', 'protecao', 'cicatrizante'];

// Monta os itens da sala a partir da lista "itens" do .json (o
// parseSpawnList já validou o formato). Tipo fora de KNOWN_ITEM_KINDS é
// ignorado: melhor faltar um item do que quebrar a sala por um typo.
// A ORDEM dos spawns é preservada — o main conta com isso pro mapa de reset
export function createItems(spawns: SpawnEntry[]): Item[] {
  const items: Item[] = [];
  for (const spawn of spawns) {
    if (!KNOWN_ITEM_KINDS.includes(spawn.tipo)) continue;
    // o cast é seguro: o filtro acima só deixa passar os três tipos
    items.push(new Item(spawn, spawn.tipo as ItemKind));
  }
  return items;
}

// Pegar ao pisar (COMBATE.md, Itens: "pegos automaticamente ao pisar
// neles, como no jogo original"). DÚVIDA DO DOC, decidida: o doc não
// define o "pisar" — fica a sobreposição de CÍRCULOS no plano do chão:
// o pé do jogador (player.radius) contra o círculo do item
// (items.pickupRadius, no config). Distância pé-a-item menor que a soma
// dos raios = pegou.
// Devolve o tipo do item pego e já o marca como NÃO-vivo; o EFEITO é
// aplicado por quem chama (o item não conhece munição, proteção nem
// cargas do jogador — as regras moram no Player)
export function checkPickup(player: Player, item: Item): ItemKind | null {
  if (!item.alive) return null;
  const reach = playerCfg.radius + cfg.pickupRadius;
  if (Math.hypot(player.x - item.x, player.z - item.z) >= reach) return null;
  item.alive = false;
  return item.kind;
}
