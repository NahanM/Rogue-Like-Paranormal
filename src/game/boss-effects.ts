import * as THREE from 'three';
import { boss as bossCfg, bossEffects as cfg, PX_POR_UNIDADE } from './config';
import { canvasTexture, pixel } from '../engine/textures';
import { createRng, int, range, type Rng } from '../engine/random';
import type { Boss, FallAttack, DevastatorAttack } from './boss';
// crookedPath (polilinha torta) e puddleTexture (blob com miolo e borda)
// são as peças do kit.ts (CENA3D, "linhas tortas" e poças) — reutilizadas
// aqui por trás dos decalques do impacto, sem duplicar o código delas
import { crookedPath, puddleTexture } from './scene/kit';

// Anel unitário da marca (raio 1, 48 pontos no plano do chão, centrado na
// origem): o raio real entra pelo scale do LineLoop a cada passo. Fica
// fora da classe como o circleLine do debug.ts — só montagem de geometria.
// O material OPCIONAL serve ao anel grosso do estouro: são TRÊS LineLoops
// que dividem cor e opacidade (a "linha grossa" anda junto), e cada um
// monta a própria geometria unitária aqui
function buildUnitRing(color: string, material?: THREE.LineBasicMaterial): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
  }
  // LineBasicMaterial = linha fina de 1 px, o "anel fino" da borda
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    material ?? new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false }),
  );
}

// --- Círculo de aviso do Devastador: montagem das texturas de dither ---

// Lado do canvas do aviso, em px: o círculo tem raio de 100 px de TELA
// (COMBATE.md), e 1 texel ≈ 1 px na tela (ESTILO, seção 3) — então o canvas
// espelha o tamanho na tela, com margem de 1 px de cada lado pros pixels da
// borda não cortarem. Deriva do raio do config: mudou o raio, o canvas
// acompanha (não é número solto)
const WARNING_SIDE_PX = Math.ceil(bossCfg.devastator.radius * 2 * PX_POR_UNIDADE) + 2;
// Raio do círculo DENTRO do canvas, na mesma conversão da tela
const WARNING_RADIUS_PX = bossCfg.devastator.radius * PX_POR_UNIDADE;
// Malha de dither 2x2 px (ESTILO §7: 25%, 50%, 75%): cada célula é a "vez"
// do pixel no bloco — densidade 25% pinta a posição 0, 50% pinta 0 e 1 (a
// diagonal, que vira o xadrez de pixel único), 75% pinta 0, 1 e 2. Padrão
// fixo e determinístico, sem sorteio; e cada degrau só ACRESCENTA pixels
// sobre o anterior, então o círculo escurece "enchendo" durante a carga,
// sem os pixels já pintados mudarem de lugar entre os terços
const WARNING_BAYER: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 2],
  [3, 1],
];

// Textura de UM degrau do dither: pixels brancos no xadrez 2x2 dentro do
// círculo, resto do canvas transparente (morre no alphaTest do material — o
// dither É a transparência). Máscara BRANCA como o Símbolo da Morte no
// kit.ts: quem pinta é o `color` do material, então a cor fica calibrável
// no config sem regenerar as texturas. Canvas NÃO repetível — o círculo é
// um decalque único, do primeiro ao último texel
function warningTexture(density: number): THREE.CanvasTexture {
  return canvasTexture(
    WARNING_SIDE_PX,
    WARNING_SIDE_PX,
    (g) => {
      const half = WARNING_SIDE_PX / 2;
      // pixels pintados por bloco 2x2: 25% → 1, 50% → 2, 75% → 3
      const painted = density * 4;
      for (let y = 0; y < WARNING_SIDE_PX; y++) {
        for (let x = 0; x < WARNING_SIDE_PX; x++) {
          // pixel dentro do círculo, nas coordenadas do canvas (centrado)
          const dx = x - half;
          const dy = y - half;
          if (dx * dx + dy * dy > WARNING_RADIUS_PX * WARNING_RADIUS_PX) continue;
          if (WARNING_BAYER[y % 2][x % 2] < painted) pixel(g, x, y, '#ffffff');
        }
      }
    },
    false,
  );
}

// ===========================================================================
// Poeira do agachar da Queda (ESTILO, seção 7: "Poeira #7f78a1 sobe dos pés")
// ===========================================================================
// Pontos de 1 px na tela (sizeAttenuation: false), cor #7f78a1, nascendo em
// volta do pé do chefe ENQUANTO ele agacha e subindo devagar. Família dos
// Points do particles.ts, mas com NASCIMENTO CONTÍNUO por taxa em vez do
// disparo único do DeathSparks: pool fixo com posições/velocidades em
// Float32Array (nada alocado por passo), e os grãos vivos mantidos
// contíguos por swap-remove, pro drawRange desenhar só eles. Cada grão
// morre no fim da vida própria; a opacidade GLOBAL só entra na deriva
// pós-agachar (o padrão do DeathSparks), pros últimos grãos derreterem
// em vez de pipocar
// ===========================================================================
class CrouchDust {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  // grãos vivos: os slots [0, live) — o swap-remove mantém a promessa
  private live = 0;
  // fração de nascimento que não fechou um passo inteiro (30/s a 60 Hz
  // dão 0,5 por passo: sem o carry, o floor perdia metade dos grãos)
  private carry = 0;
  // tempo desde o fim do agachar: o relógio da opacidade global na deriva
  private drainTime = 0;
  // Semente fixa = 0x7f78, os primeiros dígitos da própria cor da poeira
  // (#7f78a1): qualquer valor serve, o que importa é ser fixo, pro
  // agachar sair igual em todo teste (mesma razão dos outros rngs do jogo)
  private readonly rng: Rng = createRng(0x7f78);

