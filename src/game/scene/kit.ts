import * as THREE from 'three';
import { canvasTexture, tileUnits } from '../../engine/textures';
import { int, range, type Rng } from '../../engine/random';
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
// Símbolo da Morte (CENA3D, Kit de peças): decalque quadrado de 8,34 × 8,34
// (156 px da máscara ÷ 18,7), a 0,02 do chão — altura suficiente pra não
// piscar contra ele (z-fighting)
const SYMBOL = { size: 8.34, y: 0.02 };
// Veias do chão da arena (CENA3D, Kit de peças): 12 linhas tortas de sangue,
// da borda do símbolo até perto do muro, a 0,03 do chão. A largura vem em
// texels (1 texel = 1/18,7 un, ESTILO, seção 3) porque o doc fala em
// "2 a 3 texels"
const VEINS = {
  count: 12,
  y: 0.03,
  // borda de saída: círculo inscrito no símbolo (metade do lado) + 0,05
  innerRadius: SYMBOL.size / 2 + 0.05,
  // "até perto do muro": chegada a ~9,5 (o anel de blocos está a 11,4)
  outerRadius: 9.5,
  widthMin: 2 / PX_POR_UNIDADE,
  widthMax: 3 / PX_POR_UNIDADE,
  // trechos da linha torta (CENA3D: 3 a 6)
  segmentsMin: 3,
  segmentsMax: 6,
  // escorregada lateral de cada vértice do passeio, em unidades: as dobras
  wander: 0.45,
  // chacoalhão do ângulo de chegada, pra as veias não saírem todas radiais
  endSpread: 0.4,
  // chacoalhão do raio de chegada, pra o comprimento variar de veia pra veia
  endJitter: 0.3,
  // a bifurcação ("se dividindo uma vez cada") desvia da direção da veia em
  // 30° a 60°, pra um lado sorteado
  branchAngleMin: Math.PI / 6,
  branchAngleMax: Math.PI / 3,
  // dobras do ramo: mais curtas que as da veia principal
  branchWander: 0.2,
};
// Poças do chão da arena (CENA3D, Arena): 10 manchas com semente fixa, raio
// de 0,4 a 1,2, dentro do chão andável e fora do caminho da entrada, a 0,01
const PUDDLES = {
  count: 10,
  y: 0.01,
  radiusMin: 0.4,
  radiusMax: 1.2,
  // chão andável da arena (CENA3D): círculo de raio 10,2 em volta do centro
  floorRadius: 10.2,
  // caminho da entrada (CENA3D): x entre -1,5 e 1,5 com z > 6
  entranceHalfWidth: 1.5,
  entranceZ: 6,
  // tentativas de achar canto fora da entrada; esgotou, a poça pula
  maxTries: 40,
  // blob do miolo: polígono radial de 10 a 16 fatias, raio sorteado por fatia
  blobSlicesMin: 10,
  blobSlicesMax: 16,
  // fração do raio máximo do canvas que cada fatia pode ocupar
  blobMin: 0.6,
  blobMax: 1,
  // lado mínimo do canvas da poça, em px
  minCanvas: 8,
};
// cores das poças (CENA3D, Arena): metade sangue, metade lodo
const PUDDLE_BLOOD = { fill: '#540b1a', border: '#942c40' };
const PUDDLE_MUD = { fill: '#1d0f12', border: '#412e29' };

export interface KitTextures {
  floor: THREE.Texture;
  // chão próprio da arena (CENA3D, Arena): sempre gerado por código
  arenaFloor: THREE.Texture;
  wall: THREE.Texture;
  cap: THREE.Texture;
  fire: THREE.Texture[];
}

export interface KitMaterials {
  floor: THREE.MeshLambertMaterial;
  // chão próprio da arena (CENA3D, Arena)
  arenaFloor: THREE.MeshLambertMaterial;
  outerFloor: THREE.MeshLambertMaterial;
  wall: THREE.MeshLambertMaterial;
  cap: THREE.MeshLambertMaterial;
  bowl: THREE.MeshLambertMaterial;
  statue: THREE.MeshLambertMaterial;
}

