// Colisão das salas em unidades do mundo, no plano do chão (x, z).
// Formato dos arquivos .json: docs/CENA3D.md, seção "Formato dos arquivos de colisão".
// Tudo é círculo ou retângulo: dá pra conferir no olho com o debug (F1) e é barato de testar.

export interface Point {
  x: number;
  z: number;
}

export interface CircleFloor {
  tipo: 'circulo';
  x: number;
  z: number;
  raio: number;
}

export interface RectFloor {
  tipo: 'retangulo';
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export type Floor = CircleFloor | RectFloor;

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface RoomCollision {
  chao: Floor;
  obstaculos: Obstacle[];
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fail(file: string, what: string): never {
  throw new Error(`${file}: ${what}`);
}

// Lê e confere o JSON. Erro com o nome do arquivo e o campo errado, em vez de
// um "undefined" perdido no meio do jogo.
export function parseCollision(data: unknown, file: string): RoomCollision {
  const root = data as { chao?: Record<string, unknown>; obstaculos?: unknown };
  const floor = root.chao;
  if (!floor) fail(file, 'falta o "chao"');

  let chao: Floor;
  if (floor.tipo === 'circulo') {
    if (!isNumber(floor.x) || !isNumber(floor.z) || !isNumber(floor.raio)) {
      fail(file, '"chao" circulo precisa de x, z e raio');
    }
    chao = { tipo: 'circulo', x: floor.x, z: floor.z, raio: floor.raio };
  } else if (floor.tipo === 'retangulo') {
    if (!isNumber(floor.xMin) || !isNumber(floor.xMax) || !isNumber(floor.zMin) || !isNumber(floor.zMax)) {
      fail(file, '"chao" retangulo precisa de xMin, xMax, zMin e zMax');
    }
    chao = { tipo: 'retangulo', xMin: floor.xMin, xMax: floor.xMax, zMin: floor.zMin, zMax: floor.zMax };
  } else {
    fail(file, '"chao.tipo" tem que ser "circulo" ou "retangulo"');
  }

  const list = root.obstaculos ?? [];
  if (!Array.isArray(list)) fail(file, '"obstaculos" tem que ser uma lista');
  const obstaculos = list.map((item: Record<string, unknown>, i: number): Obstacle => {
    if (!isNumber(item.x) || !isNumber(item.z) || !isNumber(item.r)) {
      fail(file, `obstáculo ${i} precisa de x, z e r`);
    }
    return { x: item.x, z: item.z, r: item.r };
  });

  return { chao, obstaculos };
}

// Lê um ponto tipo { "x": 0, "z": 9.4 } (chegada, início, saída)
export function parsePoint(data: unknown, file: string, field: string): Point {
  const p = data as Record<string, unknown> | undefined;
  if (!p || !isNumber(p.x) || !isNumber(p.z)) fail(file, `"${field}" precisa de x e z`);
  return { x: p.x, z: p.z };
}

// O círculo de raio `radius` em (x, z) cabe aqui? (dentro do chão e fora dos obstáculos)
export function isFree(room: RoomCollision, x: number, z: number, radius: number): boolean {
  const floor = room.chao;
  if (floor.tipo === 'circulo') {
    if (Math.hypot(x - floor.x, z - floor.z) > floor.raio - radius) return false;
  } else {
    if (x < floor.xMin + radius || x > floor.xMax - radius) return false;
    if (z < floor.zMin + radius || z > floor.zMax - radius) return false;
  }
  for (const o of room.obstaculos) {
    const dx = x - o.x;
    const dz = z - o.z;
    const min = o.r + radius;
    if (dx * dx + dz * dz < min * min) return false;
  }
  return true;
}

// Anda com colisão: tenta o movimento inteiro; se bater, só no x; depois só no z.
// É o que faz o jogador deslizar na parede em vez de grudar (igual ao protótipo).
export function moveWithCollision(
  room: RoomCollision,
  from: Point,
  dx: number,
  dz: number,
  radius: number,
): Point {
  const nx = from.x + dx;
  const nz = from.z + dz;
  if (isFree(room, nx, nz, radius)) return { x: nx, z: nz };
  if (dx !== 0 && isFree(room, nx, from.z, radius)) return { x: nx, z: from.z };
  if (dz !== 0 && isFree(room, from.x, nz, radius)) return { x: from.x, z: nz };
  return { x: from.x, z: from.z };
}