  constructor() {
    const dust = cfg.crouchDust;
    this.positions = new Float32Array(dust.pool * 3);
    this.velocities = new Float32Array(dust.pool * 3);
    this.ages = new Float32Array(dust.pool);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // desenha só os vivos: o swap-remove os mantém contíguos no começo
    geometry.setDrawRange(0, 0);
    this.material = new THREE.PointsMaterial({
      color: dust.color,
      size: 1,
      sizeAttenuation: false,
      // transparent + depthWrite off: mesma receita do DeathSparks, pro
      // blend da deriva não deixar quadradinho no buffer de profundidade
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud do particles.ts: as posições mudam todo passo, e o
    // three não pode achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Passo fixo: nasce enquanto agacha; vive e sobe sempre, até na deriva
  update(dt: number, boss: Boss): void {
    const dust = cfg.crouchDust;
    const crouching = boss.fall?.phase === 'crouch';

    if (crouching) {
      // nascimento contínuo por taxa: o carry acumula a fração do passo
      // anterior, então a média de grãos por segundo sai certa
      this.drainTime = 0;
      this.carry += dust.perSecond * dt;
      const births = Math.floor(this.carry);
      this.carry -= births;
      for (let i = 0; i < births; i++) this.spawn(boss.x, boss.z);
    } else {
      // fora do agachar nada nasce; o que já existia entra na deriva (o
      // fade global logo abaixo) e esvazia sozinho no fim das vidas
      this.carry = 0;
      this.drainTime += dt;
    }

    // vida e movimento. De trás pra frente porque o remove puxa o ÚLTIMO
    // vivo pro lugar do morto — os ainda não visitados continuam íntegros
    for (let i = this.live - 1; i >= 0; i--) {
      this.ages[i] += dt;
      if (this.ages[i] >= dust.lifetime) {
        this.remove(i);
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }

    // Opacidade GLOBAL: cheia enquanto nasce; na deriva, cai em linha reta
    // até 0 no fim da vida máxima (padrão DeathSparks) — quem morre no
    // meio da deriva já está esmaecido, o pop não lê
    this.material.opacity = crouching ? 1 : Math.max(0, 1 - this.drainTime / dust.lifetime);

    this.object.visible = this.live > 0 && this.material.opacity > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  // Nasce um grão em volta do pé do chefe
  private spawn(x: number, z: number): void {
    // pool cheio: perde ESTE nascimento — o pool é ~2x o pico da fase
    // (30/s × 0,6 s = 18 vivos), então só um atraso gigante chega aqui
    if (this.live >= cfg.crouchDust.pool) return;
    const dust = cfg.crouchDust;
    const i = this.live++;
    // disco em volta do pé: ângulo e distância sorteados no raio do config
    const angle = this.rng() * Math.PI * 2;
    const dist = this.rng() * dust.spread;
    this.positions[i * 3] = x + Math.cos(angle) * dist;
    // 0,01 acima do chão, o mesmo respiro da sombra do chefe (boss-view):
    // ponto colado no y do piso briga no depth test com o chão e pisca
    this.positions[i * 3 + 1] = 0.01;
    this.positions[i * 3 + 2] = z + Math.sin(angle) * dist;
    // Sobe devagar na velocidade do config, com um desvio lateral leve
    // derivado da PRÓPRIA riseSpeed (não é número de ajuste novo): sem
    // ele, os grãos do mesmo ângulo sobem em coluna
    this.velocities[i * 3] = (this.rng() - 0.5) * dust.riseSpeed;
    this.velocities[i * 3 + 1] = dust.riseSpeed;
    this.velocities[i * 3 + 2] = (this.rng() - 0.5) * dust.riseSpeed;
    this.ages[i] = 0;
  }

  // Mata o grão i sem deixar buraco: o último vivo pula pra vaga — os
  // vivos continuam contíguos em [0, live)
  private remove(index: number): void {
    const last = --this.live;
    if (index === last) return; // o morto já era o último: só encolhe
    for (let k = 0; k < 3; k++) {
      this.positions[index * 3 + k] = this.positions[last * 3 + k];
      this.velocities[index * 3 + k] = this.velocities[last * 3 + k];
    }
    this.ages[index] = this.ages[last];
  }
}

// ===========================================================================
// Partículas sugadas na carga do Devastador (ESTILO, seção 7, "Devastador")
// ===========================================================================
// "Partículas de lodo (#412e29, #251619) e sangue (#942c40) saem da borda
// do círculo de aviso e são sugadas pro corpo dele, cada vez mais rápido e
// em maior quantidade". Mesma família do CrouchDust (pool fixo com
// Float32Array, swap-remove, drawRange, nascimento por taxa com carry,
// rng de semente fixa), mudando o destino: cada grão nasce NA BORDA do
// círculo de aviso (raio boss.devastator.radius em volta do pé) RENTE AO
// CHÃO e voa em LINHA RETA pra um ponto no miolo do corpo (altura
// targetHeight do config) — decisão de leitura visual: nascer no chão e
// ser puxado pro miolo lê como sucção de verdade, de lodo arrastado do
// piso, em vez de pontos flutuando. Taxa e velocidade da CARGA no instante
// do nascimento (lerp linear start→end pelo progresso): quem nasce tarde
// nasce em maior quantidade e voa mais rápido, o "cada vez mais rápido e
// em maior quantidade" do doc. O grão MORRE ao entrar na coluna do corpo
// (distância no chão ao pé < bodyRadius). Fora da fase 'charge' nada
// nasce e a opacidade GLOBAL derrete (padrão CrouchDust): o que estava
// voando continua e morre ao chegar, sem pipocar. FICA no "reduzir
// movimento": o ESTILO §7 só isenta tremida e piscada da tela
// ===========================================================================
class SuckParticles {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  // cor POR VÉRTICE (padrão DeathSparks): PointsMaterial tem cor única, e
  // o doc pede as três (lodo claro, lodo escuro e sangue) na MESMA nuvem.
  // Sorteada NO NASCIMENTO (aqui os grãos vivem e morrem a todo passo,
  // diferente do burst único do DeathSparks), e o swap-remove a carrega
  // junto com o resto do grão
  private readonly colors: Float32Array;
  // paleta pré-parseada uma vez: o nascimento só copia r/g/b, sem alocar
  private readonly palette: ReadonlyArray<THREE.Color>;
  // grãos vivos: slots [0, live), mantidos contíguos pelo swap-remove
  private live = 0;
  // fração de nascimento que não fechou um passo inteiro (mesma conta do
  // CrouchDust: sem o carry, o floor perde os nascimentos fracionários)
  private carry = 0;
  // tempo desde o fim da carga: o relógio da opacidade global na deriva
  private drainTime = 0;
  // Semente fixa = 0x412e29, o lodo claro, primeira cor listada no doc
  // pra este efeito (ESTILO §7): qualquer valor serve, o que importa é
  // ser fixo, pra a carga sair igual em todo teste (mesma razão dos
  // outros rngs do arquivo)
  private readonly rng: Rng = createRng(0x412e29);

  constructor() {
    const suck = cfg.suck;
    this.positions = new Float32Array(suck.pool * 3);
    this.velocities = new Float32Array(suck.pool * 3);
    this.colors = new Float32Array(suck.pool * 3);
    this.palette = suck.colors.map((hex) => new THREE.Color(hex));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // desenha só os vivos: o swap-remove os mantém contíguos no começo
    geometry.setDrawRange(0, 0);
    // MESMA receita do DeathSparks: ponto de 1 px em qualquer distância,
    // transparent + depthWrite off pro blend da deriva não deixar
    // quadradinho no buffer de profundidade, cor por vértice
    this.material = new THREE.PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud do particles.ts: as posições mudam todo passo, e o
    // three não pode achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Passo fixo: nasce só na fase 'charge' (taxa e velocidade crescendo
  // com o progresso); voa e morre AO CHEGAR sempre, até na deriva
  update(dt: number, boss: Boss): void {
    const suck = cfg.suck;
    const devastator = boss.devastator;
    const charging = devastator?.phase === 'charge';

    if (charging && devastator) {
      // MESMO clamp dos outros efeitos da carga: o último passo pode
      // passar do charge por um fósfogo do passo fixo
      const progress = Math.min(1, devastator.time / bossCfg.devastator.charge);
      this.drainTime = 0;
      // "em maior quantidade": a taxa cresce LINEARMENTE com o progresso.
      // O carry acumula a fração do passo anterior, então a média de
      // grãos por segundo sai certa
      const perSecond = suck.perSecondStart + (suck.perSecondEnd - suck.perSecondStart) * progress;
      this.carry += perSecond * dt;
      const births = Math.floor(this.carry);
      this.carry -= births;
      for (let i = 0; i < births; i++) this.spawn(boss, progress);
    } else {
      // fora da carga (estouro, exausto, pausa, dormindo, morto) nada
      // nasce; o que já existia entra na deriva (fade global abaixo) e
      // continua voando até morrer no corpo
      this.carry = 0;
      this.drainTime += dt;
    }

    // voo e morte por chegada. De trás pra frente porque o remove puxa o
    // ÚLTIMO vivo pro lugar do morto — os ainda não visitados continuam
    // íntegros (mesma varredura do CrouchDust)
    // "chega no corpo" = entrar na COLUNA do corpo: distância no CHÃO (x/z)
    // ao pé menor que bodyRadius — medir só o plano ignora a altura do
    // miolo-alvo e casa com o círculo de 20 px do corpo (COMBATE.md), que
    // é a coluna dele de verdade
    const killSq = bossCfg.bodyRadius * bossCfg.bodyRadius;
    for (let i = this.live - 1; i >= 0; i--) {
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      const dx = this.positions[i * 3] - boss.x;
      const dz = this.positions[i * 3 + 2] - boss.z;
      if (dx * dx + dz * dz < killSq) {
        this.remove(i);
      }
    }

    // Opacidade GLOBAL: cheia enquanto nasce; na deriva, cai em linha
    // reta até 0 (padrão CrouchDust/DeathSparks) — quem ainda voa já
    // está esmaecido, o pop não lê. O grão que chega "vivo" no começo da
    // deriva morre no corpo, que é o sumirço natural da leitura
    this.material.opacity = charging ? 1 : Math.max(0, 1 - this.drainTime / suck.fadeOut);

    this.object.visible = this.live > 0 && this.material.opacity > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
      this.object.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  // Nasce um grão na BORDA do círculo de aviso, já apontado pro miolo do
  // corpo. O chefe fica PARADO na carga (COMBATE.md, tabela do Ataque 2:
  // "Parado") e a direção é fixa no nascimento: sem re-normalizar por
  // passo, o voo é um += de sempre
  private spawn(boss: Boss, progress: number): void {
    const suck = cfg.suck;
    // pool cheio: perde ESTE nascimento (padrão CrouchDust) — o pool é
    // ~2x o pico de vivas, então só um atraso gigante chega aqui
    if (this.live >= suck.pool) return;
    const i = this.live++;
    // borda do círculo: ângulo sorteado no raio EXATO do aviso, raio que
    // vem do boss.devastator.radius (a mesma borda que o jogador vê)
    const angle = this.rng() * Math.PI * 2;
    const radius = bossCfg.devastator.radius;
    this.positions[i * 3] = boss.x + Math.cos(angle) * radius;
    this.positions[i * 3 + 1] = suck.birthHeight;
    this.positions[i * 3 + 2] = boss.z + Math.sin(angle) * radius;
    // direção da RETA nascimento → miolo do corpo (targetHeight do
    // config). O chefe não anda na carga nem no estouro/exausto (a
    // máquina da seção Devastador nunca chama a perseguição), então esta
    // direção vale pro voo visível inteiro; o que voa depois, na deriva,
    // já está esmaecido e some no fade antes de qualquer andar
    const toX = boss.x - this.positions[i * 3];
    const toY = suck.targetHeight - suck.birthHeight;
    const toZ = boss.z - this.positions[i * 3 + 2];
    const len = Math.hypot(toX, toY, toZ);
    // "cada vez mais rápido": velocidade sorteada NO NASCIMENTO pelo
    // progresso da carga (lerp linear start→end)
    const speed = suck.speedStart + (suck.speedEnd - suck.speedStart) * progress;
    this.velocities[i * 3] = (toX / len) * speed;
    this.velocities[i * 3 + 1] = (toY / len) * speed;
    this.velocities[i * 3 + 2] = (toZ / len) * speed;
    // cor da paleta do doc, sorteio uniforme por vértice
    const color = this.palette[int(this.rng, this.palette.length)];
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
  }

  // Mata o grão i sem deixar buraco: o último vivo pula pra vaga — os
  // vivos continuam contíguos em [0, live). A COR viaja junto, senão o
  // grão herdado pisca nas cores do que morreu
  private remove(index: number): void {
    const last = --this.live;
    if (index === last) return; // o morto já era o último: só encolhe
    for (let k = 0; k < 3; k++) {
      this.positions[index * 3 + k] = this.positions[last * 3 + k];
      this.velocities[index * 3 + k] = this.velocities[last * 3 + k];
      this.colors[index * 3 + k] = this.colors[last * 3 + k];
    }
  }
}

// ===========================================================================
// Anel de choque grosso do estouro do Devastador (ESTILO, seção 7,
// "Estouro": "Anel de choque grosso (3 px) até a borda do aviso em 0,2 s")
// ===========================================================================
// Anel de LINHA no chão, centrado no PÉ do chefe no instante do estouro,
// que expande de 0 até o raio do círculo de aviso (boss.devastator.radius)
// em 0,2 s e some. A fase 'burst' dura só 0,15 s (COMBATE.md), então os
// 0,05 s finais do anel já correm na fase 'exhausted' — ninguém na máquina
// conta esse tempo, e o anel ganha relógio PRÓPRIO (o padrão
// CrackPool.spawnedAt: um clock interno que anda sempre, e o disparo só
// grava o instante dele).
//
// O "GROSSO (3 px)": LineBasicMaterial no WebGL é SEMPRE 1 px (limite da
// API, não existe linewidth em pixels de tela) — DECISÃO: o 3 px sai de
// TRÊS LineLoops concêntricos de 1 px, defasados ±1 px de TELA
// (±1/PX_POR_UNIDADE un) do raio central, escalados juntos a cada passo
// (o raio + a defasagem entram pelo scale de cada um). A defasagem é em
// unidades ABSOLUTAS, não percentual do raio, pros 3 px valerem na tela
// do começo ao fim da expansão — a mesma conversão do tremor do sprite.
//
// A COR o doc não dá pra este anel — DECISÃO: a mesma família do anel de
// choque da Queda, lavanda claro #eeb4c5 escurecendo pro sangue #942c40
// ENQUANTO cresce e some (cores travadas do ESTILO §5). Um material só
// pros três anéis: os três são a mesma "linha grossa", cor e opacidade
// andam juntas, em lerp LINEAR com o progresso (a opacidade derrete
// junto, o anel gasta enquanto expande). FICA no "reduzir movimento":
// o ESTILO §7 só isenta tremida e piscada da tela
// ===========================================================================
class BurstRing {
  readonly object = new THREE.Group();

  // Relógio próprio do efeito (padrão CrackPool): anda em TODO passo,
  // mesmo fora do Devastador — é ele quem expira o anel sozinho no reset
  // da luta ou na morte do chefe no meio do ataque
  private clock = 0;
  // instante do disparo no relógio acima; -Inf = nunca disparado
  private spawnedAt = -Infinity;

  // Material ÚNICO pros três anéis: cor e opacidade mudam JUNTAS
  private readonly material: THREE.LineBasicMaterial;
  // os três anéis de 1 px: [externo (+1 px), central, interno (−1 px)]
  private readonly rings: ReadonlyArray<THREE.LineLoop>;
  // defasagem de cada anel em UNIDADES, do mais externo pro mais interno
  private readonly offsets: ReadonlyArray<number>;
  // paleta pré-parseada uma vez: o update só faz lerp, sem alocar
  private readonly colorStart: THREE.Color;
  private readonly colorEnd: THREE.Color;

  constructor() {
    const ring = cfg.burstRing;
    this.material = new THREE.LineBasicMaterial({
      color: ring.colorStart,
      transparent: true,
      depthWrite: false,
    });
    // "grosso (3 px)": defasagem de ±(3−1)/2 = ±1 px de TELA entre os
    // anéis (thicknessPx ímpar = linha central + duas bordas)
    const halfPx = Math.floor(ring.thicknessPx / 2);
    this.offsets = [halfPx / PX_POR_UNIDADE, 0, -halfPx / PX_POR_UNIDADE];
    this.rings = this.offsets.map(() => buildUnitRing(ring.colorStart, this.material));
    for (const loop of this.rings) {
      // linha por cima dos decalques de chão (a rachadura e o lodo da
      // Queda ainda derretem quando o estouro estoura): os dois vivem na
      // fila transparente sem escrever profundidade, então é a ORDEM da
      // fila que decide quem fica por cima — mesmo papel do renderOrder
      // do anel da marca
      loop.renderOrder = 1;
    }
    this.colorStart = new THREE.Color(ring.colorStart);
    this.colorEnd = new THREE.Color(ring.colorEnd);
    this.object.visible = false;
  }

  // Dispara o anel no pé do chefe: SÓ grava o instante e a posição — o
  // desenho em si é o update que faz, lendo o relógio. Devastadores
  // nunca vêm seguidos (COMBATE.md) e o próximo sai ~4 s depois, muito
  // depois dos 0,2 s de vida: reciclar é só sobrescrever o instante
  spawn(x: number, z: number): void {
    this.spawnedAt = this.clock;
    // o group carrega o PÉ do chefe (a altura vem do config); os anéis
    // filhos ficam na origem local e só o scale muda por passo
    this.object.position.set(x, cfg.burstRing.y, z);
    this.object.visible = true;
  }

  // Passo fixo: o relógio anda SEMPRE; o anel existe só nos 0,2 s depois
  // do disparo, atravessando o fim do 'burst' e o comecinho do 'exhausted'
  update(dt: number): void {
    this.clock += dt;
    const ring = cfg.burstRing;
    const age = this.clock - this.spawnedAt;
    if (age >= ring.duration) {
      this.object.visible = false;
      return;
    }
    // progresso LINEAR com clamp de fósfogo (mesma conta dos outros
    // efeitos que leem tempo)
    const progress = Math.min(1, age / ring.duration);
    // raio central: 0 -> raio do círculo de aviso, lido do config a cada
    // passo (calibrável sem recarregar). O max segura o anel INTERNO no
    // comecinho: raio central menor que a defasagem daria raio NEGATIVO,
    // e círculo com scale negativo é o mesmo círculo espelhado — o
    // "interno" nasceria maior que o central
    const radius = bossCfg.devastator.radius * progress;
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].scale.setScalar(Math.max(0, radius + this.offsets[i]));
    }
    // lavanda -> sangue e opacidade 1 -> 0, LINEARES com o progresso:
    // "escurecendo [...] enquanto cresce e some"
    this.material.color.lerpColors(this.colorStart, this.colorEnd, progress);
    this.material.opacity = 1 - progress;
  }
}

// ===========================================================================
// 60 partículas de sangue e lodo do estouro do Devastador (ESTILO, seção
// 7, "Estouro": "60 partículas de sangue e lodo pra cima e pra fora,
// caindo com gravidade")
// ===========================================================================
// Disparo ÚNICO na MESMA transição 'charge' -> 'burst' do anel: as 60
// nascem JUNTAS no miolo do corpo (originHeight, a mesma conta do
// death.bossSparks), com velocidades sorteadas pra fora e pra cima, e a
// gravidade do config puxa de volta. Cores POR VÉRTICE (padrão
// DeathSparks/SuckParticles), 1 px com sizeAttenuation: false. COMO
// MORREM o doc não diz — DECISÃO: ao TOCAR O CHÃO, lendo como respingo
// (killHeight, o respiro de sempre); lifetime é a TAMPA de segurança
// registrada no config: se a calibração mudar e alguma partícula nunca
// alcançar o chão, expira ali pra nada ficar pendurado. Pool fixo com
// swap-remove e drawRange como as outras nuvens do arquivo (zero
// alocação por passo); a morte individual puxa o último vivo pro lugar
// do morto, e a COR viaja junto. FICA no "reduzir movimento": o ESTILO
// §7 só isenta tremida e piscada da tela
// ===========================================================================
class BurstParticles {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  // cor POR VÉRTICE: sangue e os quatro tons do lodo na MESMA nuvem
  // (PointsMaterial tem cor única), sorteada NO NASCIMENTO e carregada
  // pelo swap-remove junto com o resto do grão
  private readonly colors: Float32Array;
  // paleta pré-parseada uma vez: o nascimento só copia r/g/b
  private readonly palette: ReadonlyArray<THREE.Color>;
  // grãos vivos: slots [0, live), mantidos contíguos pelo swap-remove
  private live = 0;
  // Relógio próprio do efeito (padrões BurstRing/CrackPool): anda em
  // todo passo e guarda o instante do disparo — é ele quem aplica a
  // tampa e esvazia a nuvem sozinho no reset ou na morte no meio
  private clock = 0;
  private spawnedAt = -Infinity;
  // Semente fixa = 0x942c40, o sangue, primeira cor listada no doc pra
  // este efeito (ESTILO §7: "sangue e lodo"): qualquer valor serve, o que
  // importa é ser fixo, pro estouro sair igual em todo teste (mesma razão
  // dos outros rngs do arquivo). A sequência AVANÇA a cada disparo, então
  // dois estouros não saem gêmeos — padrão DeathSparks
  private readonly rng: Rng = createRng(0x942c40);

  constructor() {
    const burst = cfg.burstParticles;
    this.positions = new Float32Array(burst.count * 3);
    this.velocities = new Float32Array(burst.count * 3);
    this.colors = new Float32Array(burst.count * 3);
    this.palette = burst.colors.map((hex) => new THREE.Color(hex));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // desenha só os vivos: o swap-remove os mantém contíguos no começo
    geometry.setDrawRange(0, 0);
    // MESMA receita das outras nuvens (DeathSparks/SuckParticles): ponto
    // de 1 px em qualquer distância, cor por vértice, transparent +
    // depthWrite off pro blend não deixar quadradinho no buffer de
    // profundidade
    this.material = new THREE.PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud do particles.ts: as posições mudam todo passo, e o
    // three não pode achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Dispara as 60 de uma vez, do miolo do corpo do chefe: posições,
  // velocidades e cores ficam travadas aqui; o update só empurra
  spawn(x: number, z: number): void {
    const burst = cfg.burstParticles;
    this.spawnedAt = this.clock;
    this.live = burst.count;
    for (let i = 0; i < burst.count; i++) {
      // nascimento com volume em volta do miolo (padrão DeathSparks):
      // nascer de um PONTO só lê como estouro de caneta, não de corpo
      this.positions[i * 3] = x + (this.rng() - 0.5) * burst.spread;
      this.positions[i * 3 + 1] = burst.originHeight + (this.rng() - 0.5) * burst.spread;
      this.positions[i * 3 + 2] = z + (this.rng() - 0.5) * burst.spread;
      // "pra cima e pra fora": ângulo sorteado na volta inteira,
      // componentes horizontal e vertical sorteadas nos ranges do config
      const angle = this.rng() * Math.PI * 2;
      const outward = range(this.rng, burst.outwardSpeed.min, burst.outwardSpeed.max);
      this.velocities[i * 3] = Math.cos(angle) * outward;
      this.velocities[i * 3 + 1] = range(this.rng, burst.riseSpeed.min, burst.riseSpeed.max);
      this.velocities[i * 3 + 2] = Math.sin(angle) * outward;
      // sangue e lodo (ESTILO §5), sorteio uniforme por vértice
      const color = this.palette[int(this.rng, this.palette.length)];
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
    }
    this.object.visible = true;
  }

  // Passo fixo: gravidade, voo e morte no chão. O relógio anda SEMPRE;
  // a nuvem esvazia sozinha (última gota no chão ou tampa), mesmo se a
  // máquina sair do Devastador no meio (exausto, pausa, morte, reset)
  update(dt: number): void {
    this.clock += dt;
    const burst = cfg.burstParticles;
    // tampa de segurança (decisão no config): expirou a vida máxima,
    // esvazia de uma vez — com as velocidades de lá, todas tocam o chão
    // bem antes deste instante
    if (this.live > 0 && this.clock - this.spawnedAt >= burst.lifetime) {
      this.live = 0;
    }
    // gravidade e voo. De trás pra frente porque o remove puxa o ÚLTIMO
    // vivo pro lugar do morto — os ainda não visitados continuam íntegros
    // (mesma varredura das outras nuvens)
    for (let i = this.live - 1; i >= 0; i--) {
      this.velocities[i * 3 + 1] -= burst.gravity * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      // morte ao TOCAR O CHÃO (decisão no config): o grão some rente ao
      // piso, lendo como respingo — sem pop no ar, sem fade global
      if (this.positions[i * 3 + 1] <= burst.killHeight) {
        this.remove(i);
      }
    }
    this.object.visible = this.live > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
      this.object.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  // Mata o grão i sem deixar buraco: o último vivo pula pra vaga — os
  // vivos continuam contíguos em [0, live). A COR viaja junto, senão o
  // grão herdado pisca nas cores do que morreu
  private remove(index: number): void {
    const last = --this.live;
    if (index === last) return; // o morto já era o último: só encolhe
    for (let k = 0; k < 3; k++) {
      this.positions[index * 3 + k] = this.positions[last * 3 + k];
      this.velocities[index * 3 + k] = this.velocities[last * 3 + k];
      this.colors[index * 3 + k] = this.colors[last * 3 + k];
    }
  }
}

// ===========================================================================
// Faíscas do exausto do Devastador (ESTILO, seção 7, "Exausto": "ele fica
// curvado (altura 92%) e soltando faíscas devagar até se recuperar")
// ===========================================================================
// A POSE curvada mora no boss-view (computePose, não se mexe aqui); isto é
// a EMISSÃO CONTÍNUA de faíscas durante a fase 'exhausted' (1,4 s): pontos
// de 1 px nas duas cores de faísca TRAVADAS do ESTILO §5, nascendo
// DEVAGAR do TOPO dele (altura do config) e subindo devagar até apagar no
// fim da vida própria. Mesma família do CrouchDust: pool fixo com
// posições/velocidades/idades em Float32Array (nada alocado por passo),
// grãos vivos contíguos por swap-remove, drawRange, nascimento contínuo
// por taxa com carry. Cor POR VÉRTICE (padrão DeathSparks/SuckParticles):
// PointsMaterial tem cor única e o doc pede as DUAS na mesma nuvem,
// sorteada no nascimento e carregada pelo swap-remove junto com o grão.
// Fora da fase 'exhausted' nada nasce e a opacidade GLOBAL derrete em
// linha reta até 0 (padrão CrouchDust): o que estava no ar esvazia no fim
// das vidas sem pipocar — morte do chefe ou reset da luta no meio do
// exausto não penduram nada, porque este update roda em TODO passo.
// FICA no "reduzir movimento": o ESTILO §7 só isenta tremida e piscada
// da tela
// ===========================================================================
class ExhaustedSparks {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  // cor POR VÉRTICE, paleta pré-parseada uma vez: o nascimento só copia
  // r/g/b, sem alocar
  private readonly colors: Float32Array;
  private readonly palette: ReadonlyArray<THREE.Color>;
  // idades dos grãos: a morte é por idade no fim do lifetime (o grão
  // "apaga"), e o swap-remove carrega a idade junto
  private readonly ages: Float32Array;
  // grãos vivos: slots [0, live), mantidos contíguos pelo swap-remove
  private live = 0;
  // fração de nascimento que não fechou um passo inteiro (mesma conta do
  // CrouchDust: 9/s a 60 Hz dão 0,15 por passo — sem o carry, o floor
  // perdia os nascimentos fracionários)
  private carry = 0;
  // tempo desde o fim do exausto: o relógio da opacidade global na deriva
  private drainTime = 0;
  // Semente fixa = 0xcf9ba3, a faísca escura, primeira cor listada no doc
  // pra este efeito (ESTILO §5): qualquer valor serve, o que importa é
  // ser fixo, pro exausto sair igual em todo teste (mesma razão dos
  // outros rngs do arquivo)
  private readonly rng: Rng = createRng(0xcf9ba3);

  constructor() {
    const sparks = cfg.exhaustedSparks;
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
    // MESMA receita das outras nuvens (DeathSparks/SuckParticles): ponto
    // de 1 px em qualquer distância, cor por vértice, transparent +
    // depthWrite off pro blend da deriva não deixar quadradinho no
    // buffer de profundidade
    this.material = new THREE.PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud do particles.ts: as posições mudam todo passo, e o
    // three não pode achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Passo fixo: nasce só na fase 'exhausted' (o chefe fica PARADO nela,
  // COMBATE.md); vive, sobe e apaga sempre, até na deriva
  update(dt: number, boss: Boss): void {
    const sparks = cfg.exhaustedSparks;
    const exhausted = boss.devastator?.phase === 'exhausted';

    if (exhausted) {
      // nascimento contínuo por taxa com carry (mesma conta do CrouchDust):
      // o carry acumula a fração do passo anterior, então a média de
      // faíscas por segundo sai certa
      this.drainTime = 0;
      this.carry += sparks.perSecond * dt;
      const births = Math.floor(this.carry);
      this.carry -= births;
      for (let i = 0; i < births; i++) this.spawn(boss);
    } else {
      // fora do exausto (recuperação, pausa, dormindo, morto, reset) nada
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

    // Opacidade GLOBAL: cheia enquanto nasce; na deriva, cai em linha reta
    // até 0 no fim da vida máxima (padrão CrouchDust/DeathSparks) — quem
    // morre no meio da deriva já está esmaecido, o pop não lê
    this.material.opacity = exhausted ? 1 : Math.max(0, 1 - this.drainTime / sparks.lifetime);

    this.object.visible = this.live > 0 && this.material.opacity > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
      this.object.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  // Nasce uma faísca no TOPO do chefe, na região dos ombros/cabeça
  private spawn(boss: Boss): void {
    const sparks = cfg.exhaustedSparks;
    // pool cheio: perde ESTE nascimento (padrão CrouchDust) — o pool é
    // ~2x o pico de vivas, então só um atraso gigante chega aqui
    if (this.live >= sparks.pool) return;
    const i = this.live++;
    // disco em volta do eixo dele na altura do config: o topo é uma
    // região, não um ponto — faísca nascida num só ponto lê como fio
    const angle = this.rng() * Math.PI * 2;
    const dist = this.rng() * sparks.spread;
    this.positions[i * 3] = boss.x + Math.cos(angle) * dist;
    this.positions[i * 3 + 1] = sparks.height;
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

// ===========================================================================
// Rachadura do impacto da Queda (ESTILO, seção 7, "Impacto": "Rachadura no
// chão (linhas #050409 tortas saindo do ponto, gerada por código) que some
// em 4 s")
// ===========================================================================
// Pool de slots pré-montados no construtor: cada slot é um Group de
// polilinhas tortas (crookedPath do kit.ts) em ângulos distribuídos em
// volta do ponto, com comprimentos e trechos sorteados UMA vez, num rng de
// semente fixa — zero alocação de geometria durante o jogo. O disparo só
// reposiciona o slot no ponto da queda e religa o fade; o re-disparo
// recicla o slot mais antigo (pool 3 cobre Quedas seguidas)
// ===========================================================================

// Fatia deitada ligando dois pontos do chão: a MESMA montagem da
// veinSegment do kit.ts (rotation.z = atan2(−dx, −dz) gira a fatia no
// próprio plano ANTES de deitar, deixando o eixo comprido paralelo ao
// trecho), feita localmente porque a de lá é específica das veias —
// altura fixa VEINS.y e MeshLambert. Aqui a altura vem do config e o
// material é MeshBasic: decalque escuro de chão não recebe luz, o
// #050409 do doc tem que ficar escuro mesmo em cima do piso iluminado
// (mesma decisão da marca da queda)
function crackSegment(
  from: { x: number; z: number },
  to: { x: number; z: number },
  width: number,
  y: number,
  material: THREE.MeshBasicMaterial,
): THREE.Mesh {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const segment = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.hypot(dx, dz)), material);
  segment.rotation.x = -Math.PI / 2;
  segment.position.y = y;
  segment.rotation.z = Math.atan2(-dx, -dz);
  segment.position.x = (from.x + to.x) / 2;
  segment.position.z = (from.z + to.z) / 2;
  return segment;
}

class CrackPool {
  readonly object = new THREE.Group();

  // Relógio do pool: cada slot guarda o instante (neste relógio) em que
  // foi disparado. "Mais antigo" é o MENOR spawnedAt — é ele quem o
  // re-disparo recicla, naturalmente um slot já expirado quando houver
  private clock = 0;
  private readonly slots: { group: THREE.Group; material: THREE.MeshBasicMaterial; spawnedAt: number }[] = [];

  constructor() {
    const crack = cfg.impactDecals.crack;
    // Semente fixa = 0x050409, a própria cor da rachadura do doc
    // (ESTILO §7): qualquer valor serve, o que importa é ser fixo, pra as
    // três formas saírem iguais em toda abertura do jogo e dar pra
    // comparar print com print (mesma razão dos outros rngs do jogo)
    const rng = createRng(0x050409);
    // Largura de 1 texel (1/18,7 un): a rachadura é linha fina, e 1 texel
    // continua valendo ~1 px na tela (ESTILO, seção 3)
    const width = 1 / PX_POR_UNIDADE;

    for (let s = 0; s < crack.pool; s++) {
      // Um material POR SLOT: o fade é individual (cada aterrissagem tem
      // a própria idade), então os slots não podem dividir o material
      const material = new THREE.MeshBasicMaterial({
        color: crack.color,
        transparent: true,
        depthWrite: false,
      });
      const group = new THREE.Group();

      // Polilinhas saindo do PONTO (origem local do grupo), ângulos
      // distribuídos em volta: a irregularidade de "rachadura" vem do
      // torto do crookedPath e dos comprimentos/trechos sorteados por
      // linha, não de ângulos irregularmente espaçados
      for (let i = 0; i < crack.lines; i++) {
        const angle = (i / crack.lines) * Math.PI * 2;
        const length = range(rng, crack.length.min, crack.length.max);
        const segments = crack.segments.min + int(rng, crack.segments.max - crack.segments.min + 1);
        const path = crookedPath(
          { x: 0, z: 0 },
          { x: Math.cos(angle) * length, z: Math.sin(angle) * length },
          segments,
          rng,
          crack.wander,
        );
        for (let k = 0; k + 1 < path.length; k++) {
          group.add(crackSegment(path[k], path[k + 1], width, crack.y, material));
        }
      }

      group.visible = false;
      this.slots.push({ group, material, spawnedAt: -Infinity });
      this.object.add(group);
    }
  }

  // Dispara a rachadura no ponto da queda: recicla o slot mais antigo
  // (menor spawnedAt — nunca usado perde pra qualquer usado, e entre
  // nunca usados o primeiro que a varredura acha)
  spawn(x: number, z: number): void {
    let oldest = this.slots[0];
    for (const slot of this.slots) {
      if (slot.spawnedAt < oldest.spawnedAt) oldest = slot;
    }
    oldest.spawnedAt = this.clock;
    // o group fica em y 0: as fatias já carregam a altura do config
    oldest.group.position.set(x, 0, z);
    oldest.group.visible = true;
    oldest.material.opacity = 1;
  }

  update(dt: number): void {
    this.clock += dt;
    const crack = cfg.impactDecals.crack;
    for (const slot of this.slots) {
      if (!slot.group.visible) continue;
      const age = this.clock - slot.spawnedAt;
      // "some em 4 s" (doc): a opacidade derrete em linha reta do 1 ao 0
      // ao longo dos 4 s INTEIROS do config — sem segurar cheia no começo
      // nem cair de pena no fim; vencido, invisível
      const opacity = 1 - age / crack.fadeDuration;
      if (opacity <= 0) {
        slot.group.visible = false;
      } else {
        slot.material.opacity = opacity;
      }
    }
  }
}

// ===========================================================================
// Mancha de lodo do impacto da Queda (ESTILO, seção 7, "Impacto": "Mancha
// de lodo #1d0f12 que fica 6 s")
// ===========================================================================
// Mesma família das poças permanentes do chão da arena (kit.ts): blob
// irregular via puddleTexture com a dupla de lodo do CENA3D (#1d0f12 com
// borda #412e29), MeshLambert + alphaTest — pixel inteiro, recebe a luz
// do fogo e do chefe. Pool com a textura pré-gerada UMA vez por slot no
// construtor (rng de semente), durando 6 s por disparo e reciclando o
// slot mais antigo quando a Queda volta antes
// ===========================================================================
class SludgePool {
  readonly object = new THREE.Group();

  // Mesmo relógio/escolha de slot da rachadura: "mais antigo" é o menor
  // spawnedAt
  private clock = 0;
  private readonly slots: { mesh: THREE.Mesh; spawnedAt: number }[] = [];

  constructor() {
    const sludge = cfg.impactDecals.sludge;
    // Semente fixa = 0x1d0f12, a própria cor do lodo do doc (ESTILO §5):
    // mesma razão do rng da rachadura — as manchas saem iguais em todo
    // teste. Um rng só pra os três slots: a sequência avança, cada slot
    // pega uma forma diferente
    const rng = createRng(0x1d0f12);

    for (let s = 0; s < sludge.pool; s++) {
      const radius = range(rng, sludge.radius.min, sludge.radius.max);
      // Lado do canvas: raio × 2 × PX_POR_UNIDADE, a mesma conta das
      // poças do kit.ts — 1 texel da mancha vale ~1 px na tela (ESTILO §3)
      const side = Math.round(radius * 2 * PX_POR_UNIDADE);
      // alphaTest 0.5 SEM transparent: pixel inteiro, sem meio-termo — o
      // decalque de chão não derrete, a mesma receite das poças
      const material = new THREE.MeshLambertMaterial({
        map: puddleTexture(rng, side, sludge.fill, sludge.border),
        alphaTest: 0.5,
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(side / PX_POR_UNIDADE, side / PX_POR_UNIDADE),
        material,
      );
      // deita como layFlat do kit: o y do config (acima das poças
      // permanentes 0,01, abaixo da rachadura 0,015), x/z no disparo
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = sludge.y;
      mesh.visible = false;
      this.slots.push({ mesh, spawnedAt: -Infinity });
      this.object.add(mesh);
    }
  }

  // Dispara a mancha no ponto da queda, reciclando o slot mais antigo
  spawn(x: number, z: number): void {
    let oldest = this.slots[0];
    for (const slot of this.slots) {
      if (slot.spawnedAt < oldest.spawnedAt) oldest = slot;
    }
    oldest.spawnedAt = this.clock;
    oldest.mesh.position.x = x;
    oldest.mesh.position.z = z;
    oldest.mesh.visible = true;
  }

  update(dt: number): void {
    this.clock += dt;
    const sludge = cfg.impactDecals.sludge;
    for (const slot of this.slots) {
      if (!slot.mesh.visible) continue;
      // "fica 6 s" (doc): FICA — a mancha dura inteira e some no tick dos
      // 6 s exatos, SEM fade. Leitura literal do doc: lodo é matéria no
      // chão, derreter leria como fantasma em vez de sujeira
      if (this.clock - slot.spawnedAt >= sludge.duration) {
        slot.mesh.visible = false;
      }
    }
  }
}

// ===========================================================================
// Anel de choque FINO do impacto da Queda (ESTILO, seção 7, "Impacto":
// "Anel de choque fino #eeb4c5 que cresce de 0 a 70 px em 0,3 s,
// escurecendo pra #942c40 e sumindo")
// ===========================================================================
// Anel de LINHA no chão, centrado no PONTO da queda (fall.targetX/targetZ,
// onde o chefe aterrissa), expande LINEARMENTE de 0 até 70 px de TELA
// (convertidos com PX_POR_UNIDADE) em 0,3 s e some. A MESMA família de
// decisão do anel grosso do estouro (BurstRing), sem a grossura: o "fino"
// do doc é UM LineLoop de 1 px (LineBasicMaterial no WebGL é sempre 1 px),
// então aqui não tem os três concêntricos — cor e opacidade andam JUNTAS
// em lerp LINEAR com o progresso (lavanda -> sangue, opacidade derretendo
// enquanto cresce, o anel gasta enquanto expande).
//
// A fase 'impact' dura só 0,1 s (COMBATE.md), então os 0,2 s finais do
// anel já correm no começo da fase 'stuck' — ninguém na máquina conta
// esse tempo, e o anel ganha relógio PRÓPRIO (padrão BurstRing/
// CrackPool.spawnedAt: um clock interno que anda sempre, e o disparo só
// grava o instante dele). Assim, morte do chefe ou reset da luta logo
// após a aterrissagem deixam o relógio expirar o anel sozinho, sem
// estado pendurado. FICA no "reduzir movimento": o ESTILO §7 só isenta
// tremida e piscada da tela
// ===========================================================================
class ShockRing {
  // o PRÓPRIO LineLoop é o objeto (a marca da Queda segue o mesmo papel:
  // um decalque único entra direto no add do BossEffects) — sem Group
  // wrapper, o BurstRing só tem um porque carrega TRÊS anéis
  readonly object: THREE.LineLoop;

  // Relógio próprio do efeito (padrão BurstRing): anda em TODO passo,
  // mesmo fora da Queda — é ele quem expira o anel sozinho no reset da
  // luta ou na morte do chefe logo depois da aterrissagem
  private clock = 0;
  // instante do disparo no relógio acima; -Inf = nunca disparado
  private spawnedAt = -Infinity;

  private readonly material: THREE.LineBasicMaterial;
  // paleta pré-parseada uma vez: o update só faz lerp, sem alocar
  private readonly colorStart: THREE.Color;
  private readonly colorEnd: THREE.Color;

  constructor() {
    const ring = cfg.shockRing;
    this.material = new THREE.LineBasicMaterial({
      color: ring.colorStart,
      transparent: true,
      depthWrite: false,
    });
    this.object = buildUnitRing(ring.colorStart, this.material);
    // linha por cima dos decalques de chão que nascem no mesmo ponto
    // (rachadura e lodo): todos vivem na fila transparente sem escrever
    // profundidade, então é a ORDEM da fila que decide — mesmo papel do
    // renderOrder do anel da marca e dos anéis do estouro
    this.object.renderOrder = 1;
    this.colorStart = new THREE.Color(ring.colorStart);
    this.colorEnd = new THREE.Color(ring.colorEnd);
    this.object.visible = false;
  }

  // Dispara o anel no ponto da queda: SÓ grava o instante e a posição —
  // o desenho em si é o update que faz, lendo o relógio. A Queda pode
  // voltar (ciclo mínimo ~2,7 s, muito depois dos 0,3 s de vida):
  // reciclar é só sobrescrever o instante
  spawn(x: number, z: number): void {
    this.spawnedAt = this.clock;
    this.object.position.set(x, cfg.shockRing.y, z);
    this.object.visible = true;
  }

  // Passo fixo: o relógio anda SEMPRE; o anel existe só nos 0,3 s depois
  // do disparo, atravessando a fase 'impact' (0,1 s) e o começo do
  // 'stuck'
  update(dt: number): void {
    this.clock += dt;
    const ring = cfg.shockRing;
    const age = this.clock - this.spawnedAt;
    if (age >= ring.duration) {
      this.object.visible = false;
      return;
    }
    // progresso LINEAR com clamp de fósfogo (mesma conta do BurstRing e
    // da marca): o último passo pode passar da duração antes do próximo
    // update
    const progress = Math.min(1, age / ring.duration);
    // raio: 0 -> 70 px de TELA convertidos com PX_POR_UNIDADE (ESTILO,
    // seção 3), lido do config a cada passo (calibrável sem recarregar).
    // O max segura o comecinho: age 0 exato daria scale 0, e LineLoop
    // degenerado não desenha nada — comportamento correto pro "cresce
    // de 0", só explicitado
    this.object.scale.setScalar(Math.max(0, (ring.radiusPx / PX_POR_UNIDADE) * progress));
    // lavanda -> sangue e opacidade 1 -> 0, LINEARES com o progresso
    // (mesma família do anel grosso do estouro): "escurecendo pra
    // #942c40 e sumindo"
    this.material.color.lerpColors(this.colorStart, this.colorEnd, progress);
    this.material.opacity = 1 - progress;
  }
}

// ===========================================================================
// 24 lascas de pedra do impacto da Queda (ESTILO, seção 7, "Impacto": "24
// lascas de pedra (2x2 px, tons da pedra) voando com gravidade, quicando
// uma vez e sumindo")
// ===========================================================================
// Disparo ÚNICO na MESMA transição 'air' -> 'impact' dos decalques: as 24
// nascem JUNTAS no ponto da queda (um respiro acima do killHeight, senão
// "bateriam no chão" no próprio nascimento), com velocidades sorteadas
// pra FORA e pra CIMA, e a gravidade do config puxa de volta. "QUICANDO
// UMA VEZ": a PRIMEIRA batida no chão inverte a velocidade vertical
// amortecida pela restitution do config (quique visível e mais baixo
// que o voo); a batida é registrada POR PARTÍCULA (bounced, um byte por
// lasca carregado pelo swap-remove), e a SEGUNDA batida mata — a lasca
// some rente ao chão, lendo como pedra gasta, sem pop no ar.
//
// Pontos de 2 px (PointsMaterial size 2, sizeAttenuation: false — o
// "2x2 px" do doc), cor POR VÉRTICE (padrão DeathSparks/BurstParticles):
// PointsMaterial tem cor única e a lasca pede os TONS DA PEDRA, sorteados
// no nascimento. Pool fixo com swap-remove e drawRange (zero alocação por
// passo); lifetime é a TAMPA de segurança do config: com restituição < 1
// a segunda batida sempre vem, a tampa existe pra calibração maluca não
// pendurar lasca quicando pra sempre. FICA no "reduzir movimento": o
// ESTILO §7 só isenta tremida e piscada da tela
// ===========================================================================
class Shards {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  // cor POR VÉRTICE: os tons da pedra escolhidos no config na MESMA nuvem
  // (PointsMaterial tem cor única), sorteada NO NASCIMENTO e carregada
  // pelo swap-remove junto com o resto da lasca
  private readonly colors: Float32Array;
  // paleta pré-parseada uma vez: o nascimento só copia r/g/b
  private readonly palette: ReadonlyArray<THREE.Color>;
  // "já quicou" POR PARTÍCULA: 1 = já teve a primeira batida. O swap-
  // remove carrega junto, senão a lasca herdada quicava duas vezes
  private readonly bounced: Uint8Array;
  // lascas vivas: slots [0, live), mantidas contíguas pelo swap-remove
  private live = 0;
  // Relógio próprio do efeito (padrões ShockRing/BurstParticles): anda em
  // todo passo e guarda o instante do disparo — é ele quem aplica a tampa
  // e esvazia a nuvem sozinho no reset ou na morte no meio
  private clock = 0;
  private spawnedAt = -Infinity;
  // Semente fixa = 0x765d68, um dos tons da pedra escolhidos pra este
  // efeito (ESTILO §5): qualquer valor serve, o que importa é ser fixo,
  // pro impacto sair igual em todo teste (mesma razão dos outros rngs do
  // arquivo). A sequência AVANÇA a cada disparo, então duas Quedas não
  // saem gêmeas — padrão BurstParticles/DeathSparks
  private readonly rng: Rng = createRng(0x765d68);

  constructor() {
    const shards = cfg.shards;
    this.positions = new Float32Array(shards.count * 3);
    this.velocities = new Float32Array(shards.count * 3);
    this.colors = new Float32Array(shards.count * 3);
    this.bounced = new Uint8Array(shards.count);
    this.palette = shards.colors.map((hex) => new THREE.Color(hex));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // desenha só as vivas: o swap-remove as mantém contíguas no começo
    geometry.setDrawRange(0, 0);
    // MESMA receita das outras nuvens (DeathSparks/BurstParticles), mudando
    // o size: ponto de 2 px em qualquer distância (o "2x2 px" do doc), cor
    // por vértice, transparent + depthWrite off pro blend não deixar
    // quadradinho no buffer de profundidade
    this.material = new THREE.PointsMaterial({
      size: shards.sizePx,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud do particles.ts: as posições mudam todo passo, e o
    // three não pode achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Dispara as 24 de uma vez, do ponto da queda: posições, velocidades,
  // cores e a bandeira de quique ficam travadas aqui; o update só empurra
  spawn(x: number, z: number): void {
    const shards = cfg.shards;
    this.spawnedAt = this.clock;
    this.live = shards.count;
    for (let i = 0; i < shards.count; i++) {
      // nascimento rente ao ponto, um respiro ACIMA do killHeight (ver
      // comentário da classe): nascer colado nele seria "bater no chão"
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = shards.originHeight;
      this.positions[i * 3 + 2] = z;
      // "voando": ângulo sorteado na volta inteira, componentes horizontal
      // e vertical sorteadas nos ranges do config (mesma forma do
      // BurstParticles)
      const angle = this.rng() * Math.PI * 2;
      const outward = range(this.rng, shards.outwardSpeed.min, shards.outwardSpeed.max);
      this.velocities[i * 3] = Math.cos(angle) * outward;
      this.velocities[i * 3 + 1] = range(this.rng, shards.riseSpeed.min, shards.riseSpeed.max);
      this.velocities[i * 3 + 2] = Math.sin(angle) * outward;
      // um dos tons da pedra do config, sorteio uniforme por vértice
      const color = this.palette[int(this.rng, this.palette.length)];
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      // nasce SEM ter quicado: a primeira batida é a primeira mesmo
      this.bounced[i] = 0;
    }
    this.object.visible = true;
  }

  // Passo fixo: gravidade, voo, quique e morte. O relógio anda SEMPRE;
  // a nuvem esvazia sozinha (segunda batida ou tampa), mesmo se a
  // máquina sair da Queda no meio (preso, pausa, morte, reset)
  update(dt: number): void {
    this.clock += dt;
    const shards = cfg.shards;
    // tampa de segurança (decisão no config): expirou a vida máxima,
    // esvazia de uma vez — com os números de lá, todas morrem na segunda
    // batida bem antes deste instante
    if (this.live > 0 && this.clock - this.spawnedAt >= shards.lifetime) {
      this.live = 0;
    }
    // gravidade e voo. De trás pra frente porque o remove puxa a ÚLTIMA
    // viva pro lugar da morta — as ainda não visitadas continuam íntegras
    // (mesma varredura das outras nuvens)
    for (let i = this.live - 1; i >= 0; i--) {
      this.velocities[i * 3 + 1] -= shards.gravity * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      // batida no chão: rente ao killHeight
      if (this.positions[i * 3 + 1] <= shards.killHeight) {
        if (this.bounced[i] === 0) {
          // PRIMEIRA batida: QUICA — vertical invertida e amortecida pela
          // restitution, e a lasca volta pro respiro do chão pra não
          // afundar batendo de novo no mesmo passo
          this.bounced[i] = 1;
          this.positions[i * 3 + 1] = shards.killHeight;
          this.velocities[i * 3 + 1] = -this.velocities[i * 3 + 1] * shards.restitution;
        } else {
          // SEGUNDA batida: "quicando uma vez e sumindo" — morre rente
          // ao piso, lendo como pedra gasta (sem pop no ar, sem fade)
          this.remove(i);
        }
      }
    }
    this.object.visible = this.live > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
      this.object.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  // Mata a lasca i sem deixar buraco: a última viva pula pra vaga — as
  // vivas continuam contíguas em [0, live). A COR e a BANDEIRA de quique
  // viajam junto, senão a lasca herdada pisca nas cores da morta e quica
  // uma vez a mais
  private remove(index: number): void {
    const last = --this.live;
    if (index === last) return; // a morta já era a última: só encolhe
    for (let k = 0; k < 3; k++) {
      this.positions[index * 3 + k] = this.positions[last * 3 + k];
      this.velocities[index * 3 + k] = this.velocities[last * 3 + k];
      this.colors[index * 3 + k] = this.colors[last * 3 + k];
    }
    this.bounced[index] = this.bounced[last];
  }
}

// ===========================================================================
// Leque de 40 pontos de poeira do impacto da Queda (ESTILO, seção 7,
// "Impacto": "Leque de 40 pontos de poeira")
// ===========================================================================
// Disparo ÚNICO na MESMA transição 'air' -> 'impact' dos decalques: 40
// pontos de 1 px na cor da poeira do jogo (#7f78a1, a mesma da ambiente e
// da do agachar), nascendo no ponto da queda e abrindo em LEQUE pra fora —
// direções radiais no plano do chão. O "leque" são ângulos DISTRIBUÍDOS na
// volta inteira (i/count · 2π) com um jitter de meio passo sorteado no rng
// de semente fixa — jitter derivado da própria contagem, não é número de
// ajuste: sem ele, quarenta pontos sorteados deixa buracos e aglomerados,
// e o leque perde a leitura de raios abrindo do centro.
//
// Cada grão sobe CURTO (o mesmo arrasto desacelera a subida; poeira não
// cai — a ambiente sobe, ESTILO §7) e desacelera no arrasto do ar até
// quase parar. MORRE por idade própria no fim da vida sorteada no
// nascimento, e a opacidade GLOBAL derrete em linha reta do disparo até o
// fim da vida MÁXIMA (padrão dos pools: CrouchDust/DeathSparks) — quem
// morre no meio já está esmaecido, o pop não lê, e a nuvem esvazia em
// vez de apagar em bloco. Relógio próprio (padrão ShockRing): reset ou
// morte logo após a aterrissagem deixam tudo expirar sozinho. FICA no
// "reduzir movimento": o ESTILO §7 só isenta tremida e piscada da tela
// ===========================================================================
class ImpactDust {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  // idades e vidas dos grãos: a morte é por idade no fim da vida PRÓPRIA
  // (sorteada no nascimento, no range do config) — o swap-remove carrega
  // os dois junto
  private readonly ages: Float32Array;
  private readonly lifetimes: Float32Array;
  // grãos vivos: slots [0, live), mantidos contíguos pelo swap-remove
  private live = 0;
  // Relógio próprio do efeito (padrões ShockRing/Shards): anda em todo
  // passo e guarda o instante do disparo — é ele quem expira o fade global
  // sozinho no reset ou na morte no meio
  private clock = 0;
  private spawnedAt = -Infinity;
  // Semente fixa = 0x7f78a1, a própria cor da poeira em hex (o CrouchDust
  // usa 0x7f78, os primeiros dígitos da mesma cor — aqui a cor inteira,
  // pra as sequências serem distintas): qualquer valor serve, o que
  // importa é ser fixo, pro leque sair igual em todo teste. A sequência
  // AVANÇA a cada disparo, então duas Quedas não saem gêmeas
  private readonly rng: Rng = createRng(0x7f78a1);

  constructor() {
    const dust = cfg.impactDust;
    this.positions = new Float32Array(dust.count * 3);
    this.velocities = new Float32Array(dust.count * 3);
    this.ages = new Float32Array(dust.count);
    this.lifetimes = new Float32Array(dust.count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // desenha só os vivos: o swap-remove os mantém contíguos no começo
    geometry.setDrawRange(0, 0);
    // MESMA receita das outras nuvens (CrouchDust/DeathSparks): ponto de
    // 1 px em qualquer distância, cor ÚNICA no material (o doc pede uma
    // cor só — a da poeira —, sem vertexColors), transparent + depthWrite
    // off pro fade não deixar quadradinho no buffer de profundidade
    this.material = new THREE.PointsMaterial({
      color: dust.color,
      size: 1,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Points(geometry, this.material);
    // idem pointCloud do particles.ts: as posições mudam todo passo, e o
    // three não pode achar que a nuvem saiu da tela
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  // Dispara as 40 de uma vez, do ponto da queda: posições, velocidades e
  // vidas ficam travadas aqui; o update só empurra
  spawn(x: number, z: number): void {
    const dust = cfg.impactDust;
    this.spawnedAt = this.clock;
    this.live = dust.count;
    for (let i = 0; i < dust.count; i++) {
      // LEQUE: ângulo base distribuído na volta inteira + jitter de meio
      // passo (2π/count, derivado da contagem) — ver comentário da classe
      const step = (Math.PI * 2) / dust.count;
      const angle = i * step + (this.rng() - 0.5) * step;
      this.positions[i * 3] = x;
      // 0,01 acima do chão, o mesmo respiro da poeira do agachar: ponto
      // colado no y do piso briga no depth test com o chão e pisca
      this.positions[i * 3 + 1] = 0.01;
      this.positions[i * 3 + 2] = z;
      // velocidade RADIAL no plano do chão, magnitude sorteada no range;
      // componente vertical curta pra cima
      const outward = range(this.rng, dust.outwardSpeed.min, dust.outwardSpeed.max);
      this.velocities[i * 3] = Math.cos(angle) * outward;
      this.velocities[i * 3 + 1] = range(this.rng, dust.riseSpeed.min, dust.riseSpeed.max);
      this.velocities[i * 3 + 2] = Math.sin(angle) * outward;
      this.ages[i] = 0;
      // vida própria sorteada no range do config: quem nasce pra morrer
      // cedo esvazia a nuvem grão a grão, não em bloco
      this.lifetimes[i] = range(this.rng, dust.lifetime.min, dust.lifetime.max);
    }
    this.object.visible = true;
  }

  // Passo fixo: arrasto, voo e morte por idade. O relógio anda SEMPRE; a
  // nuvem esvazia sozinha (idade ou fade zerando a visibilidade), mesmo se
  // a máquina sair da Queda no meio (preso, pausa, morte, reset)
  update(dt: number): void {
    this.clock += dt;
    const dust = cfg.impactDust;
    // voo, idade e morte. De trás pra frente porque o remove puxa o
    // ÚLTIMO vivo pro lugar do morto — os ainda não visitados continuam
    // íntegros (mesma varredura dos outros pools)
    for (let i = this.live - 1; i >= 0; i--) {
      this.ages[i] += dt;
      if (this.ages[i] >= this.lifetimes[i]) {
        this.remove(i);
        continue;
      }
      // "desacelerando": arrasto proporcional (v -= v·drag·dt), o mesmo
      // fator nas três componentes — a nuvem abre rápida, amassa em
      // ~0,4 s e quase para no ar; sem alocação, sem sqrt
      const drag = 1 - dust.drag * dt;
      this.velocities[i * 3] *= drag;
      this.velocities[i * 3 + 1] *= drag;
      this.velocities[i * 3 + 2] *= drag;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    // Opacidade GLOBAL em linha reta do disparo até o fim da vida MÁXIMA
    // (padrão DeathSparks/CrouchDust na deriva): quem morre no meio já
    // está esmaecido, o pop não lê — e a nuvem esvazia sem apagar em
    // bloco. O relógio próprio segura o caso do reset/morte logo após a
    // aterrissagem: o fade continua derretendo até zerar a visibilidade
    this.material.opacity = Math.max(
      0,
      1 - (this.clock - this.spawnedAt) / dust.lifetime.max,
    );
    this.object.visible = this.live > 0 && this.material.opacity > 0;
    this.object.geometry.setDrawRange(0, this.live);
    if (this.live > 0) {
      this.object.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  // Mata o grão i sem deixar buraco: o último vivo pula pra vaga — os
  // vivos continuam contíguos em [0, live). A vida RESTANTE viaja junto
  // (a idade conta o próprio grão, então só ela basta além das posições)
  private remove(index: number): void {
    const last = --this.live;
    if (index === last) return; // o morto já era o último: só encolhe
    for (let k = 0; k < 3; k++) {
      this.positions[index * 3 + k] = this.positions[last * 3 + k];
      this.velocities[index * 3 + k] = this.velocities[last * 3 + k];
    }
    this.ages[index] = this.ages[last];
    this.lifetimes[index] = this.lifetimes[last];
  }
}

// Efeitos visuais dos ataques do chefe (ESTILO, seção 7, "Efeitos do
// chefe"): a camada de DESENHO dos ataques, lendo o estado que a máquina
// no boss.ts produz a cada passo fixo — mesma separação do boss.ts /
// boss-view.ts (nada de three.js na lógica, nada de regra de jogo aqui).
// Hoje a marca da queda, o círculo de aviso do Devastador, as partículas
// sugadas da carga, o anel de choque grosso e as 60 partículas de sangue
// e lodo do estouro, a poeira do agachar, os decalques do impacto
// (rachadura e mancha de lodo), o anel de choque fino, as lascas de
// pedra e o leque de poeira da aterrissagem — cada um na sua seção,
// com os números no bloco bossEffects do config.ts.
export class BossEffects {
  readonly object = new THREE.Group();

  // ==========================================================================
  // Efeito: marca da queda (ESTILO, seção 7, "Queda (o pulo)")
  // ==========================================================================
  // "No alvo aparece a marca da queda: círculo #050409 que cresce de 20% a
  // 100% do raio do impacto durante o voo, com um anel #942c40 na borda que
  // pisca a cada 0,1 s nos últimos 0,3 s". Visível SÓ na fase 'air', no
  // alvo travado no fim do agachar (fall.targetX/targetZ) — na aterrissagem
  // (fase 'impact') a marca já cumpriu o aviso e some: o anel de choque,
  // as lascas e a poeira da aterrissagem são outros efeitos, mais abaixo
  // ==========================================================================

  // Círculo escuro: geometria UNITÁRIA (raio 1) criada uma vez, o raio real
  // entra pelo scale a cada passo — sem reconstruir geometria por passo.
  // Mesh Basic como a sombra do chefe (boss-view): decalque de chão não
  // recebe luz, e o escuro do ESTILO §7 tem que ficar escuro mesmo em cima
  // do chão iluminado. transparent + depthWrite desligados pra não vazar
  // sobre os outros decalques do chão (mesma família da sombra dele)
  private readonly mark: THREE.Mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      color: cfg.mark.color,
      transparent: true,
      opacity: cfg.mark.opacity,
      depthWrite: false,
    }),
  );

  // Anel na BORDA do círculo: LineLoop fino (1 px) de 48 pontos unitários,
  // escalado pelo MESMO raio do círculo. renderOrder maior que o do círculo:
  // os dois vivem na fila transparente sem escrever profundidade, então é a
  // ORDEM da fila que decide quem fica por cima — e a borda do anel tem que
  // cobrir a do círculo, não o contrário
  private readonly ring: THREE.LineLoop = buildUnitRing(cfg.mark.ringColor);

  // ==========================================================================
  // Efeito: círculo de aviso do Devastador (ESTILO, seção 7, "Devastador")
  // ==========================================================================
  // "Carga (1,6 s): [...] O círculo de aviso escurece com dithering
  // conforme carrega (25%, 50%, 75% dos pixels)". Círculo de raio 100 px
  // (COMBATE.md, Ataque 2) em volta do PÉ do chefe, visível SÓ na fase
  // 'charge': no estouro ('burst') ele some — o anel grosso da explosão
  // (logo abaixo) expande "até a borda do aviso", e a borda em si não
  // continua desenhada. Como a marca, é aviso de JOGABILIDADE (mostra até
  // onde o estouro pega): não atende ao "reduzir movimento"
  // ==========================================================================

  // Uma textura por degrau do dither, geradas UMA vez na construção (nunca
  // por passo): o update só troca a referência no material.map conforme o
  // terço da carga
  private readonly warningTextures: ReadonlyArray<THREE.Texture> = cfg.warning.densities.map(
    (density) => warningTexture(density),
  );

  // Material em campo próprio (o .material do Mesh é tipado como Material
  // genérico, sem map acessível). MeshBasic como a marca: decalque de chão
  // não recebe luz — a faixa #050409 tem que continuar escura em cima do
  // chão iluminado. alphaTest 0.5 SEM transparent: pixel inteiro, sem
  // meio-termo — o dither É a transparência (mesma receita dos decalques
  // de chão do kit.ts, poças e símbolo)
  private readonly warningMaterial = new THREE.MeshBasicMaterial({
    color: cfg.warning.color,
    // degrau 0 (25%) até o update mandar outro; máscara branca × color =
    // a faixa sai #050409 na tela
    map: this.warningTextures[0],
    alphaTest: 0.5,
  });

  // Plano deitado no chão, centrado no pé do chefe no update. Lado do
  // plano = lado do canvas ÷ 18,7 (mesma conta das poças): 1 texel
  // continua valendo ~1 px na tela
  private readonly warning: THREE.Mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WARNING_SIDE_PX / PX_POR_UNIDADE, WARNING_SIDE_PX / PX_POR_UNIDADE),
    this.warningMaterial,
  );

  // ==========================================================================
  // Efeito: partículas sugadas na carga do Devastador (ESTILO §7)
  // ==========================================================================
  // "Partículas de lodo (#412e29, #251619) e sangue (#942c40) saem da
  // borda do círculo de aviso e são sugadas pro corpo dele, cada vez mais
  // rápido e em maior quantidade". Só a fase 'charge' faz nascer grão
  // (taxa e velocidade crescendo com o progresso da carga); fora dela, o
  // que estava voando continua e derrete no fade global da classe. A luz
  // que sobe na carga e o Símbolo da Morte no máximo são OUTROS pedaços
  // do mesmo item do doc: a luz mora no boss-view e o símbolo na sala
  // (arena-room), cada um lendo o estado por conta própria
  // ==========================================================================
  private readonly suckParticles = new SuckParticles();

  // ==========================================================================
  // Efeito: poeira do agachar da Queda (ESTILO, seção 7, "Queda (o pulo)")
  // ==========================================================================
  // "Agachar: [...] Poeira #7f78a1 sobe dos pés". Só a fase 'crouch' faz
  // nascer grão; os que já existem seguem subindo e derretem no fim da
  // vida depois que a fase acaba. FICA no "reduzir movimento": o ESTILO,
  // seção 7, só isenta tremida e piscada da tela
  // ==========================================================================
  private readonly crouchDust = new CrouchDust();

  // ==========================================================================
  // Efeito: decalques do impacto da Queda (ESTILO, seção 7, "Impacto")
  // ==========================================================================
  // "Rachadura no chão (linhas #050409 tortas saindo do ponto, gerada por
  // código) que some em 4 s. Mancha de lodo #1d0f12 que fica 6 s". Nascem
  // na ATERRISSAGEM — a transição 'air' -> 'impact' da máquina da Queda,
  // lida aqui comparando a fase do passo anterior com a atual — e ficam
  // no ponto do pulo (fall.targetX/targetZ), cruzando as fases com vida
  // própria. O anel de choque fino, as lascas e o leque de poeira nascem
  // na MESMA transição, logo abaixo
  // ==========================================================================
  private readonly crackPool = new CrackPool();
  private readonly sludgePool = new SludgePool();

  // ==========================================================================
  // Efeitos da ATERRISSAGEM da Queda: anel de choque fino, lascas de pedra
  // e leque de poeira (ESTILO §7, "Impacto")
  // ==========================================================================
  // "Anel de choque fino #eeb4c5 que cresce de 0 a 70 px em 0,3 s,
  // escurecendo pra #942c40 e sumindo. 24 lascas de pedra (2x2 px, tons da
  // pedra) voando com gravidade, quicando uma vez e sumindo. Leque de 40
  // pontos de poeira". Nascem JUNTOS na MESMA transição 'air' -> 'impact'
  // dos decalques, no PONTO da queda. Os três têm vida PRÓPRIA com
  // relógio próprio (padrão BurstRing): o anel vive 0,3 s e as lascas
  // quicam ATRAVESSANDO a fase 'stuck' — por isso os updates deles rodam
  // em TODO passo, mesmo fora da Queda (preso, pausa, dormindo, morto,
  // reset): os relógios próprios fazem tudo expirar sozinho, sem estado
  // pendurado. A luz em 2x da aterrissagem é OUTRO pedaço do mesmo item
  // do doc: mora no boss-view, lendo o estado por conta própria. FICAM no
  // "reduzir movimento": o ESTILO, seção 7, só isenta tremida e piscada
  // da tela
  // ==========================================================================
  private readonly shockRing = new ShockRing();
  private readonly shards = new Shards();
  private readonly impactDust = new ImpactDust();

  // ==========================================================================
  // Efeitos: anel de choque grosso e 60 partículas do ESTOURO (ESTILO §7)
  // ==========================================================================
  // "Anel de choque grosso (3 px) até a borda do aviso em 0,2 s. 60
  // partículas de sangue e lodo pra cima e pra fora, caindo com
  // gravidade". Nascem JUNTOS na transição 'charge' -> 'burst', no PÉ do
  // chefe parado. Os dois têm vida PRÓPRIA: o anel vive 0,2 s e os
  // 0,05 s finais já correm na fase 'exhausted'; as partículas voam até
  // tocar o chão (ou a tampa de segurança) — por isso os updates delas
  // rodam em TODO passo, mesmo fora do Devastador (pausa, dormindo,
  // morto, reset): os relógios próprios fazem os efeitos expirarem
  // sozinhos, sem estado pendurado. FICAM no "reduzir movimento": o
  // ESTILO, seção 7, só isenta tremida e piscada da tela
  // ==========================================================================
  private readonly burstRing = new BurstRing();
  private readonly burstParticles = new BurstParticles();

  // ==========================================================================
  // Efeito: faíscas do exausto do Devastador (ESTILO §7, "Exausto")
  // ==========================================================================
  // "ele fica curvado (altura 92%) e soltando faíscas devagar até se
  // recuperar". A pose curvada é do boss-view (não se mexe aqui); este é o
  // gotejar de 1 px do topo durante a fase 'exhausted'. Só a fase faz
  // nascer faísca; as que já existem seguem subindo e derretem no fade
  // global da classe quando a fase acaba — morte ou reset no meio não
  // penduram nada, porque o update roda em TODO passo. FICA no "reduzir
  // movimento": o ESTILO, seção 7, só isenta tremida e piscada da tela
  // ==========================================================================
  private readonly exhaustedSparks = new ExhaustedSparks();

  // Fase da Queda no passo ANTERIOR: é ela que detecta a transição
  // 'air' -> 'impact' UMA vez por pulo. null = fora da Queda (pausa,
  // dormindo, morto)
  private lastFallPhase: FallAttack['phase'] | null = null;

  // Fase do Devastador no passo ANTERIOR: mesma técnica do lastFallPhase,
  // detectando a transição 'charge' -> 'burst' UMA vez por estouro (a
  // máquina nunca volta de 'burst' pra 'charge' sem passar por fora).
  // null = fora do Devastador
  private lastDevastatorPhase: DevastatorAttack['phase'] | null = null;

  constructor() {
    // deita no chão, igual à sombra do chefe no boss-view; a altura vem do
    // position no update
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.visible = false;
    this.ring.renderOrder = 1;
    this.ring.visible = false;

    // aviso deitado no chão como a marca; a altura (cfg.warning.y) entra
    // pela posição no update. Começa escondido: só a CARGA do Devastador
    // acende
    this.warning.rotation.x = -Math.PI / 2;
    this.warning.visible = false;

    this.object.add(this.mark, this.ring, this.warning, this.suckParticles.object, this.crouchDust.object);
    // efeitos do Devastador (estouro e exausto): entram montados e
    // escondidos, como os decalques — cada disparo/fase só grava instante
    // e posição, nada é criado em jogo
    this.object.add(this.burstRing.object, this.burstParticles.object, this.exhaustedSparks.object);
    // decalques do impacto: entram na cena prontos e escondidos; cada
    // disparo só reposiciona e religa o slot — nada é criado em jogo
    this.object.add(this.crackPool.object, this.sludgePool.object);
    // efeitos da aterrissagem (anel fino, lascas e leque de poeira):
    // idem decalques — montados e escondidos, cada disparo só grava
    // instante e posição
    this.object.add(this.shockRing.object, this.shards.object, this.impactDust.object);
  }

  // Passo fixo: só leitura do estado do chefe. O dt agora é dos efeitos
  // com vida própria (as partículas sugadas, as faíscas do exausto, a
  // poeira do agachar, o anel e as partículas do estouro, os decalques e
  // os efeitos da aterrissagem — anel fino, lascas e leque de poeira); a
  // marca e o aviso nem o usam: o relógio de cada um é o time da PRÓPRIA
  // fase do ataque (fall.time, devastator.time) — o desenho sai sempre
  // casado com a máquina, sem cronômetro próprio pra dessincronizar (o
  // anel do estouro e os da aterrissagem são as exceções que PRECISAM de
  // relógio próprio: vivem além da fase que os disparou). Fora das fases
  // 'air' da Queda e 'charge' do Devastador (impacto, preso, estouro,
  // exausto, pausa, dormindo, morto), marca e aviso ficam invisíveis; as
  // sugadas e a poeira se apagam sozinhas no fade/fim da vida delas, e o
  // anel, as partículas do estouro e os efeitos da aterrissagem expiram
  // nos relógios próprios. O "reduzir
  // movimento" NÃO passa pra cá de propósito: marca e aviso são aviso de
  // jogabilidade (COMBATE.md: "sair da marca do chão andando"; "saia do
  // círculo"), não enfeite (ver o comentário do bloco no config.ts) — e
  // as partículas ficam, porque o ESTILO, seção 7, só isenta tremida e
  // piscada da tela
  update(dt: number, boss: Boss): void {
    // --------------------------------------------------------------------
    // Círculo de aviso do Devastador. Vem ANTES do bloco da marca de
    // propósito: a marca logo abaixo termina em early-return, e o aviso
    // precisa rodar em todo passo — só um ataque existe por vez
    // (COMBATE.md), então os dois blocos nunca disputam o mesmo passo
    // --------------------------------------------------------------------
    const devastator = boss.devastator;
    if (devastator && devastator.phase === 'charge') {
      // terço da carga (0, 1, 2) decide o degrau do dither. O clamp
      // segura o fósfogo de um time que passar da carga antes da máquina
      // trocar de fase
      const step = Math.min(
        this.warningTextures.length - 1,
        Math.floor((devastator.time / bossCfg.devastator.charge) * this.warningTextures.length),
      );
      // troca só a referência do map: as três texturas existem desde a
      // construção, nada é regenerado por passo
      this.warningMaterial.map = this.warningTextures[step];
      // o chefe fica PARADO na carga, mas a posição sai do estado a cada
      // passo mesmo assim, no padrão do arquivo
      this.warning.position.set(boss.x, cfg.warning.y, boss.z);
      this.warning.visible = true;
    } else {
      // fora da carga (estouro, exausto, pausa, dormindo, morto) não há
      // aviso. No estouro ele some pra sempre: o anel grosso e as
      // partículas da explosão moram logo abaixo
      this.warning.visible = false;
    }

    // --------------------------------------------------------------------
    // Efeitos do ESTOURO (ESTILO §7: anel grosso + 60 partículas). O
    // disparo é a transição 'charge' -> 'burst' lida AQUI, no passo fixo,
    // comparando a fase do passo anterior com a atual — mesma técnica do
    // lastFallPhase dos decalques: no passo em que ela acontece, o update
    // do chefe já rodou e a fase ATUAL já é 'burst'. Os DOIS efeitos têm
    // vida própria (o anel atravessa o começo do 'exhausted') e por isso
    // os updates rodam em TODO passo, ANTES do early-return da marca no
    // fim deste método — reset da luta ou morte no meio do estouro
    // deixam os relógios expirarem tudo sozinhos
    // --------------------------------------------------------------------
    if (devastator && this.lastDevastatorPhase === 'charge' && devastator.phase === 'burst') {
      // o chefe fica PARADO na carga e no estouro (COMBATE.md, tabela do
      // Ataque 2): a posição do disparo é o PÉ dele neste passo
      this.burstRing.spawn(boss.x, boss.z);
      this.burstParticles.spawn(boss.x, boss.z);
    }
    this.lastDevastatorPhase = devastator?.phase ?? null;
    this.burstRing.update(dt);
    this.burstParticles.update(dt);

    // Partículas sugadas da carga (ESTILO §7): mesma razão da poeira logo
    // abaixo — vida própria que roda em TODO passo, inclusive na deriva
    // pós-carga (o bloco da marca termina em early-return)
    this.suckParticles.update(dt, boss);

    // Faíscas do exausto (ESTILO §7): mesma razão das sugadas — vida
    // própria que roda em TODO passo, inclusive na deriva pós-exausto
    // (o bloco da marca termina em early-return logo abaixo)
    this.exhaustedSparks.update(dt, boss);

    // Poeira do agachar (ESTILO §7): VEM ANTES do bloco da marca, que
    // termina em early-return — a poeira tem vida própria e precisa rodar
    // em TODO passo, inclusive fora da fase 'crouch' (deriva do fim da
    // vida dos grãos que já nasceram)
    this.crouchDust.update(dt, boss);

    // --------------------------------------------------------------------
    // Decalques do impacto da Queda. Vem ANTES do bloco da marca pelo
    // MESMO motivo da poeira: o bloco da marca termina em early-return,
    // e os decalques precisam rodar em todo passo — nascem na
    // aterrissagem e seguem derretendo/durando pelo impacto, pelo preso
    // e pela pausa seguinte
    // --------------------------------------------------------------------
    const fall = boss.fall;
    const fallPhase = fall?.phase ?? null;
    // A aterrissagem é a transição 'air' -> 'impact': no passo em que ela
    // acontece, o update do chefe já rodou (main.ts chama este depois), a
    // fase ATUAL já é 'impact' e a do passo anterior ainda era 'air' —
    // então a guarda abaixo só casa uma vez por pulo (a máquina da Queda
    // nunca volta de 'impact' pra 'air')
    if (fall && this.lastFallPhase === 'air' && fallPhase === 'impact') {
      // TUDO o que a aterrissagem levanta nasce no PONTO DA QUEDA: é lá
      // que o chefe aterrissa em pé (boss.ts gruda ele no alvo travado no
      // mesmo passo). Anel fino, lascas e leque de poeira (ESTILO §7,
      // "Impacto") disparam na MESMA transição dos decalques — e o main
      // lê o fallImpactTrigger do mesmo passo pra tremida
      this.crackPool.spawn(fall.targetX, fall.targetZ);
      this.sludgePool.spawn(fall.targetX, fall.targetZ);
      this.shockRing.spawn(fall.targetX, fall.targetZ);
      this.shards.spawn(fall.targetX, fall.targetZ);
      this.impactDust.spawn(fall.targetX, fall.targetZ);
    }
    this.lastFallPhase = fallPhase;
    this.crackPool.update(dt);
    this.sludgePool.update(dt);
    // Efeitos da aterrissagem (ESTILO §7): mesma razão dos decalques —
    // vida própria que roda em TODO passo, ANTES do early-return da
    // marca no fim deste método. O anel (0,3 s) e as lascas (até a segunda
    // batida, ~1,1 s) atravessam a fase 'impact' e correm dentro do
    // 'stuck'; morte do chefe ou reset da luta logo após a aterrissagem
    // deixam os relógios expirarem tudo sozinhos
    this.shockRing.update(dt);
    this.shards.update(dt);
    this.impactDust.update(dt);

    // fora do ar da Queda não existe marca: agachar ainda não tem alvo,
    // impacto/preso já passou do aviso, e sem Queda (pausa, dormindo,
    // morto) não há o que desenhar. Meshes não são destruídos: só escondidos
    if (!fall || fall.phase !== 'air') {
      this.mark.visible = false;
      this.ring.visible = false;
      return;
    }

    // progresso do voo com o mesmo clamp e a mesma fórmula do getter
    // boss.fallJumpY: o último passo pode passar de cfg.fall.air por um
    // fósfogo do passo fixo
    const progress = Math.min(1, fall.time / bossCfg.fall.air);
    // raio cresce LINEARMENTE de growthStart (20%) até 100% do raio do
    // impacto durante o voo
    const radius = bossCfg.fall.radius * (cfg.mark.growthStart + (1 - cfg.mark.growthStart) * progress);

    // marca plantada no alvo travado, na altura acima dos decalques do chão
    this.mark.visible = true;
    this.mark.position.set(fall.targetX, cfg.mark.y, fall.targetZ);
    this.mark.scale.setScalar(radius);

    // Anel: só existe nos últimos 0,3 s do voo, alternando visível/invisível
    // a cada 0,1 s. O floor((tempo desde o começo da janela) / 0,1) conta os
    // períodos de piscada: par = visível, ímpar = invisível
    const blinkStart = bossCfg.fall.air - cfg.mark.blinkWindow;
    const inBlinkWindow = fall.time >= blinkStart;
    this.ring.visible =
      inBlinkWindow && Math.floor((fall.time - blinkStart) / cfg.mark.blinkEvery) % 2 === 0;
    this.ring.position.set(fall.targetX, cfg.mark.y, fall.targetZ);
    this.ring.scale.setScalar(radius);
  }
}
