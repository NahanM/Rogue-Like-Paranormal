import * as THREE from 'three';
import { createRng, int, range, type Rng } from '../../engine/random';
import { death, particles } from '../config';

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

// Faíscas da morte do chefe (ESTILO, seção 8: ele "se desfaz em faíscas"
// no código, sem animação desenhada; cores de faísca travadas nas seções
// 5/7). Um disparo único: pontos nascem no miolo do corpo com velocidade
// pra fora e pra cima, e a nuvem apaga em linha reta até sumir junto com
// o fim do tempo. Diferente da poeira e das brasas (ambiente), isto é o
// único aviso visual da morte do chefe: roda mesmo com "reduzir movimento"
export class DeathSparks {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly material: THREE.PointsMaterial;
  // semente própria, como o resto da cena, pra explosão sair igual em todo teste
  private readonly rng: Rng = createRng(0xfa1c);
  private time = 0;
  private active = false;

  constructor() {
    const cfg = death.bossSparks;
    this.positions = new Float32Array(cfg.count * 3);
    this.velocities = new Float32Array(cfg.count * 3);

    // cada faísca sorteia uma das duas cores travadas; cor por vértice é o
    // jeito de ter as duas na mesma nuvem (PointsMaterial tem cor única)
    const palette = cfg.colors.map((c) => new THREE.Color(c));
    const colors = new Float32Array(cfg.count * 3);
    for (let i = 0; i < cfg.count; i++) {
      const c = palette[int(this.rng, palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
      // precisa do transparent pra apagar em opacidade no fim; sem depthWrite
      // pra não deixar quadradinhos fantasma no buffer de profundidade
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    this.object.frustumCulled = false;
    // dorme escondida até o burst
    this.object.visible = false;
  }

  // Disparo da explosão a partir do miolo do corpo: posições e velocidades
  // ficam travadas aqui; o update só as empurra
  burst(centerX: number, centerZ: number): void {
    const cfg = death.bossSparks;
    for (let i = 0; i < cfg.count; i++) {
      this.positions[i * 3] = centerX + (this.rng() - 0.5) * cfg.spread;
      this.positions[i * 3 + 1] = cfg.originHeight + (this.rng() - 0.5) * cfg.spread;
      this.positions[i * 3 + 2] = centerZ + (this.rng() - 0.5) * cfg.spread;

      const angle = this.rng() * Math.PI * 2;
      const horizontal = range(this.rng, cfg.horizontalSpeed.min, cfg.horizontalSpeed.max);
      this.velocities[i * 3] = Math.cos(angle) * horizontal;
      this.velocities[i * 3 + 1] = range(this.rng, cfg.riseSpeed.min, cfg.riseSpeed.max);
      this.velocities[i * 3 + 2] = Math.sin(angle) * horizontal;
    }
    this.time = 0;
    this.active = true;
    this.material.opacity = 1;
    this.object.visible = true;
    this.object.geometry.getAttribute('position').needsUpdate = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    if (this.time >= death.bossSparks.duration) {
      this.active = false;
      this.object.visible = false;
      return;
    }
    for (let i = 0; i < this.positions.length; i++) {
      this.positions[i] += this.velocities[i] * dt;
    }
    this.object.geometry.getAttribute('position').needsUpdate = true;
    this.material.opacity = 1 - this.time / death.bossSparks.duration;
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
