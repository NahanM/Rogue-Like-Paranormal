import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { createRng, range, type Rng } from '../engine/random';
import { death as deathCfg, enemies as cfg } from './config';
import { mulherAfogadaTexture, perturbadoTexture } from './scene/procedural-textures';
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
}

// Desenho dos inimigos comuns na cena 3D (ESTILO, seções 3, 4 e 8). Mesma
// receita do player-view/boss-view: plano 1x1 com a origem no pé, Lambert
// com alphaTest pra receber a luz da cena, sombra deitada. Morto: sprite e
// sombra se escondem e as faíscas tomam o lugar, como no boss-view
export class EnemiesView {
  readonly object = new THREE.Group();
  private readonly visuals: EnemyVisual[] = [];

  constructor(enemies: Enemy[]) {
    // Placeholders gerados por código (procedural-textures.ts) até o
    // ASSETS.md entregar os sprites — a tabela dele não define caminho pros
    // inimigos, então não existe registerOptional disso no main.ts. Uma
    // textura por tipo, dividida pelos vários bichos iguais
    const plasmaTexture = perturbadoTexture();
    const drownedTexture = mulherAfogadaTexture();

    // Visual por tipo: textura, altura no mundo (ESTILO, seção 3: perturbado
    // 1,3 un ~24 px; mulher 1,8 un ~32 px), sombra e se a opacidade oscila.
    // Os números de ajuste moram no config; aqui só se escolhe qual é de quem
    const kinds: Record<EnemyKind, { texture: THREE.Texture; height: number; shadow: { radius: number; opacity: number; color: string }; oscillates: boolean }> = {
      perturbado: {
        texture: plasmaTexture,
        height: cfg.perturbado.height,
        shadow: cfg.perturbado.shadow,
        oscillates: true,
      },
      mulher: {
        texture: drownedTexture,
        height: cfg.mulher.height,
        shadow: cfg.mulher.shadow,
        oscillates: false,
      },
    };

    enemies.forEach((enemy, index) => {
      const kind = kinds[enemy.kind];
      // Largura pela proporção da textura, com a altura travada na do tipo
      // (ESTILO seção 3) — como o boss-view faz com o chefe
      const pixels = kind.texture.image as { width: number; height: number };
      const width = (pixels.width / pixels.height) * kind.height;

      // Plano 1x1 com a origem no pé, igual ao do player e do chefe.
      // transparent: true só em quem oscila (opacidade animada); no resto
      // o alphaTest basta pra recortar o fundo com a profundidade certa
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.translate(0, 0.5, 0);
      const material = new THREE.MeshLambertMaterial({
        map: kind.texture,
        alphaTest: 0.5,
        transparent: kind.oscillates,
        side: THREE.DoubleSide,
      });
      const sprite = new THREE.Mesh(geometry, material);
      // Em pé e esticado na altura (engine/billboard.ts), nunca girado
      sprite.scale.set(width, kind.height * BILLBOARD_STRETCH, 1);

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
      // originHeight: essa vem da altura do PRÓPRIO inimigo (height/2, o
      // miolo do corpo — perturbado 1,3 → 0,65; mulher 1,8 → 0,9), então o
      // config não fixa altura de ninguém. A semente é por índice, senão
      // dois mortos no mesmo golpe iam soltar explosões gêmeas lado a lado
      const sparks = new DeathSparks(
        { ...deathCfg.enemySparks, originHeight: kind.height / 2 },
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
      });
    });
  }

  // Passo fixo: os cronômetros da oscilação de opacidade e as faíscas da
  // morte (efeito puramente visual; a lógica — andar, perseguir, machucar,
  // morrer — mora no enemies.ts). Mesmo desenho do BossView: update no
  // passo, sync no frame. A flag de movimento reduzido entra na assinatura
  // por paridade com o BossView mas aqui é IGNORADA de propósito — DÚVIDA
  // DO DOC, decidida: o ESTILO se cala sobre inimigos, e tanto a oscilação
  // quanto as faíscas SÃO a leitura do bicho (vivo e morto), como as
  // faíscas da morte do chefe rolam mesmo reduzidas; quem desliga são só
  // as pulsações decorativas
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

  // Uma vez por quadro desenhado: posição, flash e opacidade
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

      visual.sprite.position.set(enemy.x, 0, enemy.z);
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
