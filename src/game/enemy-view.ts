import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { createRng, range, type Rng } from '../engine/random';
import { characters, death as deathCfg, enemies as cfg, PX_POR_UNIDADE } from './config';
import { loadCharacterTextures, pickDirection8, type CharacterTextures, type Direction8 } from './character-sprites';
import { DeathSparks } from './scene/particles';
import type { Enemy, EnemyKind } from './enemies';

// Mesma folga das comparações de tempo do player.ts/boss.ts
const TIME_EPSILON = 1e-6;

// Altura da sombra: a mesma do player-view. A sala 1 não tem anéis de
// círculo nem raízes decorativas pra brigar com ela (o chefe usa 0,01 por
// isso), então 0,03 basta
const SHADOW_Y = 0.03;

// Um visual por inimigo: billboard com a textura, a sombra deitada e as
// faíscas da morte. O cronômetro, o valor sorteado e o RNG da oscilação de
// opacidade (ESTILO, seção 8, "forma plasmática inconsistente") moram AQUI
// no view: é efeito puramente visual, e a lógica do enemies.ts não sabe
// que ele existe — idem pras faíscas, disparadas só lendo o estado
interface EnemyVisual {
  enemy: Enemy;
  sprite: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  shadow: THREE.Mesh;
  // Faíscas da morte (ASSETS.md: "some em faíscas no código"). O disparo é
  // travado por sparksFired, uma explosão por morte; voltar a 'alive' (o
  // reset da Tarefa 4) rearma — mesmo padrão do boss-view
  sparks: DeathSparks;
  sparksFired: boolean;
  // Oscilação de opacidade (ESTILO 8, "forma plasmática inconsistente"):
  // só o Perturbado — a mulher é matéria, não plasma, e fica opaca
  oscillates: boolean;
  opacityTime: number;
  opacityValue: number;
  // RNG próprio de desenho, semeado por índice: o sorteio do 60–80% sai
  // igual entre testes, padrão da cena e das texturas
  opacityRng: Rng;
  // Arte do PixelLab (Sprint 8): as 8 direções do tipo dele (o map do
  // material troca pela que o olhar pedir), o rebaixo que põe a linha do
  // pé em y = 0, o relógio do bob e a última direção desenhada (fallback
  // se o vetor de olhar vier nulo) — mesmos papéis do PlayerView
  frames: Record<Direction8, THREE.Texture>;
  footOffset: number;
  bobRate: number;
  bobHeight: number;
  walkTime: number;
  lastDirection: Direction8;
}

// Desenho dos inimigos comuns na cena 3D (ESTILO, seções 3, 4 e 8). Mesma
// receita do player-view/boss-view: plano 1x1 com a origem no pé, Lambert
// com alphaTest pra receber a luz da cena, sombra deitada. Os 8 parados do
// PixelLab viram pela fatia de 45° do olhar, sem espelhar (seção 8); Morto:
// sprite e sombra se escondem e as faíscas tomam o lugar, como no boss-view
export class EnemiesView {
  readonly object = new THREE.Group();
  private readonly visuals: EnemyVisual[] = [];

