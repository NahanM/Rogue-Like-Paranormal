import * as THREE from 'three';
import { createRng, range } from '../../engine/random';
import { arena as arenaCfg, lights } from '../config';
import { parseCollision, parsePoint } from '../collision';
import arenaData from '../arena.json';
import {
  bossVeins,
  createKitMaterials,
  floorDisc,
  floorRect,
  pillar,
  puddles,
  statue,
  symbolOfDeath,
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

// A arena entrega o Room de sempre mais o controle do Símbolo da Morte: ele
// acende quando o chefe acorda (CENA3D, Arena; ESTILO, seção 6). Interface
// própria em vez de entrar no Room, porque a sala 1 não tem símbolo
export interface ArenaRoom extends Room {
  setSymbolLit(lit: boolean): void;
}

// A máscara do símbolo entra como PARÂMETRO PRÓPRIO, e não como campo do
// KitTextures: é a única peça cujo arquivo pode faltar SEM versão gerada por
// código (falta = o decalque não monta e fica o chão limpo), e o KitTextures
// é compartilhado com a sala 1, que não tem símbolo nenhum
export function createArena(textures: KitTextures, symbolTexture: THREE.Texture | null): ArenaRoom {
  const rng = createRng(7);
  const materials = createKitMaterials(textures);
  const group = new THREE.Group();

  // chão da arena com textura própria (CENA3D, Arena: chao_arena — dobro de
  // rachaduras, rejunte de sangue seco, respingos de lodo, sem musgo).
  // O chão de FORA (outerFloor) segue a pedra normal, e a Sala 1 continua
  // com o chão comum (CENA3D)
  group.add(floorDisc(materials.arenaFloor, 0, 0, FLOOR_RADIUS));
  // chão de fora, mais baixo e mais escuro: some na neblina e a arena não fica flutuando no preto
  group.add(floorRect(materials.outerFloor, 0, 0, 60, 60, -0.4));

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

  // --- Chão da arena (CENA3D, Arena): Símbolo da Morte, veias e poças, no
  // lugar do círculo de ritual dourado e das raízes decorativas, que saíram.
  // Tudo com o MESMO rng da sala, chamado DEPOIS do muro e dos pilares, pra
  // não alterar os sorteios deles ---

  // Símbolo da Morte centrado no chefe. Diferente do círculo dourado antigo,
  // NÃO começa invisível: dormindo ele aparece, entalhado escuro na pedra
  // (CENA3D, Arena). Se a máscara não carregou (arquivo faltando = textura
  // null), o decalque nem é montado: não existe símbolo gerado por código
  let symbolMaterial: THREE.MeshLambertMaterial | null = null;
  if (symbolTexture) {
    const symbol = symbolOfDeath(symbolTexture, BOSS.x, BOSS.z);
    group.add(symbol.object);
    symbolMaterial = symbol.material;
  }

  // veias saem da borda do símbolo até perto do muro; poças espalhadas com
  // a mesma semente, fora do caminho da entrada (CENA3D, Arena)
  const veins = bossVeins(BOSS.x, BOSS.z, rng);
  group.add(veins.object);
  group.add(puddles(BOSS.x, BOSS.z, rng));

  // luz geral fraca: o resto do clima vem do fogo, da mão e do chefe
  const ambient = new THREE.AmbientLight(lights.ambient.color, lights.ambient.intensity);
  group.add(ambient);

  const dust = new Dust(rng, 0, 0);
  const embers = new Embers(rng, braziers);
  group.add(dust.object, embers.object);

  // Estado do símbolo: só a flag; o visual (cor + emissive pulsando) é
  // aplicado no update, lendo a flag — mesmo padrão do círculo antigo.
  // O cronômetro é próprio da sala e só anda enquanto aceso (como o
  // circleTime de antes): reacender recomeça o ciclo de onde parou
  let symbolLit = false;
  let symbolTime = 0;
  // cores das veias pré-parseadas: o lerp de cada passo não aloca nada
  const veinsSleep = new THREE.Color(arenaCfg.symbol.veinsSleepColor);
  const veinsAwake = new THREE.Color(arenaCfg.symbol.veinsAwakeColor);

  return {
    object: group,
    collision: parseCollision(arenaData, 'arena.json'),
    spawn: parsePoint(arenaData.chegada, 'arena.json', 'chegada'),
    // Idempotente: só seta a flag, chamada todo passo conforme o estado do
    // chefe ('awake' acende; 'sleep' do reset e 'dead' apagam sozinhos, pelo
    // mesmo caminho)
    setSymbolLit(lit: boolean): void {
      symbolLit = lit;
    },
    update(dt: number, reducedMotion: boolean): void {
      ambient.intensity = lights.ambient.intensity;
      for (const b of braziers) b.update(dt, reducedMotion);

      const c = arenaCfg.symbol;
      // relógio do pulso: anda enquanto aceso, pro símbolo E pras veias —
      // por isso mora aqui e não dentro do if do material (que pode nem
      // existir, se a máscara do símbolo tiver faltado)
      if (symbolLit) symbolTime += dt;

      // Símbolo (CENA3D, Arena; ESTILO, seção 6): acordado, o emissive pulsa
      // entre 30% e 100% num ciclo de 2 s — o seno cheio (0,5 + 0,5·sin)
      // varre o intervalo pulseMin..pulseMax inteiro, sem passar do máximo.
      // Não é luz de verdade: o brilho é todo do emissive. Dormindo (ou
      // morto), o entalhe escuro sem brilho: cor de pedra, emissive preto.
      // Com movimento reduzido, o pulso congela no MÁXIMO ("estático aceso",
      // mesma leitura do círculo de ouro antigo)
      if (symbolMaterial) {
        if (symbolLit) {
          const wave = reducedMotion ? c.pulseMax : 0.5 + 0.5 * Math.sin((symbolTime * Math.PI * 2) / c.pulsePeriod);
          symbolMaterial.color.set(c.awakeColor);
          symbolMaterial.emissive.set(c.awakeColor);
          symbolMaterial.emissiveIntensity = c.pulseMin + (c.pulseMax - c.pulseMin) * wave;
        } else {
          symbolMaterial.color.set(c.sleepColor);
          symbolMaterial.emissive.set(0x000000);
          symbolMaterial.emissiveIntensity = 1;
        }
      }

      // Veias (CENA3D, Arena): acordadas, pulsam JUNTAS com a luz do chefe —
      // mesma CADÊNCIA do lights.boss.pulseSpeed (o seno é o mesmo do
      // boss-view), com FASE INDEPENDENTE: o relógio é o symbolTime da sala,
      // não o tempo interno do boss-view, então os dois pulsos não nascem
      // sincronizados de propósito. Clareiam do sangue seco até o vivo.
      // Movimento reduzido: paradas na cor mais clara (p = 1, o "máximo").
      // Dormindo (ou morto), o sangue seco escuro
      if (symbolLit) {
        const p = reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(symbolTime * lights.boss.pulseSpeed);
        veins.material.color.lerpColors(veinsSleep, veinsAwake, p);
      } else {
        veins.material.color.copy(veinsSleep);
      }

      // com movimento reduzido, a poeira e as brasas ficam paradas (como no protótipo)
      if (!reducedMotion) {
        dust.update(dt);
        embers.update(dt);
      }
    },
  };
}
