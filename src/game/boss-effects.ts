import * as THREE from 'three';
import { boss as bossCfg, bossEffects as cfg, PX_POR_UNIDADE } from './config';
import { canvasTexture, pixel } from '../engine/textures';
import { createRng, int, range, type Rng } from '../engine/random';
import type { Boss, FallAttack } from './boss';
// crookedPath (polilinha torta) e puddleTexture (blob com miolo e borda)
// são as peças do kit.ts (CENA3D, "linhas tortas" e poças) — reutilizadas
// aqui por trás dos decalques do impacto, sem duplicar o código delas
import { crookedPath, puddleTexture } from './scene/kit';

// Anel unitário da marca (raio 1, 48 pontos no plano do chão, centrado na
// origem): o raio real entra pelo scale do LineLoop a cada passo. Fica
// fora da classe como o circleLine do debug.ts — só montagem de geometria
function buildUnitRing(color: string): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
  }
  // LineBasicMaterial = linha fina de 1 px, o "anel fino" da borda
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false }),
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

// Efeitos visuais dos ataques do chefe (ESTILO, seção 7, "Efeitos do
// chefe"): a camada de DESENHO dos ataques, lendo o estado que a máquina
// no boss.ts produz a cada passo fixo — mesma separação do boss.ts /
// boss-view.ts (nada de three.js na lógica, nada de regra de jogo aqui).
// Hoje a marca da queda, o círculo de aviso do Devastador, a poeira do
// agachar e os decalques do impacto (rachadura e mancha de lodo); os
// outros efeitos da Sprint 9 (anel de choque, lascas, poeira do
// impacto...) entram neste arquivo, cada um na sua seção, com os números
// no bloco bossEffects do config.ts.
export class BossEffects {
  readonly object = new THREE.Group();

  // ==========================================================================
  // Efeito: marca da queda (ESTILO, seção 7, "Queda (o pulo)")
  // ==========================================================================
  // "No alvo aparece a marca da queda: círculo #050409 que cresce de 20% a
  // 100% do raio do impacto durante o voo, com um anel #942c40 na borda que
  // pisca a cada 0,1 s nos últimos 0,3 s". Visível SÓ na fase 'air', no
  // alvo travado no fim do agachar (fall.targetX/targetZ) — na aterrissagem
  // (fase 'impact') a marca já cumpriu o aviso e some: o anel de choque e
  // as lascas do impacto são outro efeito, de outra tarefa
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
  // (outra tarefa) expande "até a borda do aviso", e a borda em si não
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
  // própria. O anel de choque, as lascas e a poeira do impacto são OUTRO
  // efeito, de outra tarefa
  // ==========================================================================
  private readonly crackPool = new CrackPool();
  private readonly sludgePool = new SludgePool();

  // Fase da Queda no passo ANTERIOR: é ela que detecta a transição
  // 'air' -> 'impact' UMA vez por pulo. null = fora da Queda (pausa,
  // dormindo, morto)
  private lastFallPhase: FallAttack['phase'] | null = null;

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

    this.object.add(this.mark, this.ring, this.warning, this.crouchDust.object);
    // decalques do impacto: entram na cena prontos e escondidos; cada
    // disparo só reposiciona e religa o slot — nada é criado em jogo
    this.object.add(this.crackPool.object, this.sludgePool.object);
  }

  // Passo fixo: só leitura do estado do chefe. O dt agora é dos efeitos
  // com vida própria (a poeira do agachar e os decalques do impacto); a
  // marca e o aviso nem o usam: o relógio de cada um é o time da PRÓPRIA
  // fase do ataque (fall.time, devastator.time) — o desenho sai sempre
  // casado com a máquina, sem cronômetro próprio pra dessincronizar.
  // Fora das fases 'air' da Queda e 'charge' do Devastador (impacto,
  // preso, estouro, exausto, pausa, dormindo, morto), marca e aviso ficam
  // invisíveis; a poeira se apaga sozinha no fim da vida dela. O
  // "reduzir movimento" NÃO passa pra cá de propósito: marca e aviso são
  // aviso de jogabilidade (COMBATE.md: "sair da marca do chão andando";
  // "saia do círculo"), não enfeite (ver o comentário do bloco no
  // config.ts) — e a poeira fica, porque o ESTILO, seção 7, só isenta
  // tremida e piscada da tela
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
      // aviso. No estouro ele some pra sempre: a explosão em si é outro
      // efeito, de outra tarefa
      this.warning.visible = false;
    }

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
    // então o casal abaixo só casa uma vez por pulo (a máquina da Queda
    // nunca volta de 'impact' pra 'air')
    if (fall && this.lastFallPhase === 'air' && fallPhase === 'impact') {
      // decalques no PONTO DA QUEDA: é lá que o chefe aterrissa em pé
      // (boss.ts gruda ele no alvo travado no mesmo passo)
      this.crackPool.spawn(fall.targetX, fall.targetZ);
      this.sludgePool.spawn(fall.targetX, fall.targetZ);
    }
    this.lastFallPhase = fallPhase;
    this.crackPool.update(dt);
    this.sludgePool.update(dt);

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
