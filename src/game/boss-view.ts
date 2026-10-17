import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { characters, boss as cfg, death as deathCfg, lights, PX_POR_UNIDADE } from './config';
import { loadCharacterTextures, pickDirection8, type Direction8 } from './character-sprites';
import { DeathSparks } from './scene/particles';
import type { Boss } from './boss';

// Desenho do chefe na cena 3D (ESTILO, seções 3, 4, 6 e 8): billboard em pé
// com os 8 parados do PixelLab — um material só, trocando o map pela direção
// do olhar —, a origem no pé e sem rotação nenhuma, mais a sombra no chão e a
// luz vermelho-sangue. Espelhamento acabou: as 8 direções já vêm prontas
// (ESTILO, seção 8), e sprite nunca é girado no código (seção 3)
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

    this.object.add(this.sprite, this.shadow, this.light, this.sparks.object);
  }

  // Passo fixo: a luz do chefe (ESTILO, seção 6) e as faíscas da morte.
  // A luz só existe ACORDADA, pulsando em seno de ±25%; dormindo ou morto
  // fica apagada — assim o reset da luta e a morte apagam sozinhos, só pela
  // leitura do estado. O acordar é igualmente só leitura: quem muda o
  // estado é o boss.ts
  update(dt: number, boss: Boss, reducedMotion: boolean): void {
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
  }

  // Uma vez por quadro desenhado: posição e tamanho no mundo
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
    // todo do PNG (ESTILO, seção 3). Sprite nunca é girado. As poses do
    // Devastador (achatar/esticar da ESTILO, seção 7) são tarefa futura
    this.sprite.scale.set(this.side, this.side * BILLBOARD_STRETCH, 1);
    // Bob de andar (ESTILO §8): mesma fórmula dos inimigos — 1 px a cada
    // passo (bobRate trocas por segundo), multiplicado por
    // BILLBOARD_STRETCH pra renderizar 1 px inteiro na tela. Fora do
    // andar o walkTime zerou no update e o bob é 0
    const bob =
      (Math.floor(this.walkTime * cfg.bobRate) % 2) *
      cfg.bobHeight *
      BILLBOARD_STRETCH;
    // MÍNIMO visual da Queda (as poses de agachar/impacto vêm em tarefa
    // futura): no ar, o sprite sobe pelo arco (boss.fallJumpY). ATENÇÃO À
    // MATEMÁTICA: fallJumpY é altura REAL do mundo, em unidades (o
    // COMBATE.md diz "subindo até 2 unidades"), e entra DIRETO no y, SEM
    // multiplicar por BILLBOARD_STRETCH — o stretch compensa o
    // achatamento da CÂMERA e já mora no scale do sprite; somar altura
    // real a ele dobraria a compensação. Diferente do bob de 1 px, que é
    // deslocamento de PIXEL DE TELA e por isso multiplica (o mesmo
    // achatamento da câmera faz 1/18,7 un de altura renderizar menos de
    // 1 px). Fora do ar, fallJumpY é 0 e nada muda
    this.sprite.position.set(boss.x, this.footOffset + bob + boss.fallJumpY, boss.z);

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
  }
}
