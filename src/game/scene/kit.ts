import * as THREE from 'three';
import { tileUnits } from '../../engine/textures';
import { range, type Rng } from '../../engine/random';
import { lights, PX_POR_UNIDADE } from '../config';
import { FIRE_HEIGHT_PX, FIRE_WIDTH_PX } from './procedural-textures';

// Kit de peças (docs/CENA3D.md, seção Kit de peças).
// Toda sala é montada só com estas funções: cada uma recebe a posição no chão
// e devolve o objeto pronto. Medidas em unidades do mundo, iguais às do protótipo.

// Medidas das peças (CENA3D). Não são números de ajuste de jogo, são a forma das peças.
const WALL_BLOCK = { width: 1.55, depth: 1.0 };
const PILLAR = { width: 1.1, height: 2.2 };
const CAP = { width: 1.4, height: 0.24 };
const BOWL = { top: 0.42, bottom: 0.28, height: 0.3, sides: 8 };
const FLAME_BASE_Y = 2.7;
const RITUAL_RINGS: ReadonlyArray<[number, number]> = [
  [4.0, 4.14],
  [2.7, 2.8],
  [1.0, 1.08],
];
const RITUAL_SPOKES = { count: 8, width: 0.07, length: 1.3, radius: 3.4 };
// alturas pra cima do chão: o suficiente pra não piscar contra ele (z-fighting)
const RITUAL_Y = 0.02;
const ROOTS_Y = 0.03;

export interface KitTextures {
  floor: THREE.Texture;
  wall: THREE.Texture;
  cap: THREE.Texture;
  fire: THREE.Texture[];
}

export interface KitMaterials {
  floor: THREE.MeshLambertMaterial;
  outerFloor: THREE.MeshLambertMaterial;
  wall: THREE.MeshLambertMaterial;
  cap: THREE.MeshLambertMaterial;
  bowl: THREE.MeshLambertMaterial;
  statue: THREE.MeshLambertMaterial;
  gold: THREE.MeshBasicMaterial;
  roots: THREE.MeshBasicMaterial;
}

// Os materiais são criados uma vez por sala e divididos entre as peças
export function createKitMaterials(textures: KitTextures): KitMaterials {
  return {
    floor: new THREE.MeshLambertMaterial({ map: textures.floor }),
    // chão de fora do muro: a mesma pedra, mais apagada, pra sumir na neblina
    outerFloor: new THREE.MeshLambertMaterial({ map: textures.floor, color: 0x555566 }),
    wall: new THREE.MeshLambertMaterial({ map: textures.wall }),
    cap: new THREE.MeshLambertMaterial({ map: textures.cap }),
    bowl: new THREE.MeshLambertMaterial({ color: 0x2b2234 }),
    statue: new THREE.MeshLambertMaterial({ color: 0x8f7d8c }),
    // ouro e sangue são magia: brilham sozinhos, sem depender de luz (ESTILO, seção 5)
    gold: new THREE.MeshBasicMaterial({ color: 0xdcbe74, transparent: true, opacity: 0.5, depthWrite: false }),
    roots: new THREE.MeshBasicMaterial({ color: 0x942c40, transparent: true, opacity: 0.75, depthWrite: false }),
  };
}

// Unidades que uma repetição da textura do material cobre (padrão: 32 px = 1,71)
function tileOf(material: THREE.MeshLambertMaterial): number {
  return material.map ? tileUnits(material.map) : 1.71;
}

// Multiplica as coordenadas de textura de uma geometria inteira
function scaleUVs(geometry: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

// Caixa com a textura na densidade certa em todas as faces (ESTILO, seção 3).
// A BoxGeometry normal estica a textura inteira em cada face: num muro de 3 de altura,
// o tijolo ficaria esticado. Aqui cada face repete a textura conforme o tamanho dela,
// e no lado da caixa a textura começa no pé, então as fiadas de tijolo saem do chão.
function texturedBox(width: number, height: number, depth: number, material: THREE.MeshLambertMaterial): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const tile = tileOf(material);
  // ordem das faces na BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const faceSizes: ReadonlyArray<[number, number]> = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  const uv = geometry.getAttribute('uv');
  faceSizes.forEach(([u, v], face) => {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, (uv.getX(i) * u) / tile, (uv.getY(i) * v) / tile);
    }
  });
  uv.needsUpdate = true;
  return new THREE.Mesh(geometry, material);
}

