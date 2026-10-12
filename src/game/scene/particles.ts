import * as THREE from 'three';
import { range, type Rng } from '../../engine/random';
import { particles } from '../config';

// Partículas de 1 px na tela (ESTILO, seção 7).
// sizeAttenuation: false faz o ponto ter 1 px em qualquer distância da câmera.

function pointCloud(count: number, color: string): { points: THREE.Points; positions: Float32Array } {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size: 1, sizeAttenuation: false });
  const points = new THREE.Points(geometry, material);
  // as posições mudam todo passo; sem isso o three poderia sumir com a nuvem
  // achando que ela saiu da tela, porque calcula o tamanho dela uma vez só
  points.frustumCulled = false;
  return { points, positions };
}

// Poeira subindo devagar pela sala inteira
export class Dust {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private time = 0;

  constructor(rng: Rng, centerX: number, centerZ: number) {
    const cfg = particles.dust;
    const cloud = pointCloud(cfg.count, cfg.color);
    this.object = cloud.points;
    this.positions = cloud.positions;
    for (let i = 0; i < cfg.count; i++) {
      this.positions[i * 3] = centerX + (rng() - 0.5) * cfg.spreadX;
      this.positions[i * 3 + 1] = rng() * cfg.maxHeight;
      this.positions[i * 3 + 2] = centerZ + (rng() - 0.5) * cfg.spreadZ;
    }
  }

  update(dt: number): void {
    const cfg = particles.dust;
    this.time += dt;
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] += cfg.riseSpeed * dt;
      // cada grão balança num ritmo próprio, senão a nuvem anda em bloco
      p[i] += Math.sin(this.time + i) * cfg.sway * dt;
      if (p[i + 1] > cfg.maxHeight) p[i + 1] = 0;
    }
    this.object.geometry.getAttribute('position').needsUpdate = true;
  }
}

// Brasas: sobem da bacia de cada braseiro e renascem nela
export class Embers {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private readonly sources: ReadonlyArray<{ x: number; z: number }>;
  private readonly rng: Rng;

  constructor(rng: Rng, sources: ReadonlyArray<{ x: number; z: number }>) {
    const cfg = particles.embers;
    const cloud = pointCloud(sources.length * cfg.perBrazier, cfg.color);
    this.object = cloud.points;
    this.positions = cloud.positions;
    this.sources = sources;
    this.rng = rng;
    for (let i = 0; i < sources.length * cfg.perBrazier; i++) {
      const s = this.sourceOf(i);
      this.positions[i * 3] = s.x;
      this.positions[i * 3 + 1] = range(rng, cfg.startHeight, cfg.maxHeight);
      this.positions[i * 3 + 2] = s.z;
    }
  }

  private sourceOf(index: number): { x: number; z: number } {
    return this.sources[Math.floor(index / particles.embers.perBrazier)];
  }

  update(dt: number): void {
    const cfg = particles.embers;
    const p = this.positions;
    for (let i = 0; i < p.length / 3; i++) {
      p[i * 3 + 1] += cfg.riseSpeed * dt;
      if (p[i * 3 + 1] > cfg.maxHeight) {
        const s = this.sourceOf(i);
        p[i * 3] = s.x + (this.rng() - 0.5) * cfg.spread;
        p[i * 3 + 1] = cfg.startHeight;
        p[i * 3 + 2] = s.z + (this.rng() - 0.5) * cfg.spread;
      }
    }
    this.object.geometry.getAttribute('position').needsUpdate = true;
  }
}