// Os materiais são criados uma vez por sala e divididos entre as peças
export function createKitMaterials(textures: KitTextures): KitMaterials {
  return {
    floor: new THREE.MeshLambertMaterial({ map: textures.floor }),
    // chão próprio da arena (CENA3D, Arena): a mesma laje, mais rachada e com
    // rejunte de sangue seco e respingos de lodo — só o disco da arena usa
    arenaFloor: new THREE.MeshLambertMaterial({ map: textures.arenaFloor }),
    // chão de fora do muro: a mesma pedra, mais apagada, pra sumir na neblina
    outerFloor: new THREE.MeshLambertMaterial({ map: textures.floor, color: 0x555566 }),
    wall: new THREE.MeshLambertMaterial({ map: textures.wall }),
    cap: new THREE.MeshLambertMaterial({ map: textures.cap }),
    bowl: new THREE.MeshLambertMaterial({ color: 0x2b2234 }),
    statue: new THREE.MeshLambertMaterial({ color: 0x8f7d8c }),
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

// Chão redondo. Recebe o MATERIAL direto (e não o kit inteiro) porque só a
// arena usa disco — e o chão dela é próprio (CENA3D, Arena), então não dá
// pra esconder a escolha dentro de materials.floor
export function floorDisc(material: THREE.MeshLambertMaterial, x: number, z: number, radius: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 64);
  // a UV do círculo vai de 0 a 1 no diâmetro inteiro
  const repeat = (radius * 2) / tileOf(material);
  scaleUVs(geometry, repeat, repeat);
  const mesh = new THREE.Mesh(geometry, material);
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

// Círculo de ritual e raízes decorativas saíram (Tarefa 4c): o Símbolo da
// Morte, as veias e as poças abaixo tomaram os lugares deles no chão da arena

// --- Chão da arena (CENA3D, Arena): Símbolo da Morte, veias e poças ---
// Decalques deitados com MeshLambert, que a luz do fogo e do chefe ilumina.
// Estados dormindo/acordado das peças são trocados pela montagem da arena.

// Símbolo da Morte (CENA3D, Kit de peças + Arena): no lugar do círculo de
// ritual dourado. A textura é uma MÁSCARA BRANCA — quem pinta é a COR do
// material: dormindo #2b2234, sem brilho, "entalhado na pedra". O emissive
// nasce preto (padrão do Lambert) e quem acende é a montagem da arena: com o
// chefe acordado, cor #942c40 e emissive pulsando entre 30% e 100% num ciclo
// de 2 s (ESTILO, seção 6) — por isso o material sai no retorno. SEM luz
// própria: o brilho é todo do emissive (ESTILO, seção 6)
export function symbolOfDeath(
  texture: THREE.Texture,
  x: number,
  z: number,
): { object: THREE.Group; material: THREE.MeshLambertMaterial } {
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, color: 0x2b2234 });
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  // UV intocada: a máscara é o símbolo inteiro, do primeiro ao último texel
  const symbol = new THREE.Mesh(new THREE.PlaneGeometry(SYMBOL.size, SYMBOL.size), material);
  layFlat(symbol, SYMBOL.y);
  group.add(symbol);
  return { object: group, material };
}

// Ponto no plano do chão, nas coordenadas locais do grupo da peça
type GroundPoint = { x: number; z: number };

// Polilinha torta entre dois pontos do chão (CENA3D: "linhas tortas"): os
// vértices do meio são espalhados ao longo da reta e escorregam pra o lado,
// formando um passeio de `segments` trechos com dobras de até ±`wander`
export function crookedPath(from: GroundPoint, to: GroundPoint, segments: number, rng: Rng, wander: number): GroundPoint[] {
  const points: GroundPoint[] = [from];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  // perpendicular da reta: pra onde os vértices escapam
  const sideX = -dz / length;
  const sideZ = dx / length;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const slide = range(rng, -wander, wander);
    points.push({ x: from.x + dx * t + sideX * slide, z: from.z + dz * t + sideZ * slide });
  }
  points.push(to);
  return points;
}

