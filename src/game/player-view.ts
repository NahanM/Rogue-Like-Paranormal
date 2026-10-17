import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { characters, lights, player as cfg, PX_POR_UNIDADE } from './config';
import { loadCharacterTextures, pickDirection8, type Direction8 } from './character-sprites';
import type { Player } from './player';

// Desenho do protagonista na cena 3D (ESTILO, seções 3, 4, 6 e 8): billboard
// em pé com os 8 parados do PixelLab — um material só, trocando o map pela
// direção do olhar —, sombra redonda no chão e a luz roxa da mão.
// Espelhamento acabou: as 8 direções já vêm prontas (ESTILO, seção 8), e
// sprite nunca é girado no código (seção 3).
export class PlayerView {
  readonly object = new THREE.Group();
  private readonly frames: Record<Direction8, THREE.Texture>;
  // lado do plano no mundo, antes do BILLBOARD_STRETCH (o PNG é quadrado,
  // então largura e altura do plano partem do mesmo lado)
  private readonly side: number;
  // quanto a BASE do PNG fica abaixo do chão, pra a linha do pé cair em y = 0
  private readonly footOffset: number;
  private readonly sprite: THREE.Mesh;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly handLight: THREE.PointLight;
  // última direção desenhada: se o vetor de olhar vier nulo, o sprite
  // mantém ela em vez de sumir (hoje o look nunca é zero, mas o fallback
  // é barato e evita buraco no primeiro quadro de um caso futuro)
  private lastDirection: Direction8 = 'north';

  // as imagens já têm que estar carregadas (loadAll) quando isto é criado;
  // 'protagonista' é o nome que o main registra no carregador
  // (registerCharacterSprites) — os dois lugares têm que bater
  constructor() {
    const sprites = loadCharacterTextures('protagonista');
    this.frames = sprites.frames;

    // Tamanho pelo PNG (ESTILO, seção 3): lado = pngSize × scale ÷
    // PX_POR_UNIDADE. 32 × 1 ÷ 18,7 = 1,71 de lado no mundo
    const char = characters.protagonista;
    this.side = (char.pngSize * char.scale) / PX_POR_UNIDADE;

    // Pé na linha certa (ESTILO, seção 3): a linha footLine do PNG (29 de
    // 32, 2 px acima da borda de baixo) é que fica em y = 0. O plano nasce
    // com a BASE do PNG em y = 0, então a base desce o que sobra embaixo
    // da linha do pé. A linha é fixa por personagem (não por direção):
    // sem isso, virar fazia o boneco pular 1 px, porque cada direção deixa
    // os pés num ponto um pouco diferente do PNG
    this.footOffset = -((char.pngSize - 1 - char.footLine) / char.pngSize) * this.side * BILLBOARD_STRETCH;

    // Plano de 1x1 com a origem no pé (embaixo, no meio): o tamanho real vem do scale.
    // Lambert pra receber a luz da cena; alphaTest recorta o fundo transparente
    // e mantém a profundidade certa, então quem fica na frente é resolvido pelo 3D
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    this.material = new THREE.MeshLambertMaterial({
      map: this.frames.north,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.sprite = new THREE.Mesh(geometry, this.material);

    const shadowCfg = cfg.shadow;
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(shadowCfg.radius, 16),
      new THREE.MeshBasicMaterial({
        color: shadowCfg.color,
        transparent: true,
        opacity: shadowCfg.opacity,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    const hand = lights.hand;
    this.handLight = new THREE.PointLight(hand.color, hand.intensity, hand.distance, hand.decay);

    this.object.add(this.sprite, this.shadow, this.handLight);
  }

  // Chamado a cada quadro desenhado
  sync(player: Player): void {
    // Direção pela fatia de 45° do vetor de olhar (ESTILO, seção 8); vetor
    // nulo mantém a última usada. Nada de espelhar: as 8 vêm do PixelLab
    const direction = pickDirection8(player.lookX, player.lookZ) ?? this.lastDirection;
    this.lastDirection = direction;
    this.material.map = this.frames[direction];

    // Andando em qualquer direção, o sprite parado sobe e desce 1 px a cada
    // passo (ESTILO, seção 8: não existe animação de andar); parado, sem
    // balanço. Mesma fórmula de antes: bobHeight × BILLBOARD_STRETCH pra
    // renderizar 1 px na tela de verdade
    const bob = player.moving
      ? (Math.floor(player.walkTime * cfg.bobRate) % 2) * cfg.bobHeight * BILLBOARD_STRETCH
      : 0;

    // Em pé e esticado na altura (engine/billboard.ts): PNG quadrado, então
    // scale.x = lado e scale.y = lado × stretch
    this.sprite.scale.set(this.side, this.side * BILLBOARD_STRETCH, 1);
    // a base do PNG desce até a linha do pé ficar em y = 0; o bob entra em cima
    this.sprite.position.set(player.x, this.footOffset + bob, player.z);

    this.shadow.position.set(player.x, 0.03, player.z);

    // Luz da mão (ESTILO, seção 6: "0,35 unidade pro lado em que ele olha"):
    // o lado agora sai do OLHAR — hemisfério oeste (lookX < 0) fica à
    // esquerda; olhando exatamente north/south (lookX = 0), fica à direita,
    // como antes. Altura, avanço e alcance continuam do config
    const hand = lights.hand;
    const side = player.lookX < 0 ? -1 : 1;
    this.handLight.position.set(player.x + hand.side * side, hand.height, player.z + hand.forward);
    this.handLight.intensity = hand.intensity;
    this.handLight.distance = hand.distance;
    this.handLight.decay = hand.decay;

    // Flash de dano (ESTILO, seção 8: sprite branco #f5effd por 2 frames de
    // jogo). O material é Lambert, que tem emissive: com o emissive em
    // #f5effd o quadro inteiro sai branco por cima da textura, sem mexer no
    // map nem no color base. Zerado o tempo, volta ao preto (sem emissão)
    this.material.emissive.set(player.hurtFlashTime > 0 ? '#f5effd' : '#000000');
  }
}
