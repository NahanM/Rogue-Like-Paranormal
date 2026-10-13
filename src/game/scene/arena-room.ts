import * as THREE from 'three';
import { createRng, range } from '../../engine/random';
import { arena as arenaCfg, lights } from '../config';
import { parseCollision, parsePoint } from '../collision';
import arenaData from '../arena.json';
import {
  bossRoots,
  createKitMaterials,
  floorDisc,
  floorRect,
  pillar,
  ritualCircle,
  statue,
  wallBlock,
  type Brazier,
  type KitTextures,
} from './kit';
import { Dust, Embers } from './particles';
import type { Room } from './room';

// Arena do chefe montada com o kit (docs/CENA3D.md, seção Arena).
// As posições são as do ref/arena-3d.html. A colisão vem do arena.json.

const FLOOR_RADIUS = 10.6; // um pouco maior que o andável (10,2), pra borda ficar embaixo do muro
const WALL = { blocks: 44, radius: 11.4 };
const BRAZIER_PILLARS: ReadonlyArray<[number, number]> = [
  [-4.6, 4.3],
  [4.6, 4.3],
  [-4.9, -6.2],
  [4.9, -6.2],
];
const STATUES: ReadonlyArray<[number, number]> = [
  [-8.6, -1.5],
  [8.6, 0.8],
];
const BOSS = { x: 0, z: -1.2 };

// A arena entrega o Room de sempre mais o controle do círculo de ritual:
// ele acende quando o chefe acorda (ESTILO, seção 6). Fica na interface
// própria em vez de entrar no Room, porque a sala 1 não tem círculo
export interface ArenaRoom extends Room {
  setRitualCircleLit(lit: boolean): void;
}

export function createArena(textures: KitTextures): ArenaRoom {
  const rng = createRng(7);
  const materials = createKitMaterials(textures);
  const group = new THREE.Group();

  group.add(floorDisc(materials, 0, 0, FLOOR_RADIUS));
  // chão de fora, mais baixo e mais escuro: some na neblina e a arena não fica flutuando no preto
  group.add(floorRect(materials.outerFloor, 0, 0, 60, 60, -0.4));

  // Círculo de ritual apagado até o chefe acordar (ESTILO, seção 6).
  // setRitualCircleLit acende; o pulso de 2 s acontece no update
  const circle = ritualCircle(materials, BOSS.x, BOSS.z);
  circle.visible = false;
  let circleLit = false;
  let circleTime = 0;
  group.add(circle);

  // Muro em anel. Na frente (perto da câmera) ele é baixo, pra não esconder o jogador,
  // e embaixo no centro fica a entrada
  for (let i = 0; i < WALL.blocks; i++) {
    const angle = (i / WALL.blocks) * Math.PI * 2;
    const front = Math.cos(angle) > 0.55;
    const entrance = Math.abs(Math.sin(angle)) < 0.12 && Math.cos(angle) > 0;
    if (entrance) continue;
    const height = front ? range(rng, 0.5, 1.0) : range(rng, 1.3, 3.1);
    group.add(wallBlock(materials, Math.sin(angle) * WALL.radius, Math.cos(angle) * WALL.radius, height, angle));
  }

  const braziers: Brazier[] = [];
  for (const [x, z] of BRAZIER_PILLARS) {
    const piece = pillar(materials, textures, rng, x, z, true);
    group.add(piece.object);
    if (piece.brazier) braziers.push(piece.brazier);
  }

  for (const [x, z] of STATUES) group.add(statue(materials, x, z));

  // O chefe em si não é peça do kit: vive em src/game/boss.ts + boss-view.ts,
  // montado no main.ts. Aqui ficam só as raízes e o círculo de ritual dele
  group.add(bossRoots(materials, rng, BOSS.x, BOSS.z));

  // luz geral fraca: o resto do clima vem do fogo, da mão e do chefe
  const ambient = new THREE.AmbientLight(lights.ambient.color, lights.ambient.intensity);
  group.add(ambient);

  const dust = new Dust(rng, 0, 0);
  const embers = new Embers(rng, braziers);
  group.add(dust.object, embers.object);

  return {
    object: group,
    collision: parseCollision(arenaData, 'arena.json'),
    spawn: parsePoint(arenaData.chegada, 'arena.json', 'chegada'),
    // Idempotente: o main chama todo passo conforme o estado do chefe
    // ('awake' acende, o resto apaga) e o pulso continua pelo circleTime.
    // Apaga de novo no reset da luta e na morte do chefe (Tarefa 5)
    setRitualCircleLit(lit: boolean): void {
      circleLit = lit;
      circle.visible = lit;
    },
    update(dt: number, reducedMotion: boolean): void {
      ambient.intensity = lights.ambient.intensity;
      for (const b of braziers) b.update(dt, reducedMotion);
      // Círculo aceso: o ouro pulsa num ciclo de 2 s pela opacidade do
      // material (ele é emissivo, não uma luz de verdade — ESTILO, seção 6).
      // Com movimento reduzido fica estático aceso, como as chamas
      if (circleLit) {
        circleTime += dt;
        const c = arenaCfg.circle;
        const pulse = reducedMotion ? 0 : Math.sin((circleTime * Math.PI * 2) / c.pulsePeriod) * c.pulseFraction;
        materials.gold.opacity = c.litOpacity * (1 + pulse);
      }
      // com movimento reduzido, a poeira e as brasas ficam paradas (como no protótipo)
      if (!reducedMotion) {
        dust.update(dt);
        embers.update(dt);
      }
    },
  };
}
