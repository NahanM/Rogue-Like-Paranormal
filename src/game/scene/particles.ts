import * as THREE from 'three';
import { createRng, int, range, type Rng } from '../../engine/random';
import { particles } from '../config';
import type { Boss } from '../boss';

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

// Config das faíscas de morte (ESTILO, seção 8: quem morre "some em
// faíscas no código", sem animação desenhada). As chaves são as do
// death.bossSparks do config.ts: guardar o desenho aqui e os números lá
// deixa o MESMO visual servir pro chefe e pros inimigos com parâmetros
// próprios (o deles, death.enemySparks, é menor — corpo menor)
export interface SparksConfig {
  count: number;
  duration: number;
  colors: string[];
  originHeight: number;
  spread: number;
  horizontalSpeed: { min: number; max: number };
  riseSpeed: { min: number; max: number };
}

// Faíscas da morte (chefe e inimigos comuns — ESTILO, seção 8; os inimigos
// entram pelo ASSETS.md: "Morrer: some em faíscas no código"). Um disparo
// único: pontos nascem no miolo do corpo com velocidade pra fora e pra
// cima, e a nuvem apaga em linha reta até sumir junto com o fim do tempo.
// Diferente da poeira e das brasas (ambiente), isto é o único aviso visual
// da morte: roda mesmo com "reduzir movimento"
export class DeathSparks {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly material: THREE.PointsMaterial;
  private readonly cfg: SparksConfig;
  // Semente própria, como o resto da cena, pra explosão sair igual em todo
  // teste. O segundo parâmetro deixa cada inimigo ter a sua: sem ela, dois
  // mortos no mesmo golpe soltariam explosões gêmeas lado a lado (o chefe
  // fica no padrão de sempre, 0xfa1c)
  private readonly rng: Rng;
  private time = 0;
  private active = false;

