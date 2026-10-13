import * as THREE from 'three';
import { createRng } from '../../engine/random';
import { lights } from '../config';
import {
  parseCollision,
  parseExit,
  parsePoint,
  parseSpawnList,
  type ExitZone,
  type SpawnEntry,
} from '../collision';
import sala1Data from '../sala1.json';
import {
  createKitMaterials,
  floorRect,
  pillar,
  wallBlock,
  type Brazier,
  type KitMaterials,
  type KitTextures,
} from './kit';
import { Dust, Embers } from './particles';
import type { Room } from './room';

// Sala 1, montada só com as peças do kit (docs/CENA3D.md, seção "Sala 1").
// Diferente da arena, ela é retangular, então o muro são 4 fiadas retas em vez
// de um anel. Aqui vai só o cenário: a colisão vem do sala1.json, e os inimigos
// e itens da tabela do CENA3D são colocados por quem usa este Room (Sprints 5/6).
// Círculo de ritual, estátuas e raízes não entram: são exclusivos da arena.

// Chão andável (CENA3D): retângulo de x -8,6 a 8,6 e z -5,6 a 5,6
const FLOOR = { width: 17.2, depth: 11.2 };
const FLOOR_HALF_W = 8.6; // FLOOR.width / 2
const FLOOR_HALF_D = 5.6; // FLOOR.depth / 2

// Chão de fora: maior e mais escuro, como a arena faz, pra sala não flutuar no
// preto. Fica um tiquinho abaixo pra não piscar contra o chão andável (z-fighting)
const OUTER_FLOOR = { size: 60, y: -0.4 };

// Medidas do bloco de muro do kit (CENA3D, "Kit de peças"): 1,55 de comprimento
// × 1,0 de profundidade. No kit.ts são detalhe interno da peça; aqui elas mandam
// na disposição das fiadas, então ganham nome próprio
const WALL_BLOCK = { width: 1.55, depth: 1.0 };

// Alturas do muro (CENA3D): 2,4 nos fundos e nas laterais; a frente fica baixa
// (0,8) pra não esconder o jogador — mesmo motivo dos blocos baixos na frente
// da arena
const WALL_HEIGHT = 2.4;
const FRONT_WALL_HEIGHT = 0.8;

// Buraco da saída no muro dos fundos: 2,4 de largura no centro, alinhado com o
// gatilho "saida" do sala1.json (x entre -1,2 e 1,2 livres)
const EXIT_GAP_HALF = 1.2;

// Cada fiada fica PRA FORA do retângulo andável — o centro da fiada a meia
// profundidade de bloco da borda, com a face interna encostada no limite do
// chão. É o mesmo raciocínio da arena (anel de raio 11,4 fora do chão de raio
// 10,2/10,6): a borda do chão some embaixo do muro e não aparece emenda nem
// fresta escura na base da parede
const WALL_OUTSET = WALL_BLOCK.depth / 2;

// Pilares (CENA3D): os do fundo levam braseiro e os da frente não — assim o fogo
// ilumina a metade de cima da sala, longe de onde o jogador entra
const BRAZIER_PILLARS: ReadonlyArray<[number, number]> = [
  [-4.5, -3.8],
  [4.5, -3.8],
];
const PLAIN_PILLARS: ReadonlyArray<[number, number]> = [
  [-4.5, 2.2],
  [4.5, 2.2],
];

// Quantos blocos de 1,55 couberem num lado, arredondando pra cima: a fiada
// passa um tiquinho do comprimento exato, o que deixa as pontas atravessando
// as fiadas vizinhas nos cantos em vez de abrir fresta (CENA3D não pede canto
// milimétrico; vale o visual sem buraco)
function blockCount(length: number): number {
  return Math.ceil(length / WALL_BLOCK.width);
}

// Fiada horizontal (fundos e frente): blocos lado a lado em x, fiada centrada.
// O comprimento cobre o lado inteiro mais a profundidade do bloco nas duas
// pontas, pra alcançar a linha das fiadas laterais nos cantos
function horizontalWallRow(
  group: THREE.Group,
  materials: KitMaterials,
  z: number,
  height: number,
  withExit: boolean,
): void {
  const length = 2 * (FLOOR_HALF_W + WALL_OUTSET);
  const count = blockCount(length);
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5 - count / 2) * WALL_BLOCK.width;
    // Buraco da saída: pula o bloco cujo CENTRO cai dentro do buraco mais meio
    // bloco de margem. Sem a margem, um bloco com o centro na borda do buraco
    // ficaria pendurado sobre ele e a abertura saía irregular; com ela sobram
    // 3,1 livres (o 2,4 do gatilho com folga dos dois lados)
    if (withExit && Math.abs(x) < EXIT_GAP_HALF + WALL_BLOCK.width / 2) continue;
    group.add(wallBlock(materials, x, z, height, 0));
  }
}