// Fatia deitada ligando dois pontos do chão. O rotation.z gira a fatia no
// próprio plano ANTES de deitar (o Euler aplica z primeiro), e o eixo
// comprido do plano (o y local) aponta em (−sin, −cos) do ângulo —
// atan2(−dx, −dz) deixa esse eixo paralelo ao trecho
function veinSegment(from: GroundPoint, to: GroundPoint, width: number, material: THREE.MeshLambertMaterial): THREE.Mesh {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const segment = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.hypot(dx, dz)), material);
  layFlat(segment, VEINS.y);
  segment.rotation.z = Math.atan2(-dx, -dz);
  segment.position.x = (from.x + to.x) / 2;
  segment.position.z = (from.z + to.z) / 2;
  return segment;
}

// Vira uma polilinha em fatias deitadas ligando os pontos, dentro do grupo
function layVeinPath(group: THREE.Group, path: GroundPoint[], width: number, material: THREE.MeshLambertMaterial): void {
  for (let i = 0; i + 1 < path.length; i++) {
    group.add(veinSegment(path[i], path[i + 1], width, material));
  }
}

// Veias do chão da arena (CENA3D, Arena): 12 linhas tortas de sangue saindo
// da borda do símbolo até perto do muro, cada uma "se dividindo uma vez".
// Um MeshLambertMaterial só pra TODAS as fatias: dormindo, #540b1a; o pulso
// acordado, clareando até #942c40 junto com a luz do chefe, é aplicado pela
// montagem — por isso o material sai no retorno
export function bossVeins(x: number, z: number, rng: Rng): { object: THREE.Group; material: THREE.MeshLambertMaterial } {
  const material = new THREE.MeshLambertMaterial({ color: 0x540b1a });
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  for (let i = 0; i < VEINS.count; i++) {
    const width = range(rng, VEINS.widthMin, VEINS.widthMax);
    // ponta inicial na borda do símbolo; ponta final perto do muro, com
    // ângulo e raio chacoalhados — o comprimento sai diferente em cada veia
    const angle = rng() * Math.PI * 2;
    const endAngle = angle + range(rng, -VEINS.endSpread, VEINS.endSpread);
    const endRadius = VEINS.outerRadius + range(rng, -VEINS.endJitter, VEINS.endJitter);
    const start = { x: Math.cos(angle) * VEINS.innerRadius, z: Math.sin(angle) * VEINS.innerRadius };
    const end = { x: Math.cos(endAngle) * endRadius, z: Math.sin(endAngle) * endRadius };

    const segments = VEINS.segmentsMin + int(rng, VEINS.segmentsMax - VEINS.segmentsMin + 1);
    const path = crookedPath(start, end, segments, rng, VEINS.wander);
    layVeinPath(group, path, width, material);

    // bifurcação no vértice do meio (CENA3D: "se dividindo uma vez cada"):
    // um ramo com METADE do comprimento que ainda sobra até a ponta, saindo
    // na direção local da veia e desviando 30° a 60° pra um lado sorteado
    const branchIndex = Math.floor(segments / 2);
    const branchFrom = path[branchIndex];
    let remaining = 0;
    for (let s = branchIndex; s + 1 < path.length; s++) {
      remaining += Math.hypot(path[s + 1].x - path[s].x, path[s + 1].z - path[s].z);
    }
    const dirX = branchFrom.x - path[branchIndex - 1].x;
    const dirZ = branchFrom.z - path[branchIndex - 1].z;
    const dirLength = Math.hypot(dirX, dirZ) || 1;
    const deviate = range(rng, VEINS.branchAngleMin, VEINS.branchAngleMax) * (rng() < 0.5 ? -1 : 1);
    const cosDev = Math.cos(deviate);
    const sinDev = Math.sin(deviate);
    const branchLength = remaining / 2;
    const branchTo = {
      x: branchFrom.x + ((dirX * cosDev - dirZ * sinDev) / dirLength) * branchLength,
      z: branchFrom.z + ((dirX * sinDev + dirZ * cosDev) / dirLength) * branchLength,
    };
    // ramo menor: 1 ou 2 trechos, com dobras mais curtas
    const branchPath = crookedPath(branchFrom, branchTo, 1 + int(rng, 2), rng, VEINS.branchWander);
    layVeinPath(group, branchPath, width, material);
  }

  return { object: group, material };
}