  constructor(cfg: SparksConfig, seed = 0xfa1c) {
    this.cfg = cfg;
    this.rng = createRng(seed);
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
    const cfg = this.cfg;
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
    if (this.time >= this.cfg.duration) {
      this.active = false;
      this.object.visible = false;
      return;
    }
    for (let i = 0; i < this.positions.length; i++) {
      this.positions[i] += this.velocities[i] * dt;
    }
    this.object.geometry.getAttribute('position').needsUpdate = true;
    this.material.opacity = 1 - this.time / this.cfg.duration;
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

// ===========================================================================
// Faíscas AMBIENTE do chefe (ESTILO, seção 7: "Faíscas do chefe: 1 px,
// cores de faísca, saindo do topo dele")
// ===========================================================================
// A terceira da LISTA de partículas ambiente (irmã da Dust e das Embers):
// o chefe VIVO solta faíscas do topo CONTINUAMENTE, como as brasas saem
// dos braseiros. Não confundir com as OUTRAS faíscas, que são efeitos de
// leitura de jogo: as da MORTE (DeathSparks aqui do arquivo, config
// death.bossSparks) são um burst único, e as do EXAUSTO do Devastador
// (ExhaustedSparks no boss-effects.ts, config bossEffects.exhaustedSparks)
// são efeito de ATAQUE — por isso aquelas moram lá e esta aqui.
// QUANDO EMITE — decisão revisável registrada no config (o doc omite):
// só com boss.state === 'awake', a gramática visual do covil (luz
// vermelha, Símbolo da Morte e veias só brilham com o chefe acordado), e
// NADA nasce com prefers-reduced-motion — mesma regra da poeira e das
// brasas nas salas; os efeitos de leitura (morte/exausto) FICAM. Fora
// da janela de emissão nada nasce e a opacidade GLOBAL derrete em linha
// reta até 0 no lifetime (padrão CrouchDust): dormiu, morreu, reset da
// luta ou reduced-motion ligado no meio, o que estava no ar esvazia sem
// pipocar. No AR da Queda o topo real sobe junto: a faísca nasce de
// boss.fallJumpY + height — o getter devolve altura REAL do mundo,
// somada DIRETO, SEM BILLBOARD_STRETCH (mesma matemática do sprite no
// boss-view; fora do ar ele é 0 e nada muda). Família
// CrouchDust/ExhaustedSparks: pool fixo com posições/velocidades/idades
// em Float32Array (nada alocado por passo), grãos vivos contíguos em
// [0, live) por swap-remove, drawRange, nascimento contínuo por taxa
// COM carry, rng de semente fixa, cor POR VÉRTICE (PointsMaterial tem
// cor única e o doc pede as DUAS na mesma nuvem, sorteada no nascimento
// e carregada pelo swap-remove junto com o grão)
// ===========================================================================
export class BossSparks {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  // cor POR VÉRTICE, paleta pré-parseada uma vez: o nascimento só copia
  // r/g/b, sem alocar
  private readonly colors: Float32Array;
  private readonly palette: ReadonlyArray<THREE.Color>;
  // idades dos grãos: a morte é por idade no fim do lifetime (a faísca
  // "apaga"), e o swap-remove carrega a idade junto
  private readonly ages: Float32Array;
  // grãos vivos: slots [0, live), mantidos contíguos pelo swap-remove
  private live = 0;
  // fração de nascimento que não fechou um passo inteiro (mesma conta do
  // CrouchDust: 6/s a 60 Hz dão 0,1 por passo — sem o carry, o floor
  // perdia os nascimentos fracionários)
  private carry = 0;
  // tempo desde o fim da janela de emissão: o relógio da opacidade global
  // na deriva
  private drainTime = 0;
  // Semente fixa = 0xeeb4c5, a faísca CLARA, a segunda cor do doc (ESTILO
  // §5). Qualquer valor serve, o que importa é ser fixo, pro gotejar sair
  // igual em todo teste (mesma razão dos outros rngs do jogo) — mas NÃO a
  // 0xcf9ba3, que já é a semente do exausto no boss-effects.ts: rngs
  // distintos evitam as duas nuvens gotejarem em sequência correlacionada
  // nos instantes em que o exausto coincide com o ambiente
  private readonly rng: Rng = createRng(0xeeb4c5);

  constructor() {
    const sparks = particles.bossSparks;
    this.positions = new Float32Array(sparks.pool * 3);
    this.velocities = new Float32Array(sparks.pool * 3);
    this.colors = new Float32Array(sparks.pool * 3);
    this.ages = new Float32Array(sparks.pool);
    this.palette = sparks.colors.map((hex) => new THREE.Color(hex));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // desenha só os vivos: o swap-remove os mantém contíguos no começo
    geometry.setDrawRange(0, 0);
    // MESMA receita das outras nuvens (DeathSparks/ExhaustedSparks): ponto
    // de 1 px em qualquer distância (sizeAttenuation: false), cor por
    // vértice, transparent + depthWrite off pro blend da deriva não
    // deixar quadradinho no buffer de profundidade
    this.material = new THREE.PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud: as posições mudam todo passo, e o three não pode
    // achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Passo fixo: nasce só com o chefe ACORDADO e SEM reduced-motion (a
  // janela de emissão); vive, sobe e apaga sempre, até na deriva
  update(dt: number, boss: Boss, reducedMotion: boolean): void {
    const sparks = particles.bossSparks;
    const emitting = boss.state === 'awake' && !reducedMotion;

    if (emitting) {
      // nascimento contínuo por taxa com carry (mesma conta do CrouchDust):
      // o carry acumula a fração do passo anterior, então a média de
      // faíscas por segundo sai certa
      this.drainTime = 0;
      this.carry += sparks.perSecond * dt;
      const births = Math.floor(this.carry);
      this.carry -= births;
      for (let i = 0; i < births; i++) this.spawn(boss);
    } else {
      // fora da janela (dormindo, morto, reset, reduced-motion) nada
      // nasce; o que já existia entra na deriva (fade global abaixo) e
      // esvazia sozinho no fim das vidas
      this.carry = 0;
      this.drainTime += dt;
    }

    // idade, vida e subida. De trás pra frente porque o remove puxa o
    // ÚLTIMO vivo pro lugar do morto — os ainda não visitados continuam
    // íntegros (mesma varredura do CrouchDust)
    for (let i = this.live - 1; i >= 0; i--) {
      this.ages[i] += dt;
      if (this.ages[i] >= sparks.lifetime) {
        this.remove(i);
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }

    // Opacidade GLOBAL: cheia enquanto emite; na deriva, cai em linha reta
    // até 0 no fim da vida máxima (padrão CrouchDust/DeathSparks) — quem
    // morre no meio da deriva já está esmaecido, o pop não lê
    this.material.opacity = emitting ? 1 : Math.max(0, 1 - this.drainTime / sparks.lifetime);

    this.object.visible = this.live > 0 && this.material.opacity > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
      this.object.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  // Nasce uma faísca no TOPO do chefe, na região dos ombros/cabeça
  private spawn(boss: Boss): void {
    const sparks = particles.bossSparks;
    // pool cheio: perde ESTE nascimento (padrão CrouchDust) — o pool é
    // ~2x o pico de vivas, então só um atraso gigante chega aqui
    if (this.live >= sparks.pool) return;
    const i = this.live++;
    // disco em volta do eixo dele na altura do config: o topo é uma
    // REGIÃO, não um ponto — faísca nascida num só ponto lê como fio
    const angle = this.rng() * Math.PI * 2;
    const dist = this.rng() * sparks.spread;
    this.positions[i * 3] = boss.x + Math.cos(angle) * dist;
    // No AR da Queda, fallJumpY (altura REAL do mundo) sobe o topo junto:
    // somado DIRETO, sem BILLBOARD_STRETCH (que é compensação da câmera
    // pro scale do sprite, não altura de mundo). Fora do ar é 0
    this.positions[i * 3 + 1] = sparks.height + boss.fallJumpY;
    this.positions[i * 3 + 2] = boss.z + Math.sin(angle) * dist;
    // sobe devagar na velocidade do config, com um desvio lateral leve
    // derivado da PRÓPRIA riseSpeed (não é número de ajuste novo): sem
    // ele, as faíscas do mesmo ângulo sobem em coluna
    this.velocities[i * 3] = (this.rng() - 0.5) * sparks.riseSpeed;
    this.velocities[i * 3 + 1] = sparks.riseSpeed;
    this.velocities[i * 3 + 2] = (this.rng() - 0.5) * sparks.riseSpeed;
    // uma das duas cores de faísca (ESTILO §5), sorteio uniforme
    const color = this.palette[int(this.rng, this.palette.length)];
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.ages[i] = 0;
  }

  // Mata o grão i sem deixar buraco: o último vivo pula pra vaga — os
  // vivos continuam contíguos em [0, live). A COR e a IDADE viajam
  // junto, senão o grão herdado pisca nas cores do que morreu e rejuvenesce
  private remove(index: number): void {
    const last = --this.live;
    if (index === last) return; // o morto já era o último: só encolhe
    for (let k = 0; k < 3; k++) {
      this.positions[index * 3 + k] = this.positions[last * 3 + k];
      this.velocities[index * 3 + k] = this.velocities[last * 3 + k];
      this.colors[index * 3 + k] = this.colors[last * 3 + k];
    }
    this.ages[index] = this.ages[last];
  }
}