  constructor(enemies: Enemy[]) {
    // Sprites do PixelLab (Sprint 8), registrados no main.ts como
    // 'perturbado' e 'mulher': as 8 direções são carregadas UMA vez por
    // tipo e compartilhadas pelos bichos iguais — o MATERIAL é um por
    // inimigo, porque o map troca pela direção que CADA um olha. Visual
    // por tipo: personagem da tabela (ESTILO, seção 3), bob, sombra e se a
    // opacidade oscila. Os números moram no config; aqui só se escolhe
    // qual é de quem
    const kinds: Record<
      EnemyKind,
      {
        sprites: CharacterTextures;
        // pngSize/scale/footLine da tabela da ESTILO, seção 3
        char: { pngSize: number; scale: number; footLine: number };
        bobRate: number;
        bobHeight: number;
        shadow: { radius: number; opacity: number; color: string };
        oscillates: boolean;
      }
    > = {
      perturbado: {
        sprites: loadCharacterTextures('perturbado'),
        char: characters.perturbado,
        bobRate: cfg.perturbado.bobRate,
        bobHeight: cfg.perturbado.bobHeight,
        shadow: cfg.perturbado.shadow,
        oscillates: true,
      },
      mulher: {
        sprites: loadCharacterTextures('mulher'),
        char: characters.mulher,
        bobRate: cfg.mulher.bobRate,
        bobHeight: cfg.mulher.bobHeight,
        shadow: cfg.mulher.shadow,
        oscillates: false,
      },
    };

    enemies.forEach((enemy, index) => {
      const kind = kinds[enemy.kind];
      const char = kind.char;

      // Tamanho pelo PNG (ESTILO, seção 3): lado = pngSize × scale ÷
      // PX_POR_UNIDADE. 32 × 1 ÷ 18,7 ≈ 1,71 no perturbado; 48 × 1 ÷
      // 18,7 ≈ 2,57 na mulher. O PNG é quadrado, então largura e altura
      // do plano partem do mesmo lado
      const side = (char.pngSize * char.scale) / PX_POR_UNIDADE;

      // Pé na linha certa (ESTILO, seção 3): a linha footLine do PNG (29
      // no perturbado, 46 na mulher) é que fica em y = 0 no mundo. O plano
      // nasce com a BASE do PNG em y = 0, então a base desce o que sobra
      // embaixo da linha do pé (2 px no perturbado, 1 px na mulher). A
      // linha é fixa por personagem (não por direção): sem isso, virar
      // fazia o boneco pular 1 px, porque cada direção deixa os pés num
      // ponto um pouco diferente do PNG
      const footOffset = -((char.pngSize - 1 - char.footLine) / char.pngSize) * side * BILLBOARD_STRETCH;

      // Plano 1x1 com a origem no pé (embaixo, no meio): o tamanho real
      // vem do lado. Lambert pra receber a luz da cena; alphaTest recorta
      // o fundo transparente e mantém a profundidade certa, então quem
      // fica na frente é resolvido pelo 3D (ESTILO, seção 4).
      // transparent: true só em quem oscila (a opacidade animada do
      // Perturbado); na mulher o alphaTest basta
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.translate(0, 0.5, 0);
      const material = new THREE.MeshLambertMaterial({
        map: kind.sprites.frames.north,
        alphaTest: 0.5,
        transparent: kind.oscillates,
        side: THREE.DoubleSide,
      });
      const sprite = new THREE.Mesh(geometry, material);
      // Em pé e esticado na altura (engine/billboard.ts), nunca girado
      sprite.scale.set(side, side * BILLBOARD_STRETCH, 1);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(kind.shadow.radius, 16),
        new THREE.MeshBasicMaterial({
          color: kind.shadow.color,
          transparent: true,
          opacity: kind.shadow.opacity,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;

      // Faíscas com os números do config (death.enemySparks), menos a
      // originHeight: essa é o miolo do boneco NOVO e sai da conta do
      // footLine — do pé (y = 0) ao TOPO do PNG cabem footLine + 1 linhas
      // (30 de 32 no perturbado, 47 de 48 na mulher), e o miolo é a
      // metade: perturbado (1,71 × 30/32)/2 ≈ 0,80; mulher
      // (2,57 × 47/48)/2 ≈ 1,26. A semente é por índice, senão dois
      // mortos no mesmo golpe iam soltar explosões gêmeas lado a lado
      const originHeight = (side * (char.footLine + 1) / char.pngSize) / 2;
      const sparks = new DeathSparks(
        { ...deathCfg.enemySparks, originHeight },
        0xfa1c + index,
      );

      this.object.add(sprite, shadow, sparks.object);

      const op = cfg.perturbado.opacity;
      const opacityRng = createRng(0x50ed + index);
      this.visuals.push({
        enemy,
        sprite,
        material,
        shadow,
        sparks,
        sparksFired: false,
        oscillates: kind.oscillates,
        // Fase e valor iniciais sorteados: sem isso os Perturbados da sala
        // piscariam todos juntos no arranque e a oscilação leria errado.
        // Quem não oscila fica opaco pra sempre (valor 1 lido no sync)
        opacityTime: range(opacityRng, 0, op.changeEvery),
        opacityValue: kind.oscillates ? range(opacityRng, op.min, op.max) : 1,
        opacityRng,
        frames: kind.sprites.frames,
        footOffset,
        bobRate: kind.bobRate,
        bobHeight: kind.bobHeight,
        // Relógio do bob: conta só no update, andando e vivo
        walkTime: 0,
        // Fallback da direção até o primeiro sync resolver o olhar —
        // mesmo padrão do player-view
        lastDirection: 'north',
      });
    });
  }

  // Passo fixo: os cronômetros da oscilação de opacidade, o relógio do bob
  // e as faíscas da morte (efeito puramente visual; a lógica — andar,
  // perseguir, machucar, morrer — mora no enemies.ts). Mesmo desenho do
  // BossView: update no passo, sync no frame. A flag de movimento reduzido
  // entra na assinatura por paridade com o BossView mas aqui é IGNORADA de
  // propósito — DÚVIDA DO DOC, decidida: o ESTILO se cala sobre inimigos, e
  // tanto a oscilação quanto as faíscas SÃO a leitura do bicho (vivo e
  // morto), como as faíscas da morte do chefe rolam mesmo reduzidas; quem
  // desliga são só as pulsações decorativas
  update(dt: number, _reducedMotion: boolean): void {
    const op = cfg.perturbado.opacity;
    for (const visual of this.visuals) {
      // Só o Perturbado pisca (ESTILO 8); a mulher não oscila
      if (visual.oscillates) {
        visual.opacityTime += dt;
        if (visual.opacityTime >= op.changeEvery - TIME_EPSILON) {
          visual.opacityTime = 0;
          visual.opacityValue = range(visual.opacityRng, op.min, op.max);
        }
      }

      // Relógio do bob (ESTILO 8: o sprite parado sobe e desce 1 px a cada
      // passo): anda no passo fixo, como o walkTime do player. Vivo e
      // andando conta; parado zera, pro bob sempre nascer do chão; morto
      // também zera — o sprite já sumiu, e um revivido (reset da Tarefa 4)
      // não pode herdar relógio parado no meio do passo
      if (visual.enemy.state === 'alive' && visual.enemy.moving) {
        visual.walkTime += dt;
      } else {
        visual.walkTime = 0;
      }

      // Faíscas da morte: ao ler a virada alive→dead, UM disparo do miolo
      // do corpo (o sprite e a sombra já se escondem no sync). O update
      // corre SEMPRE, morto ou vivo: a nuvem tem que terminar de apagar
      // depois do sprite sumir. Voltando a 'alive' (reset da Tarefa 4) o
      // disparo rearma — o padrão é o do boss-view
      if (visual.enemy.state === 'dead' && !visual.sparksFired) {
        visual.sparksFired = true;
        visual.sparks.burst(visual.enemy.x, visual.enemy.z);
      } else if (visual.enemy.state !== 'dead') {
        visual.sparksFired = false;
      }
      visual.sparks.update(dt);
    }
  }

  // Uma vez por quadro desenhado: posição, direção, bob, flash e opacidade
  sync(): void {
    for (const visual of this.visuals) {
      const enemy = visual.enemy;
      const alive = enemy.state === 'alive';
      // Morto: sprite e sombra se escondem e as faíscas (disparadas no
      // update) tomam o lugar — a mesma virada pra 'dead' do boss-view.
      // O reset (Tarefa 4) os devolve visíveis sozinho, porque isto só
      // lê o estado
      visual.sprite.visible = alive;
      visual.shadow.visible = alive;
      if (!alive) continue;

      // Direção pela fatia de 45° do vetor de olhar (ESTILO, seção 8);
      // vetor nulo mantém a última usada. Nada de espelhar: as 8 já vêm
      // prontas do PixelLab, só o map do material troca
      const direction = pickDirection8(enemy.lookX, enemy.lookZ) ?? visual.lastDirection;
      visual.lastDirection = direction;
      visual.material.map = visual.frames[direction];

      // Andando em qualquer direção, o sprite parado sobe e desce 1 px a
      // cada passo (ESTILO, seção 8: não existe animação de andar);
      // parado, o walkTime zerou no update e o bob é 0. bobHeight ×
      // BILLBOARD_STRETCH pra o 1 px renderizar inteiro na tela — mesma
      // fórmula do player
      const bob =
        (Math.floor(visual.walkTime * visual.bobRate) % 2) *
        visual.bobHeight *
        BILLBOARD_STRETCH;

      // A base do PNG fica footOffset abaixo do chão, pra a linha do pé
      // cair em y = 0 (conta do construtor); o bob entra em cima
      visual.sprite.position.set(enemy.x, visual.footOffset + bob, enemy.z);
      visual.shadow.position.set(enemy.x, SHADOW_Y, enemy.z);

      // Flash de dano (ESTILO, seção 8: sprite branco #f5effd por 2 frames
      // de jogo) — mesmo padrão do player-view/boss-view: emissive no
      // Lambert sai por cima da textura, sem mexer no map nem no color
      visual.material.emissive.set(enemy.hurtFlashTime > 0 ? '#f5effd' : '#000000');
      // "Forma plasmática inconsistente" (ESTILO 8): só o Perturbado
      // oscila (60–80%, sorteado a cada 0,2 s no update); a mulher fica com
      // a opacidade 1 do construtor — e o material dela nem é transparent
      if (visual.oscillates) visual.material.opacity = visual.opacityValue;
    }
  }
}
