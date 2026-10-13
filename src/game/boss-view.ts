import * as THREE from 'three';
import { getOptionalImage } from '../engine/assets';
import { imageTexture } from '../engine/textures';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { boss as cfg, death as deathCfg, lights } from './config';
import { bossIdleTexture } from './scene/procedural-textures';
import { DeathSparks } from './scene/particles';
import type { Boss } from './boss';

// Chave do asset no carregador: o main.ts registra como opcional e esta view
// busca depois do loadAll — mesmo fluxo das texturas do cenário
// (CENA3D, seção Texturas: arquivo se existir, gerado por código se faltar)
export const BOSS_SPRITE_KEY = 'boss_idle';

// Altura da marca de aviso: acima das raízes decorativas do kit (0,03), dos
// anéis do círculo (0,02) e da sombra do chefe (0,01), pra nunca piscar
// contra eles — constante de desenho, como as do kit.ts
const WARN_Y = 0.04;

// Um visual por marca do Ataque 1: círculo de aviso ou trio de espinhos.
// O pool cresce até o máximo de marcas que o boss solta (5) e é reaproveitado;
// a lista de RootStrikes do boss.ts não conhece estes meshes
interface RootVisual {
  group: THREE.Group;
  warnMesh: THREE.Mesh;
  warnMaterial: THREE.MeshBasicMaterial;
  spikes: THREE.Group;
}

// Desenho do chefe na cena 3D (ESTILO, seções 3, 4 e 6): billboard em pé com
// a origem no pé e sem rotação nenhuma, mais a sombra no chão e a luz
// vermelho-sangue. Até o chefe_parado.png chegar, a imagem é a "massa escura"
// do protótipo (ref/arena-3d.html), gerada por código.
export class BossView {
  readonly object = new THREE.Group();
  private readonly sprite: THREE.Mesh;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private readonly width: number;
  private time = 0;
  // Pool de visuais das marcas do Ataque 1 (ver RootVisual acima)
  private readonly rootVisuals: RootVisual[] = [];
  // Retângulo do Ataque 2: UM mesh só, criado no construtor e reutilizado
  // a cada golpe (mostra/esconde). É o equivalente ao pool das raízes com
  // tamanho 1: o chefe nunca tem dois slams no ar (máquina do boss.ts)
  private readonly slamRect: THREE.Mesh;
  private readonly slamWarnMaterial: THREE.MeshBasicMaterial;
  private readonly slamActiveMaterial: THREE.MeshBasicMaterial;
  // Guardado do update pro sync: sem pulso do aviso com "reduzir movimento"
  private reducedMotion = false;
  // Faíscas da morte (ESTILO, seção 8: sem animação desenhada). O disparo é
  // travado por sparksFired, pra explosão sair uma vez só por morte. Os
  // números vêm do config (death.bossSparks) — o DeathSparks foi
  // generalizado na Tarefa 2 da Sprint 5 pra servir também aos inimigos
  private readonly sparks = new DeathSparks(deathCfg.bossSparks);
  private sparksFired = false;

  // a imagem opcional já tem que ter passado pelo loadAll (ver main.ts)
  constructor() {
    const image = getOptionalImage(BOSS_SPRITE_KEY);
    const texture = image ? imageTexture(image) : bossIdleTexture();

    // Largura pela proporção da imagem, com a altura travada em cfg.height
    // (7 unidades, ESTILO seção 3): o placeholder sai com ~cfg.width e,
    // quando o chefe_parado.png existir, a proporção dele é que manda
    const pixels = texture.image as { width: number; height: number };
    this.width = (pixels.width / pixels.height) * cfg.height;

    // Plano de 1x1 com a origem no pé (embaixo, no meio), igual ao do
    // protagonista: o tamanho real vem do scale. Lambert pra receber a luz da
    // cena; alphaTest recorta o fundo transparente e mantém a profundidade
    // certa, então quem fica na frente é resolvido pelo 3D
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    this.material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
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

    // PROVISÓRIO (Ataque 2, sem sprite próprio): retângulo deitado no chão
    // com a largura em x e o alcance no +z local, COMEÇANDO NA BORDA do
    // corpo: o translate empurra o plano pra cobrir de bodyRadius até
    // bodyRadius + reach, batendo 1:1 com o playerInsideSlam do boss.ts
    // (origem na borda: decisão no config.ts). Assim a mira vira um único
    // rotation.y em cima da posição do chefe (ver syncSlam). MeshBasic nas
    // duas cores: sangue no aviso e faísca no golpe, magia que brilha
    // sozinha, mesma regra das marcas das raízes
    const slamGeometry = new THREE.PlaneGeometry(cfg.slam.width, cfg.slam.reach);
    slamGeometry.rotateX(-Math.PI / 2);
    slamGeometry.translate(0, 0, cfg.bodyRadius + cfg.slam.reach / 2);
    this.slamWarnMaterial = new THREE.MeshBasicMaterial({
      color: cfg.slam.warn.color,
      transparent: true,
      opacity: cfg.slam.warn.opacity,
      depthWrite: false,
    });
    this.slamActiveMaterial = new THREE.MeshBasicMaterial({
      color: cfg.slam.activeRect.color,
      transparent: true,
      opacity: cfg.slam.activeRect.opacity,
      depthWrite: false,
    });
    this.slamRect = new THREE.Mesh(slamGeometry, this.slamWarnMaterial);
    this.slamRect.visible = false;

    this.object.add(this.sprite, this.shadow, this.light, this.slamRect, this.sparks.object);
  }

