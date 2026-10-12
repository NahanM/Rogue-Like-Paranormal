// Aleatório com semente (mulberry32).
// Por que com semente: a cena e as texturas saem iguais toda vez que o jogo abre,
// então dá pra comparar print com print e achar bug visual sem sorte envolvida.

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Número entre min e max
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

// Inteiro de 0 até n - 1
export function int(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
