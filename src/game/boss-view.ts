import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { characters, boss as cfg, bossEffects, death as deathCfg, lights, PX_POR_UNIDADE } from './config';
import { loadCharacterTextures, pickDirection8, type Direction8 } from './character-sprites';
import { DeathSparks } from './scene/particles';
import type { Boss, FallAttack } from './boss';

// Fatores da pose do chefe num quadro (ESTILO, seção 7): multiplicam o
// tamanho NORMAL do plano do sprite (1 = neutro, sem ataque) e tremblePx é
// a amplitude do tremor lateral, em PIXELS DE TELA (0 = parado no lugar)
interface BossPose {
  width: number;
  height: number;
  tremblePx: number;
}

// Desenho do chefe na cena 3D (ESTILO, seções 3, 4, 6, 7 e 8): billboard em
// pé com os 8 parados do PixelLab — um material só, trocando o map pela
// direção do olhar —, a origem no pé e sem rotação nenhuma, mais a sombra
// no chão, a luz vermelho-sangue, o RASTRO da Queda (3 cópias fantasma do
// sprite no voo, seção 7) e as POSES de ataque por código (seção 7:
// sem animação desenhada, achatar/esticar/tremer). Espelhamento acabou:
// as 8 direções já vêm prontas (ESTILO, seção 8), e sprite nunca é
// girado no código (seção 3)
export class BossView {
  readonly object = new THREE.Group();
  // as 8 texturas do parado, uma por direção do PixelLab
  private readonly frames: Record<Direction8, THREE.Texture>;
  // lado do plano no mundo, antes do BILLBOARD_STRETCH (o PNG é quadrado,
  // então largura e altura do plano partem do mesmo lado)
  private readonly side: number;
  // quanto a BASE do PNG fica abaixo do chão, pra a linha do pé cair em y = 0
  private readonly footOffset: number;
  private readonly sprite: THREE.Mesh;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly light: THREE.PointLight;
  // última direção desenhada: o chefe nasce olhando pra south, de frente
  // pra entrada da arena (ver boss.ts), e mantém a última quando o vetor
  // de olhar não define fatia nenhuma (pickDirection8 devolve null)
  private lastDirection: Direction8 = 'south';
  private time = 0;
  // Relógio do bob de andar (ESTILO, seção 8): conta no update quando o
  // chefe anda (boss.moving) e é lido no sync — mesmo papel do walkTime
  // do enemy-view, com bobRate/bobHeight do bloco boss do config
  private walkTime = 0;
  // Faíscas da morte (ESTILO, seção 8: sem animação desenhada). O disparo é
  // travado por sparksFired, pra explosão sair uma vez só por morte. Os
  // números vêm do config (death.bossSparks) — o DeathSparks foi
  // generalizado na Tarefa 2 da Sprint 5 pra servir também aos inimigos
  private readonly sparks = new DeathSparks(deathCfg.bossSparks);
  private sparksFired = false;

  // ==========================================================================
  // Rastro da Queda (ESTILO, seção 7, "Saída")
  // ==========================================================================
  // "Deixa um rastro de 3 cópias do sprite pelo caminho, com 30%, 20% e 10%
  // de opacidade, que somem em 0,2 s". As cópias são meshes "fantasma" com a
  // MESMA PlaneGeometry do sprite (origem no pé) e material Lambert igual
  // ao do original (ESTILO §11 proíbe MeshBasic/SpriteMaterial em sprite de
  // personagem — e cópia de personagem é personagem), um material PRÓPRIO
  // por cópia porque a opacidade é individual. No voo elas seguem o caminho
  // atrás do chefe; na aterrissagem CONGELAM e esvaem nos 0,2 s do doc
  // ==========================================================================
  private readonly ghosts: ReadonlyArray<THREE.Mesh>;
  private readonly ghostMaterials: ReadonlyArray<THREE.MeshLambertMaterial>;
  // estado das cópias: 'none' = invisíveis, 'air' = seguindo o voo,
  // 'fading' = congeladas na aterrissagem, esvaendo até 0
  private ghostState: 'none' | 'air' | 'fading' = 'none';
  // fase da Queda do PASSO ANTERIOR: o update roda todo passo fixo, então é
  // ela quem detecta a transição 'air' → 'impact' — sem cronômetro solto
  private lastFallPhase: FallAttack['phase'] | null = null;
  // Relogininho do esvaecer pós-voo: o único cronômetro próprio do rastro.
  // A máquina não conta tempo DEPOIS da aterrissagem (o fade de 0,2 s do
  // doc atravessa as fases 'impact' e 'stuck'), então ele mora aqui e bebe
  // o dt do passo fixo
  private ghostFadeTime = 0;