// Textura de UMA poça: blob irregular — polígono radial de 10 a 16 fatias
// com o raio sorteado por fatia — preenchido com a cor do miolo e contorno
// de 1-2 px da cor da borda ao redor. Canvas NÃO repetível: cada poça é um
// decalque único no chão
export function puddleTexture(rng: Rng, side: number, fill: string, border: string): THREE.Texture {
  return canvasTexture(
    side,
    side,
    (g) => {
      const half = side / 2;
      // respiro pro contorno não cortar na borda do canvas
      const maxRadius = half - 1.5;
      const slices = PUDDLES.blobSlicesMin + int(rng, PUDDLES.blobSlicesMax - PUDDLES.blobSlicesMin + 1);
      g.fillStyle = fill;
      g.strokeStyle = border;
      g.lineWidth = 1 + int(rng, 2);
      g.beginPath();
      for (let i = 0; i < slices; i++) {
        const sliceAngle = (i / slices) * Math.PI * 2;
        const radius = maxRadius * range(rng, PUDDLES.blobMin, PUDDLES.blobMax);
        const px = half + Math.cos(sliceAngle) * radius;
        const py = half + Math.sin(sliceAngle) * radius;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.stroke();
    },
    false,
  );
}

// Poças do chão da arena (CENA3D, Arena): 10 manchas de raio 0,4 a 1,2
// espalhadas com semente, metade sangue e metade lodo, nenhuma no caminho da
// entrada. Decalques a 0,01 do chão com MeshLambert + alphaTest, pra pegarem
// a luz do fogo e do chefe. Sem material no retorno: poça não muda de estado
export function puddles(x: number, z: number, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  // caminho da entrada (CENA3D: x entre -1,5 e 1,5 com z > 6), que é dado em
  // coordenadas da arena — trazido pra as coordenadas locais do grupo
  const corridor = {
    xMin: -PUDDLES.entranceHalfWidth - x,
    xMax: PUDDLES.entranceHalfWidth - x,
    zMin: PUDDLES.entranceZ - z,
  };

  for (let i = 0; i < PUDDLES.count; i++) {
    const radius = range(rng, PUDDLES.radiusMin, PUDDLES.radiusMax);
    // índice par sangue, ímpar lodo (CENA3D: "metade sangue, metade lodo"),
    // na ordem da semente — determinístico mesmo se uma poça pular
    const colors = i % 2 === 0 ? PUDDLE_BLOOD : PUDDLE_MUD;

    // sorteio com rejeição: até maxTries tentativas de achar canto fora da
    // entrada; esgotou, esta poça não existe
    for (let attempt = 0; attempt < PUDDLES.maxTries; attempt++) {
      const angle = rng() * Math.PI * 2;
      // raiz da sorte, pra densidade cair uniforme no disco; o centro fica
      // no máximo a (raio do chão − raio da poça), pra a mancha inteira
      // caber no chão andável em vez de escorrer pra debaixo do muro
      const dist = Math.sqrt(rng()) * (PUDDLES.floorRadius - radius);
      const px = Math.cos(angle) * dist;
      const pz = Math.sin(angle) * dist;
      // rejeita se a poça (centro + raio) encosta no corredor da entrada
      if (px + radius > corridor.xMin && px - radius < corridor.xMax && pz + radius > corridor.zMin) continue;

      const side = Math.max(PUDDLES.minCanvas, Math.round(radius * 2 * PX_POR_UNIDADE));
      const material = new THREE.MeshLambertMaterial({
        map: puddleTexture(rng, side, colors.fill, colors.border),
        alphaTest: 0.5,
      });
      // lado do plano = lado do canvas ÷ 18,7: 1 texel da poça continua
      // valendo ~1 px na tela (ESTILO, seção 3)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(side / PX_POR_UNIDADE, side / PX_POR_UNIDADE), material);
      layFlat(mesh, PUDDLES.y);
      mesh.position.x = px;
      mesh.position.z = pz;
      group.add(mesh);
      break;
    }
  }
  return group;
}