// Deita um objeto plano (feito em pé, no plano xy) no chão
function layFlat(mesh: THREE.Object3D, y: number): void {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
}

// Chão redondo da arena
export function floorDisc(materials: KitMaterials, x: number, z: number, radius: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 64);
  // a UV do círculo vai de 0 a 1 no diâmetro inteiro
  const repeat = (radius * 2) / tileOf(materials.floor);
  scaleUVs(geometry, repeat, repeat);
  const mesh = new THREE.Mesh(geometry, materials.floor);
  layFlat(mesh, 0);
  mesh.position.x = x;
  mesh.position.z = z;
  return mesh;
}

// Chão retangular (sala 1, e o chão de fora do muro)
export function floorRect(
  material: THREE.MeshLambertMaterial,
  x: number,
  z: number,
  width: number,
  depth: number,
  y = 0,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const tile = tileOf(material);
  scaleUVs(geometry, width / tile, depth / tile);
  const mesh = new THREE.Mesh(geometry, material);
  layFlat(mesh, y);
  mesh.position.x = x;
  mesh.position.z = z;
  return mesh;
}

// Bloco de muro, de pé no chão, virado `angle` em volta do eixo y
export function wallBlock(materials: KitMaterials, x: number, z: number, height: number, angle: number): THREE.Mesh {
  const mesh = texturedBox(WALL_BLOCK.width, height, WALL_BLOCK.depth, materials.wall);
  mesh.position.set(x, height / 2, z);
  mesh.rotation.y = angle;
  return mesh;
}

// Pilar de tijolo com tampa. Com braseiro, ganha bacia, chama e luz (ESTILO, seção 6)
export function pillar(
  materials: KitMaterials,
  textures: KitTextures,
  rng: Rng,
  x: number,
  z: number,
  withBrazier: boolean,
): { object: THREE.Group; brazier: Brazier | null } {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const body = texturedBox(PILLAR.width, PILLAR.height, PILLAR.width, materials.wall);
  body.position.y = PILLAR.height / 2;
  const cap = texturedBox(CAP.width, CAP.height, CAP.width, materials.cap);
  cap.position.y = PILLAR.height + CAP.height / 2;
  group.add(body, cap);

  if (!withBrazier) return { object: group, brazier: null };

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(BOWL.top, BOWL.bottom, BOWL.height, BOWL.sides),
    materials.bowl,
  );
  bowl.position.y = PILLAR.height + CAP.height + BOWL.height / 2;
  group.add(bowl);

  const brazier = new Brazier(x, z, textures.fire, rng);
  group.add(brazier.flame, brazier.light);
  return { object: group, brazier };
}

// Fogo do braseiro: a chama é um Sprite sem luz (brilha sozinha) e a luz pisca junto com ela
export class Brazier {
  readonly x: number;
  readonly z: number;
  readonly light: THREE.PointLight;
  readonly flame: THREE.Sprite;
  private readonly frames: THREE.Texture[];
  private readonly material: THREE.SpriteMaterial;
  private readonly rng: Rng;
  private flicker = 1;
  private nextFlicker = 0;
  private animTime: number;