  // as 8 imagens já têm que estar carregadas (loadAll) quando isto é
  // criado; 'chefe' é o nome que o main registra no carregador
  // (registerCharacterSprites) — os dois lugares têm que bater
  constructor() {
    const sprites = loadCharacterTextures('chefe');
    this.frames = sprites.frames;

    // Tamanho pelo PNG (ESTILO, seção 3): lado = pngSize × scale ÷
    // PX_POR_UNIDADE. 48 × 1 ÷ 18,7 ≈ 2,57 de lado no mundo. Chefe em
    // escala 1x, do tamanho da Mulher (ESTILO §3): cada texel vira 1 px
    // na tela, como nos outros três personagens
    const char = characters.chefe;
    this.side = (char.pngSize * char.scale) / PX_POR_UNIDADE;

    // Pé na linha certa (ESTILO, seção 3): a linha footLine do PNG (46 de
    // 48, 1 px acima da borda de baixo) é que fica em y = 0. O plano nasce
    // com a BASE do PNG em y = 0, então a base desce o que sobra embaixo
    // da linha do pé — 1 px do PNG, que em 1x é 1 px na tela abaixo do
    // chão. A linha é fixa por personagem (não por direção): sem isso,
    // virar fazia o boneco pular 1 px, porque cada direção deixa os pés
    // num ponto um pouco diferente do PNG
    this.footOffset = -((char.pngSize - 1 - char.footLine) / char.pngSize) * this.side * BILLBOARD_STRETCH;

    // Plano de 1x1 com a origem no pé (embaixo, no meio), igual ao do
    // protagonista: o tamanho real vem do scale. Lambert pra receber a luz da
    // cena (o vermelho dele é luz de verdade, ESTILO seção 4); alphaTest
    // recorta o fundo transparente e mantém a profundidade certa, então
    // quem fica na frente é resolvido pelo 3D. O map nasce em south, a
    // direção do nascimento (ver boss.ts)
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    this.material = new THREE.MeshLambertMaterial({
      map: this.frames.south,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.sprite = new THREE.Mesh(geometry, this.material);

    // Rastro da Queda (ESTILO §7, "Saída"): 3 cópias do sprite, MESMA
    // geometria (plano com origem no pé). Material Lambert com map e
    // DoubleSide como o original, mas PRÓPRIO por cópia — a opacidade é
    // individual (30%, 20%, 10%). transparent + depthWrite desligados pro
    // blend não entupir o buffer de profundidade. E alphaTest BAIXO
    // (0,05, não o 0,5 do original): o teste compara o alpha FINAL
    // (map × opacity) — com 0,5 e opacity 0,1, TODO pixel do corpo
    // (1 × 0,1) morria no descarte e o fantasma nem aparecia
    this.ghostMaterials = bossEffects.trail.opacities.map(
      (opacity) =>
        new THREE.MeshLambertMaterial({
          map: this.frames.south,
          side: THREE.DoubleSide,
          transparent: true,
          opacity,
          depthWrite: false,
          alphaTest: 0.05,
        }),
    );
    this.ghosts = this.ghostMaterials.map((material) => {
      const ghost = new THREE.Mesh(geometry, material);
      // Tamanho NEUTRO pra sempre: a cópia é a lembrança apagada do
      // caminho, não uma encenação — a janela de 0,1 s do esticado de
      // saída é pose do sprite VIVO, e fantasma não faz pose
      ghost.scale.set(this.side, this.side * BILLBOARD_STRETCH, 1);
      ghost.visible = false;
      return ghost;
    });

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(cfg.shadow.radius, 24),
      new THREE.MeshBasicMaterial({
        color: cfg.shadow.color,
        transparent: true,
        opacity: cfg.shadow.opacity,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    // Dormindo, a luz já nasce apagada; o pulso e o acordar são do update
    const lightCfg = lights.boss;
    this.light = new THREE.PointLight(lightCfg.color, lightCfg.sleepIntensity, lightCfg.distance, lightCfg.decay);

    this.object.add(this.sprite, ...this.ghosts, this.shadow, this.light, this.sparks.object);
  }

  // Passo fixo: a luz do chefe (ESTILO, seção 6) e as faíscas da morte.
  // A luz só existe ACORDADA, pulsando em seno de ±25%; dormindo ou morto
  // fica apagada — assim o reset da luta e a morte apagam sozinhos, só pela
  // leitura do estado. O acordar é igualmente só leitura: quem muda o
  // estado é o boss.ts
  update(dt: number, boss: Boss, reducedMotion: boolean): void {
    // Relógio geral do view: alimenta o pulso da luz e o LADO do tremor
    // das poses (que alterna por fatia deste tempo no sync)
    this.time += dt;
    const lightCfg = lights.boss;
    const pulse = reducedMotion ? 0 : Math.sin(this.time * lightCfg.pulseSpeed) * lightCfg.pulseFraction;
    this.light.intensity = boss.state === 'awake' ? lightCfg.intensity * (1 + pulse) : lightCfg.sleepIntensity;
    // lido do config a cada passo, pra dar pra calibrar mexendo só lá
    this.light.distance = lightCfg.distance;
    this.light.decay = lightCfg.decay;

    // Morte (ESTILO, seção 8): ao ler a virada pra 'dead', o corpo se desfaz
    // em faíscas — um disparo só, do centro pra fora e pra cima. Elas rolam
    // mesmo com "reduzir movimento": são o único aviso visual da morte
    // (poeira e brasas são ambiente e podem parar; isto não). O reset da
    // luta (morte do jogador) rearma o disparo
    if (boss.state === 'dead' && !this.sparksFired) {
      this.sparksFired = true;
      this.sparks.burst(boss.x, boss.z);
    } else if (boss.state !== 'dead') {
      this.sparksFired = false;
    }
    this.sparks.update(dt);

    // Relógio do bob (ESTILO §8: o sprite parado sobe e desce 1 px a cada
    // passo quando anda): conta no passo fixo, como o walkTime dos
    // inimigos. Parado — dormindo, atacando, morto — zera, pro bob sempre
    // nascer do chão (um reset não pode herdar relógio no meio do passo)
    if (boss.moving) {
      this.walkTime += dt;
    } else {
      this.walkTime = 0;
    }

    // --- Rastro da Queda (ESTILO §7, "Saída") ---
    // A transição do fim do voo é lida AQUI, no passo fixo, comparando a
    // fase atual com a do passo anterior: quem congela as cópias é a
    // TROCA de fase da máquina, sem cronômetro solto
    const fallPhase = boss.fall?.phase ?? null;
    if (this.lastFallPhase === 'air' && fallPhase !== 'air') {
      if (fallPhase === 'impact') {
        // aterrissou: as cópias CONGELAM onde o último sync as deixou (o
        // sync do 'fading' só mexe na opacidade) e esvaem até 0
        this.ghostState = 'fading';
        this.ghostFadeTime = 0;
      } else {
        // a Queda sumiu SEM impacto (chefe morto no ar, reset da luta):
        // fantasma de luta que acabou não derrete — some na hora
        this.ghostState = 'none';
      }
    } else if (fallPhase === 'air') {
      this.ghostState = 'air';
    }
    if (this.ghostState === 'fading') {
      this.ghostFadeTime += dt;
      if (this.ghostFadeTime >= bossEffects.trail.fadeOut) {
        this.ghostState = 'none';
      }
    }
    this.lastFallPhase = fallPhase;
  }

  // Pose do sprite pela fase do ataque em curso (ESTILO, seção 7: sem
  // animação desenhada, a pose vem do código — achatar, esticar, tremer).
  // Só LEITURA da máquina (boss.fall / boss.devastator): o tempo dentro da
  // fase já é o relógio da pose, nada de cronômetro no view. Fora dos
  // ataques devolve o neutro (1, 1, 0) e o desenho fica como sempre.
  // Queda e Devastador nunca coexistem (a máquina garante), então um
  // if/else por ataque resolve a precedência. As poses ficam também com
  // "reduzir movimento": o ESTILO §7 só isenta tremida e piscada da tela
  private computePose(boss: Boss): BossPose {
    const poses = bossEffects.poses;
    // neutro por padrão: cada fase só muda o que o doc pede
    let width = 1;
    let height = 1;
    let tremblePx = 0;

    const fall = boss.fall;
    const devastator = boss.devastator;
    if (fall) {
      if (fall.phase === 'crouch') {
        // Agachar (a fase inteira): "achata (altura 85%, largura 110%,
        // sempre com o pé no chão) e treme 1 px pros lados"
        height = poses.crouch.height;
        width = poses.crouch.width;
        tremblePx = poses.crouch.tremblePx;
      } else if (fall.phase === 'air' && fall.time < poses.takeoff.duration) {
        // Saída: "estica (altura 115%, largura 90%) por 0,1 s e volta ao
        // normal no ar" — só os primeiros 0,1 s do voo; o resto do 'air'
        // cai no neutro
        height = poses.takeoff.height;
        width = poses.takeoff.width;
      } else if (fall.phase === 'impact') {
        // Impacto: "achata a 70% de altura por 0,1 s e volta" — a fase
        // dura exatamente os 0,1 s, o fator vale por ela inteira e o
        // 'stuck' volta ao normal sozinho
        height = poses.impact.height;
      }
    } else if (devastator) {
      if (devastator.phase === 'charge') {
        // Carga: tamanho normal, "o tremor do sprite cresce de 0 a 2 px"
        // LINEARMENTE com o progresso. Amplitude em px INTEIRO de tela
        // (arredondado). Clamp no 1: o último passo da fase pode passar
        // da carga por um fósfogo do passo fixo (mesma conta do
        // boss-effects no dither do aviso)
        const progress = Math.min(1, devastator.time / cfg.devastator.charge);
        tremblePx = Math.round(progress * poses.charge.trembleMaxPx);
      } else if (devastator.phase === 'exhausted') {
        // Exausto: "ele fica curvado (altura 92%)" — só a altura, largura
        // normal (as faíscas devagar são outro efeito, outra tarefa). O
        // 'burst' não tem pose no doc e cai no neutro
        height = poses.exhausted.height;
      }
    }

    return { width, height, tremblePx };
  }

  // Uma vez por quadro desenhado: posição, tamanho e pose no mundo
  sync(boss: Boss): void {
    // Morto, o corpo some junto com a sombra — as faíscas tomam o lugar
    // (ESTILO, seção 8). O billboard e a sombra voltam visíveis no reset
    this.sprite.visible = boss.state !== 'dead';
    this.shadow.visible = boss.state !== 'dead';

    // Direção pela fatia de 45° do vetor de olhar (ESTILO, seção 8); vetor
    // nulo mantém a última usada. Nada de espelhar: as 8 direções vêm do
    // PixelLab — o chefe nasce em south, trava a mira no meio do ataque e
    // dormindo/morto mantém o último olhar (tudo no boss.ts)
    const direction = pickDirection8(boss.lookX, boss.lookZ) ?? this.lastDirection;
    this.lastDirection = direction;
    this.material.map = this.frames[direction];

    // Em pé e esticado na altura (engine/billboard.ts): PNG quadrado, então
    // scale.x = lado e scale.y = lado × stretch — o tamanho na tela sai
    // todo do PNG (ESTILO, seção 3). A POSE multiplica os fatores (1 =
    // tamanho de sempre). Sprite nunca é girado no código (seção 3):
    // pose é só scale e position
    const pose = this.computePose(boss);
    this.sprite.scale.set(
      this.side * pose.width,
      this.side * BILLBOARD_STRETCH * pose.height,
      1,
    );

    // Tremor lateral da pose ("treme N px pros lados", ESTILO §7):
    // PIXELS DE TELA convertidos pro x do MUNDO. O lado alterna +1/−1 a
    // cada 1/trembleHz segundos, derivado do this.time do view — sem rng
    // e sem cronômetro próprio (o tempo da fase já é o relógio da pose).
    // Aqui NÃO entra o BILLBOARD_STRETCH: ele compensa o achatamento
    // VERTICAL da câmera e só mora no scale.y — deslocamento lateral é
    // 1/18,7 de unidade por px de tela, direto (PX_POR_UNIDADE). Entra
    // SÓ no sprite: sombra, luz e faíscas ficam onde estão
    const trembleSide = Math.floor(this.time * bossEffects.poses.trembleHz) % 2 === 0 ? 1 : -1;
    const trembleX = (trembleSide * pose.tremblePx) / PX_POR_UNIDADE;
    // Bob de andar (ESTILO §8): mesma fórmula dos inimigos — 1 px a cada
    // passo (bobRate trocas por segundo), multiplicado por
    // BILLBOARD_STRETCH pra renderizar 1 px inteiro na tela. Fora do
    // andar o walkTime zerou no update e o bob é 0
    const bob =
      (Math.floor(this.walkTime * cfg.bobRate) % 2) *
      cfg.bobHeight *
      BILLBOARD_STRETCH;
    // PÉ NO CHÃO na pose (ESTILO §7: "sempre com o pé no chão"): o PNG
    // tem sobra embaixo da linha do pé, compensada pelo footOffset
    // (negativo, pré-calculado no construtor). Quando a altura da pose
    // muda, a sobra escala junto — o footOffset entra multiplicado pelo
    // fator de altura, senão o agachado flutua e o esticado afunda o pé
    // pra dentro do chão. No ar, o sprite ainda sobe pelo arco
    // (boss.fallJumpY). ATENÇÃO À MATEMÁTICA: fallJumpY é altura REAL do
    // mundo, em unidades (o COMBATE.md diz "subindo até 2 unidades"), e
    // entra DIRETO no y, SEM multiplicar por BILLBOARD_STRETCH — o
    // stretch compensa o achatamento da CÂMERA e já mora no scale do
    // sprite; somar altura real a ele dobraria a compensação. Diferente
    // do bob de 1 px, que é deslocamento de PIXEL DE TELA e por isso
    // multiplica (o mesmo achatamento da câmera faz 1/18,7 un de altura
    // renderizar menos de 1 px). Fora do ar, fallJumpY é 0 e nada muda
    this.sprite.position.set(
      boss.x + trembleX,
      this.footOffset * pose.height + bob + boss.fallJumpY,
      boss.z,
    );

    // A sombra NÃO sobe junto (ESTILO, seção 7: "No ar: a sombra fica no
    // chão embaixo dele"): continua em y 0.01, seguindo só o x/z do pé
    this.shadow.position.set(boss.x, 0.01, boss.z);

    // Luz no meio do corpo (ESTILO, seção 6): também fica como está no ar
    // — altura fixa, acompanhando só o x/z (o doc não manda subir)
    this.light.position.set(boss.x, lights.boss.height, boss.z);

    // Flash de dano (ESTILO, seção 8: sprite branco #f5effd por 2 frames de
    // jogo). Lambert tem emissive: branco no emissive sai por cima da textura,
    // sem mexer no map nem no color base. Zerado o tempo, volta ao preto —
    // mesmo padrão do player-view
    this.material.emissive.set(boss.hurtFlashTime > 0 ? '#f5effd' : '#000000');

    // --- Rastro da Queda (ESTILO §7, "Saída"): as cópias do sprite no voo ---
    const trail = bossEffects.trail;
    if (this.ghostState === 'air' && boss.fall) {
      const fall = boss.fall;
      // MESMO clamp do voo (boss.ts): o último passo pode passar de
      // cfg.fall.air por um fósfogo do passo fixo
      const progress = Math.min(1, fall.time / cfg.fall.air);
      for (let i = 0; i < this.ghosts.length; i++) {
        // cópia i fica NO caminho, ATRÁS do chefe, (i+1)·spacing "segundos
        // de voo" antes dele — a fórmula do voo avaliada no progresso da
        // cópia (max(0,·) segura o comecinho, quando a cópia ainda não
        // saiu da origem)
        const p = Math.max(0, progress - (i + 1) * trail.spacing);
        this.ghosts[i].position.set(
          fall.originX + (fall.targetX - fall.originX) * p,
          // MESMA conta da altura do sprite no ar (getter fallJumpY):
          // footOffset puro (tamanho neutro, sem pose) + arco senoidal
          // avaliado no ponto da cópia
          this.footOffset + cfg.fall.jumpHeight * Math.sin(Math.PI * p),
          fall.originZ + (fall.targetZ - fall.originZ) * p,
        );
        // cópia do sprite: o MESMO frame de direção que o material
        // principal recebeu lá em cima, NESTE sync
        this.ghostMaterials[i].map = this.material.map;
        this.ghostMaterials[i].opacity = trail.opacities[i];
        this.ghosts[i].visible = true;
      }
    } else if (this.ghostState === 'fading') {
      // congeladas na aterrissagem: nem posição, nem map, nem tamanho —
      // só a opacidade derrete em linha reta até 0, cada cópia a partir
      // da opacidade dela (30/20/10%)
      const fade = 1 - this.ghostFadeTime / trail.fadeOut;
      for (let i = 0; i < this.ghosts.length; i++) {
        this.ghostMaterials[i].opacity = trail.opacities[i] * fade;
        this.ghosts[i].visible = true;
      }
    } else {
      // fora do voo (e do esvaecer): invisíveis
      for (const ghost of this.ghosts) ghost.visible = false;
    }
  }
}