  // Passo fixo: a luz do chefe (ESTILO, seção 6) e as faíscas da morte.
  // A luz só existe ACORDADA, pulsando em seno de ±25%; dormindo ou morto
  // fica apagada — assim o reset da luta e a morte apagam sozinhos, só pela
  // leitura do estado. O acordar é igualmente só leitura: quem muda o
  // estado é o boss.ts
  update(dt: number, boss: Boss, reducedMotion: boolean): void {
    this.time += dt;
    this.reducedMotion = reducedMotion;
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
  }

  // Uma vez por quadro desenhado: posição e tamanho no mundo
  sync(boss: Boss): void {
    // Morto, o corpo some junto com a sombra — as faíscas tomam o lugar
    // (ESTILO, seção 8). O billboard e a sombra voltam visíveis no reset
    this.sprite.visible = boss.state !== 'dead';
    this.shadow.visible = boss.state !== 'dead';

    // Pose do Ataque 2 (PROVISÓRIO, enquanto o sprite de preparo não existe):
    // o billboard "carrega" crescendo na vertical ao longo do preparo até
    // +windupGrowY e corta de volta no golpe. Com "reduzir movimento" a pose
    // sai — o retângulo de aviso no chão continua marcando o perigo
    let poseScaleY = 1;
    if (!this.reducedMotion && boss.slam && boss.slam.phase === 'windup') {
      poseScaleY = 1 + cfg.slam.windupGrowY * Math.min(1, boss.slam.time / cfg.slam.windup);
    }
    // Em pé e esticado na altura (engine/billboard.ts): na tela fica com
    // ~131 px de altura. Sprite nunca é girado (ESTILO, seção 3)
    this.sprite.scale.set(this.width, cfg.height * BILLBOARD_STRETCH * poseScaleY, 1);
    this.sprite.position.set(boss.x, 0, boss.z);

    // A sombra fica abaixo dos anéis do círculo (0,02) e das raízes (0,03):
    // planos em alturas diferentes não brigam e o ouro não some debaixo dela
    this.shadow.position.set(boss.x, 0.01, boss.z);

    // Luz no meio do corpo (ESTILO, seção 6)
    this.light.position.set(boss.x, lights.boss.height, boss.z);

    // Flash de dano (ESTILO, seção 8: sprite branco #f5effd por 2 frames de
    // jogo). Lambert tem emissive: branco no emissive sai por cima da textura,
    // sem mexer no map nem no color base. Zerado o tempo, volta ao preto —
    // mesmo padrão do player-view
    this.material.emissive.set(boss.hurtFlashTime > 0 ? '#f5effd' : '#000000');

    this.syncRoots(boss);
    this.syncSlam(boss);
  }

  // Visual do Ataque 2 (PROVISÓRIO, mesma linguagem das marcas de raiz —
  // cores da paleta, ESTILO 5). Preparo: retângulo de sangue no chão
  // pulsando leve na direção travada da mira (o aviso); ativo: acende em
  // cor de faísca pelos 0,2 s do golpe. Posição e rotação só mudam a cada
  // disparo (a mira é travada), mas reescrever todo quadro custa o mesmo
  private syncSlam(boss: Boss): void {
    const slam = boss.slam;
    if (!slam) {
      this.slamRect.visible = false;
      return;
    }
    this.slamRect.visible = true;
    // mesma altura dos avisos das raízes: acima de sombra, anéis e raízes
    // decorativas, pra nunca piscar contra eles
    this.slamRect.position.set(boss.x, WARN_Y, boss.z);
    // atan2(dirX, dirZ): o +z local (pra onde o retângulo se estende, ver o
    // translate da geometria no construtor) aponta na direção da mira
    this.slamRect.rotation.y = Math.atan2(slam.dirX, slam.dirZ);
    if (slam.phase === 'windup') {
      this.slamRect.material = this.slamWarnMaterial;
      const warn = cfg.slam.warn;
      const pulse = this.reducedMotion ? 0 : Math.sin(this.time * warn.pulseSpeed) * warn.pulseFraction;
      this.slamWarnMaterial.opacity = warn.opacity * (1 + pulse);
    } else {
      this.slamRect.material = this.slamActiveMaterial;
    }
  }