  constructor(x: number, z: number, frames: THREE.Texture[], rng: Rng) {
    this.x = x;
    this.z = z;
    this.frames = frames;
    this.rng = rng;
    // cada braseiro começa num ponto diferente da animação, pra não piscarem juntos
    this.animTime = rng();

    this.material = new THREE.SpriteMaterial({ map: frames[0], alphaTest: 0.5 });
    this.flame = new THREE.Sprite(this.material);
    // origem no pé da chama, em cima da bacia
    this.flame.center.set(0.5, 0);
    this.flame.position.y = FLAME_BASE_Y;
    this.flame.scale.set(FIRE_WIDTH_PX / PX_POR_UNIDADE, FIRE_HEIGHT_PX / PX_POR_UNIDADE, 1);

    const cfg = lights.brazier;
    this.light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, cfg.decay);
    this.light.position.y = cfg.height;
  }

  update(dt: number, reducedMotion: boolean): void {
    const cfg = lights.brazier;
    this.animTime += dt;
    if (!reducedMotion) {
      // a cada 80 a 120 ms sorteia uma força nova; a chama cresce e encolhe junto
      this.nextFlicker -= dt;
      if (this.nextFlicker <= 0) {
        this.flicker = range(this.rng, cfg.flickerMin, cfg.flickerMax);
        this.nextFlicker = range(this.rng, cfg.flickerIntervalMin, cfg.flickerIntervalMax);
      }
      const frame = Math.floor(this.animTime * 10) % this.frames.length;
      this.material.map = this.frames[frame];
    }
    // lido do config a cada passo, pra dar pra calibrar mexendo só lá
    this.light.intensity = cfg.intensity * this.flicker;
    this.light.distance = cfg.distance;
    this.light.decay = cfg.decay;
    const grow = 0.9 + ((this.flicker - cfg.flickerMin) / (cfg.flickerMax - cfg.flickerMin)) * 0.2;
    this.flame.scale.y = (FIRE_HEIGHT_PX / PX_POR_UNIDADE) * grow;
  }
}

// Estátua provisória: base, corpo e cabeça. Depois vira billboard com arte (ASSETS.md)
export function statue(materials: KitMaterials, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const base = texturedBox(1.2, 0.5, 1.0, materials.wall);
  base.position.y = 0.25;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 1.9, 6), materials.statue);
  body.position.y = 1.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), materials.statue);
  head.position.y = 2.6;
  group.add(base, body, head);
  return group;
}

// Círculo de ritual: 3 anéis e 8 raios de ouro rente ao chão
export function ritualCircle(materials: KitMaterials, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  for (const [inner, outer] of RITUAL_RINGS) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), materials.gold);
    layFlat(ring, RITUAL_Y);
    group.add(ring);
  }
  for (let s = 0; s < RITUAL_SPOKES.count; s++) {
    const angle = (s / RITUAL_SPOKES.count) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.PlaneGeometry(RITUAL_SPOKES.width, RITUAL_SPOKES.length), materials.gold);
    layFlat(spoke, RITUAL_Y);
    // gira no próprio plano antes de deitar, pra apontar pro centro
    spoke.rotation.z = angle;
    spoke.position.x = Math.sin(angle) * RITUAL_SPOKES.radius;
    spoke.position.z = Math.cos(angle) * RITUAL_SPOKES.radius;
    group.add(spoke);
  }
  return group;
}

// Raízes do chefe: faixas finas vermelho-sangue saindo dele pelo chão
export function bossRoots(materials: KitMaterials, rng: Rng, x: number, z: number, count = 12): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  for (let i = 0; i < count; i++) {
    const length = range(rng, 2.5, 7);
    const angle = rng() * Math.PI * 2;
    const distance = 1.6 + length / 2;
    const root = new THREE.Mesh(new THREE.PlaneGeometry(0.09, length), materials.roots);
    layFlat(root, ROOTS_Y);
    root.rotation.z = angle;
    root.position.x = -Math.sin(angle) * distance;
    root.position.z = -Math.cos(angle) * distance;
    group.add(root);
  }
  return group;
}

// Chefe provisório: a massa escura do protótipo, com a luz vermelha pulsando.
// Na Sprint 3 vira o billboard de 7 unidades.
export class BossPlaceholder {
  readonly object: THREE.Group;
  readonly light: THREE.PointLight;
  private time = 0;

  constructor(x: number, z: number) {
    this.object = new THREE.Group();
    this.object.position.set(x, 0, z);
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(2.0, 4.6, 7),
      new THREE.MeshLambertMaterial({ color: 0x241929, emissive: 0x1a0509 }),
    );
    body.position.y = 2.3;
    const cfg = lights.boss;
    this.light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, cfg.decay);
    this.light.position.y = cfg.height;
    this.object.add(body, this.light);
  }

  update(dt: number, reducedMotion: boolean): void {
    const cfg = lights.boss;
    this.time += dt;
    const pulse = reducedMotion ? 0 : Math.sin(this.time * cfg.pulseSpeed) * cfg.pulseFraction;
    this.light.intensity = cfg.intensity * (1 + pulse);
    this.light.distance = cfg.distance;
    this.light.decay = cfg.decay;
  }
}
