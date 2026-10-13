// Colisão das salas em unidades do mundo, no plano do chão (x, z).
// Formato dos arquivos .json: docs/CENA3D.md, seção "Formato dos arquivos de colisão".
// Tudo é círculo ou retângulo: dá pra conferir no olho com o debug (F1) e é barato de testar.

export interface Point {
  x: number;
  z: number;
}

// Ponto com tipo: o formato das listas "inimigos" e "itens" no JSON de sala
// (sala1.json). O "tipo" fica como string solta, e não união de nomes, porque
// quem conhece os tipos é quem cria os bichos/itens — a colisão só garante
// que cada entrada está bem formada.
export interface SpawnEntry {
  tipo: string;
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

// Retângulo alinhado aos eixos no plano do chão (x, z): a forma das áreas de
// acerto do combate (hitbox do ataque do jogador, hurtbox do chefe). O plano
// x/z é o "plano da tela" do jogo: x dá a largura e z a vertical na tela
export interface Rect {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

// Zona de gatilho retangular no plano do chão: é a "saida" do sala1.json.
// Tem exatamente os 4 campos do Rect, então reaproveitamos o tipo em vez de
// duplicar a definição.
export type ExitZone = Rect;

// Dois retângulos se tocam? Bordas encostadas já contam como acerto
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.xMin <= b.xMax && a.xMax >= b.xMin && a.zMin <= b.zMax && a.zMax >= b.zMin;
}

// O ponto está dentro do retângulo? Bordas contam como dentro. É o teste do
// gatilho de saída da sala 1 (ExitZone) contra o pé do jogador
export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.xMin && p.x <= r.xMax && p.z >= r.zMin && p.z <= r.zMax;
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

// Lê uma lista de pontos com tipo ("inimigos" e "itens" do sala1.json).
// Validar aqui que o tipo é string não-vazia e que x/z são números faz um
// erro de digitação no JSON estourar na hora, com o nome do arquivo e o
// índice do item, em vez de virar um bicho invisível ou um item no limbo.
export function parseSpawnList(data: unknown, file: string, field: string): SpawnEntry[] {
  if (!Array.isArray(data)) fail(file, `"${field}" tem que ser uma lista`);
  return data.map((item: Record<string, unknown>, i: number): SpawnEntry => {
    if (typeof item.tipo !== 'string' || item.tipo.length === 0 || !isNumber(item.x) || !isNumber(item.z)) {
      fail(file, `"${field}" item ${i} precisa de "tipo" (string não-vazia), x e z`);
    }
    return { tipo: item.tipo, x: item.x, z: item.z };
  });
}

// Lê a "saida" do sala1.json. Ela é um retângulo de gatilho, e não um ponto,
// por causa da colisão com o chão: o jogador não sai do retângulo do chão (o
// isFree desconta o raio 0,32 do pé — CENA3D.md, "Eixos e unidades"), então
// andando pro fundo ele para com o pé em z = -5,6 + 0,32 = -5,28. O gatilho
// vai de zMin -5,6 a zMax -5,2: encostando no fundo dentro do buraco do muro
// (x entre -1,2 e 1,2, os 2,4 de largura da porta), o pé já está dentro da
// zona e a saída dispara. Um zMax abaixo de -5,28 ficaria fora do alcance do
// pé e a porta ficaria morta. Conferir xMin < xMax e zMin < zMax evita uma
// zona vazia/invertida, que nunca dispararia e ia parecer "bug de porta".
export function parseExit(data: unknown, file: string): ExitZone {
  const r = data as Record<string, unknown> | undefined;
  if (!r || !isNumber(r.xMin) || !isNumber(r.xMax) || !isNumber(r.zMin) || !isNumber(r.zMax)) {
    fail(file, '"saida" precisa de xMin, xMax, zMin e zMax');
  }
  if (r.xMin >= r.xMax || r.zMin >= r.zMax) {
    fail(file, '"saida" precisa de xMin < xMax e zMin < zMax');
  }
  return { xMin: r.xMin, xMax: r.xMax, zMin: r.zMin, zMax: r.zMax };
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
