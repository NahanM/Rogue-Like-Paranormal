import * as THREE from 'three';
import { getImage, register } from '../engine/assets';
import { imageTexture } from '../engine/textures';

// Personagens em 8 direções (ESTILO, seção 8), com os nomes EXATOS do
// PixelLab nos arquivos de public/assets/personagens/<pasta>/parado/.
// Convenção do mundo (CENA3D.md): south = z+ (baixo na tela), east = x+
export type Direction8 =
  | 'south'
  | 'south-east'
  | 'east'
  | 'north-east'
  | 'north'
  | 'north-west'
  | 'west'
  | 'south-west';

// As 8 direções em ordem: cada uma é o centro de uma fatia de 45°, a
// começar do south (ângulo 0). Serve pro registro das texturas e pro
// índice da fatia no pickDirection8 — a lista e a escolha não descasam
export const DIRECTIONS_8: readonly Direction8[] = [
  'south',
  'south-east',
  'east',
  'north-east',
  'north',
  'north-west',
  'west',
  'south-west',
];

// Escolhe qual das 8 direções um vetor (dx, dz) no plano do chão olha.
// Convenção (CENA3D): south = z+, east = x+. Com atan2(dx, dz), south é
// 0°, east 90°, north 180° e west 270°; cada direção pega a fatia de 45°
// centrada no múltiplo dela (south vai de -22,5° a 22,5°, e assim por
// diante). Vetor (0,0) não tem pra onde olhar: devolve null, e quem
// chamou mantém a direção anterior.
// Este código NÃO gira nem espelha sprite nenhum (ESTILO, seção 3): só
// diz qual das 8 texturas usar — o PixelLab já manda todas prontas
export function pickDirection8(dx: number, dz: number): Direction8 | null {
  if (dx === 0 && dz === 0) return null;
  // fatia mais próxima do ângulo: -4..4 (ex.: -1 = south-west, 4 = north)
  const slice = Math.round(Math.atan2(dx, dz) / (Math.PI / 4));
  // índice na lista; os negativos dão a volta, porque o oeste e o
  // noroeste vivem em ângulos negativos (-90° = west, -135° = north-west)
  const index = ((slice % DIRECTIONS_8.length) + DIRECTIONS_8.length) % DIRECTIONS_8.length;
  return DIRECTIONS_8[index];
}

// Registra as 8 texturas de um personagem no carregador (engine/assets.ts),
// como OBRIGATÓRIAS: a chave <name>_<direção> aponta pra
// <folder>/<direção>.png. Chamar antes do loadAll; uma que falhe derruba o
// carregamento com o caminho na mensagem — é como se acha digitação no
// nome do arquivo
export function registerCharacterSprites(name: string, folder: string): void {
  for (const direction of DIRECTIONS_8) {
    register(`${name}_${direction}`, `${folder}/${direction}.png`);
  }
}

// As 8 texturas de um personagem já registrado, depois do loadAll. O lado
// do plano no mundo NÃO sai daqui: as views tiram do config
// (characters.<nome>.pngSize, tabela da ESTILO, seção 3)
export interface CharacterTextures {
  frames: Record<Direction8, THREE.Texture>;
}

// Monta as 8 texturas de um personagem com getImage + imageTexture
// (Nearest, sRGB, sem mipmap — engine/textures.ts). O <name> tem que ser o
// mesmo do registerCharacterSprites; o erro de chave desconhecida pega a
// divergência no primeiro quadro
export function loadCharacterTextures(name: string): CharacterTextures {
  const frames = {} as Record<Direction8, THREE.Texture>;
  for (const direction of DIRECTIONS_8) {
    const image = getImage(`${name}_${direction}`);
    frames[direction] = imageTexture(image);
  }
  return { frames };
}