// Fiada vertical (laterais): mesma ideia ao longo do z, com os blocos virados
// ±90° pra deitar o comprimento ao longo do lado. O sinal do ângulo é
// indiferente (o bloco é simétrico); ficou ± só pra casar esquerda/direita
function verticalWallRow(group: THREE.Group, materials: KitMaterials, x: number, angle: number): void {
  const length = 2 * (FLOOR_HALF_D + WALL_OUTSET);
  const count = blockCount(length);
  for (let i = 0; i < count; i++) {
    const z = (i + 0.5 - count / 2) * WALL_BLOCK.width;
    group.add(wallBlock(materials, x, z, WALL_HEIGHT, angle));
  }
}

// A sala 1 entrega o Room de sempre mais o gatilho de saída (o "saida" do
// sala1.json — CENA3D.md: pé dentro dele, a tela escurece e o jogador
// aparece na arena). Fica numa interface própria, como o setRitualCircleLit
// da ArenaRoom, porque a arena não tem saída e o Room comum não depende dela
export interface Sala1Room extends Room {
  readonly exit: ExitZone;
  // Spawns de inimigos (a lista "inimigos" do sala1.json — CENA3D, Sala 1).
  // Quem cria os inimigos é o main.ts (Sprint 5): a sala só lê e entrega,
  // pra ele não importar o json uma segunda vez
  readonly enemySpawns: SpawnEntry[];
}

export function createSala1(textures: KitTextures): Sala1Room {
  // semente própria (a arena usa 7): a montagem sai igual a cada teste
  const rng = createRng(11);
  const materials = createKitMaterials(textures);
  const group = new THREE.Group();

  group.add(floorRect(materials.floor, 0, 0, FLOOR.width, FLOOR.depth));
  group.add(floorRect(materials.outerFloor, 0, 0, OUTER_FLOOR.size, OUTER_FLOOR.size, OUTER_FLOOR.y));

  // Muro em volta do retângulo: fundos com altura cheia e o buraco da saída,
  // frente baixa pra não tampar o jogador, laterais com altura cheia
  const backZ = -(FLOOR_HALF_D + WALL_OUTSET);
  const frontZ = FLOOR_HALF_D + WALL_OUTSET;
  const sideX = FLOOR_HALF_W + WALL_OUTSET;
  horizontalWallRow(group, materials, backZ, WALL_HEIGHT, true);
  horizontalWallRow(group, materials, frontZ, FRONT_WALL_HEIGHT, false);
  verticalWallRow(group, materials, -sideX, -Math.PI / 2);
  verticalWallRow(group, materials, sideX, Math.PI / 2);

  const braziers: Brazier[] = [];
  for (const [x, z] of BRAZIER_PILLARS) {
    const piece = pillar(materials, textures, rng, x, z, true);
    group.add(piece.object);
    if (piece.brazier) braziers.push(piece.brazier);
  }
  for (const [x, z] of PLAIN_PILLARS) group.add(pillar(materials, textures, rng, x, z, false).object);

  // luz geral fraca: o resto do clima vem do fogo (ESTILO, seção 6)
  const ambient = new THREE.AmbientLight(lights.ambient.color, lights.ambient.intensity);
  group.add(ambient);

  const dust = new Dust(rng, 0, 0);
  const embers = new Embers(rng, braziers);
  group.add(dust.object, embers.object);

  return {
    object: group,
    collision: parseCollision(sala1Data, 'sala1.json'),
    spawn: parsePoint(sala1Data.inicio, 'sala1.json', 'inicio'),
    // gatilho da saída lido do mesmo json, pra quem consome a sala (main.ts)
    // não precisar importar o arquivo uma segunda vez
    exit: parseExit(sala1Data.saida, 'sala1.json'),
    enemySpawns: parseSpawnList(sala1Data.inimigos, 'sala1.json', 'inimigos'),
    update(dt: number, reducedMotion: boolean): void {
      // intensidade relida do config a cada passo, como a arena: dá pra
      // calibrar a luz mexendo só no config.ts
      ambient.intensity = lights.ambient.intensity;
      // os braseiros releem o config por conta própria no update deles
      for (const b of braziers) b.update(dt, reducedMotion);
      // com movimento reduzido, a poeira e as brasas ficam paradas (como no protótipo)
      if (!reducedMotion) {
        dust.update(dt);
        embers.update(dt);
      }
    },
  };
}
