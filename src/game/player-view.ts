import * as THREE from 'three';
import { getImage } from '../engine/assets';
import { imageTexture } from '../engine/textures';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { assetPaths, lights, player as cfg } from './config';
import type { Player } from './player';

type SpriteKey = keyof typeof assetPaths.playerSprites;

const WALK_FRAMES: readonly SpriteKey[] = ['walk1', 'walk2', 'walk3', 'walk4'];

// Chave do asset no carregador, pra registrar e buscar com o mesmo nome
export function playerSpriteAssetKey(key: SpriteKey): string {
  return `player_${key}`;
}

interface SpriteFrame {
  texture: THREE.Texture;
  // largura do billboard no mundo: cada quadro tem a largura dele (16 a 19 px)
  width: number;
}

// Desenho do protagonista na cena 3D (ESTILO, seções 4 e 8):
// billboard com origem no pé, sombra redonda no chão e a luz roxa da mão.
export class PlayerView {
  readonly object = new THREE.Group();
  private readonly frames: Record<SpriteKey, SpriteFrame>;
  private readonly sprite: THREE.Mesh;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly handLight: THREE.PointLight;

  // as imagens já têm que estar carregadas (loadAll) quando isto é criado
  constructor() {
    const keys = Object.keys(assetPaths.playerSprites) as SpriteKey[];
    const entries = keys.map((key): [SpriteKey, SpriteFrame] => {
      const image = getImage(playerSpriteAssetKey(key));
      return [key, { texture: imageTexture(image), width: (image.width / cfg.spriteHeightPx) * cfg.height }];
    });
    this.frames = Object.fromEntries(entries) as Record<SpriteKey, SpriteFrame>;

    // Plano de 1x1 com a origem no pé (embaixo, no meio): o tamanho real vem do scale.
    // Lambert pra receber a luz da cena; alphaTest recorta o fundo transparente
    // e mantém a profundidade certa, então quem fica na frente é resolvido pelo 3D
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    this.material = new THREE.MeshLambertMaterial({
      map: this.frames.up.texture,
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
    const frame = this.frames[this.frameKey(player)];
    this.material.map = frame.texture;

    // andar pra cima ou pra baixo não tem animação própria: o boneco sobe 1 px a cada passo
    const bob =
      player.moving && player.facing !== 'side'
        ? (Math.floor(player.walkTime * cfg.bobRate) % 2) * cfg.bobHeight * BILLBOARD_STRETCH
        : 0;

    // esquerda é o sprite de lado espelhado; sprite nunca é girado (ESTILO, seção 3)
    const mirror = player.facing === 'side' && player.facingLeft ? -1 : 1;
    // em pé e esticado na altura (engine/billboard.ts): na tela fica com 1,8 de altura
    this.sprite.scale.set(frame.width * mirror, cfg.height * BILLBOARD_STRETCH, 1);
    this.sprite.position.set(player.x, bob, player.z);

    this.shadow.position.set(player.x, 0.03, player.z);

    const hand = lights.hand;
    this.handLight.position.set(player.x + hand.side * mirror, hand.height, player.z + hand.forward);
    this.handLight.intensity = hand.intensity;
    this.handLight.distance = hand.distance;
    this.handLight.decay = hand.decay;

    // Flash de dano (ESTILO, seção 8: sprite branco #f5effd por 2 frames de
    // jogo). O material é Lambert, que tem emissive: com o emissive em
    // #f5effd o quadro inteiro sai branco por cima da textura, sem mexer no
    // map nem no color base. Zerado o tempo, volta ao preto (sem emissão)
    this.material.emissive.set(player.hurtFlashTime > 0 ? '#f5effd' : '#000000');
  }

  private frameKey(player: Player): SpriteKey {
    if (player.facing === 'side') {
      if (!player.moving) return 'side';
      return WALK_FRAMES[Math.floor(player.walkTime * cfg.walkFps) % WALK_FRAMES.length];
    }
    return player.facing;
  }
}