  // PROVISÓRIO: o visual do Ataque 1 é gerado por código até o raizes.png
  // chegar (ASSETS.md). Aviso = círculo de sangue no chão pulsando leve em
  // opacidade; raiz = trio de espinhos que sai do chão com um "pop" de
  // crescimento (ESTILO 5: só cores da paleta; ESTILO 8: 1-2 frames de
  // animação bastam). O círculo é MeshBasic (sangue é magia, brilha sozinho —
  // como o ouro do kit); os espinhos são Lambert, pra receberem a luz
  // vermelha do chefe
  private createRootVisual(): RootVisual {
    const group = new THREE.Group();

    const warnMaterial = new THREE.MeshBasicMaterial({
      color: cfg.roots.warn.color,
      transparent: true,
      opacity: cfg.roots.warn.opacity,
      depthWrite: false,
    });
    // círculo deitado com o raio exato do acerto: a marca mostra a área mortal
    const warnMesh = new THREE.Mesh(new THREE.CircleGeometry(cfg.roots.radius, 24), warnMaterial);
    warnMesh.rotation.x = -Math.PI / 2;
    warnMesh.position.y = WARN_Y;

    // Espinho central alto + dois menores inclinados pra fora, no vermelho-
    // sangue escuro do CENA3D ("raízes do chefe"). Geometria 3D simples,
    // não billboard: o cone já lê como ponta saindo do chão de qualquer ângulo
    const spikes = new THREE.Group();
    const spikeMaterial = new THREE.MeshLambertMaterial({ color: cfg.roots.spike.color });
    const height = cfg.roots.spike.height;
    const center = new THREE.Mesh(new THREE.ConeGeometry(0.18, height, 6), spikeMaterial);
    center.position.y = height / 2;
    spikes.add(center);
    for (const side of [-1, 1]) {
      const small = new THREE.Mesh(new THREE.ConeGeometry(0.12, height * 0.55, 6), spikeMaterial);
      small.position.set(side * 0.17, height * 0.22, 0);
      small.rotation.z = side * -0.5;
      spikes.add(small);
    }
    // nasce esmagado: o pop de crescimento acontece no syncRoots
    spikes.scale.set(1, 0, 1);

    group.add(warnMesh, spikes);
    return { group, warnMesh, warnMaterial, spikes };
  }

  // Acompanha a lista de RootStrikes do boss: cria visual novo quando faltam
  // e esconde os que sobram. Nada é destruído — o pool reusa entre ataques
  private syncRoots(boss: Boss): void {
    while (this.rootVisuals.length < boss.roots.length) {
      const visual = this.createRootVisual();
      this.rootVisuals.push(visual);
      this.object.add(visual.group);
    }
    for (let i = 0; i < this.rootVisuals.length; i++) {
      const visual = this.rootVisuals[i];
      const strike = boss.roots[i];
      if (!strike) {
        visual.group.visible = false;
        continue;
      }
      visual.group.visible = true;
      visual.group.position.set(strike.x, 0, strike.z);
      visual.warnMesh.visible = strike.phase === 'warn';
      visual.spikes.visible = strike.phase === 'active';
      if (strike.phase === 'warn') {
        const warn = cfg.roots.warn;
        const pulse = this.reducedMotion ? 0 : Math.sin(this.time * warn.pulseSpeed) * warn.pulseFraction;
        visual.warnMaterial.opacity = warn.opacity * (1 + pulse);
      } else {
        // "pop": a raiz cresce do chão nos primeiros instantes da fase ativa
        // (popTime de 0,08 s dá ~5 passos de jogo) e some ao fim do tempo.
        // Sem sprite de animação: fica assim até o ASSETS.md entregar
        const grow = Math.min(1, strike.time / cfg.roots.spike.popTime);
        visual.spikes.scale.set(1, grow, 1);
      }
    }
  }
}
