import './style.css';
import * as THREE from 'three';
import { renderer, hud } from './engine/screen';
import { start } from './engine/loop';
import { register, registerOptional, loadAll, getOptionalImage } from './engine/assets';
import { imageTexture } from './engine/textures';
import { loadPixelFont } from './engine/pixel-text';
import { assetPaths, fog, debug as debugCfg } from './game/config';
import { Player } from './game/player';
import { PlayerView, playerSpriteAssetKey } from './game/player-view';
import { CameraRig } from './game/camera';
import { DebugView } from './game/debug';
import { createArena } from './game/scene/arena-room';
import { brickTexture, capTexture, fireTextures, floorTexture } from './game/scene/procedural-textures';
import type { KitTextures } from './game/scene/kit';
import { drawHud } from './ui/hud';

// Com "reduzir movimento" ligado no sistema: câmera sem suavização, fogo sem piscar
// e partículas paradas (ESTILO, seção 2)
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery.matches;
motionQuery.addEventListener('change', () => {
  reducedMotion = motionQuery.matches;
});

// --- Assets ---
// Sprites do protagonista são obrigatórios; as texturas finais são opcionais
// (enquanto não existem, entra a versão gerada por código)
for (const [key, path] of Object.entries(assetPaths.playerSprites)) {
  register(playerSpriteAssetKey(key as keyof typeof assetPaths.playerSprites), path);
}
registerOptional('texture_floor', assetPaths.textures.floor);
registerOptional('texture_wall', assetPaths.textures.wall);
registerOptional('texture_cap', assetPaths.textures.cap);

// Usa o arquivo de public/assets/texturas/ se ele existir; senão, a gerada
function pickTexture(key: string, generated: () => THREE.Texture): THREE.Texture {
  const image = getOptionalImage(key);
  return image ? imageTexture(image, true) : generated();
}

function startGame(): void {
  const textures: KitTextures = {
    floor: pickTexture('texture_floor', floorTexture),
    wall: pickTexture('texture_wall', brickTexture),
    cap: pickTexture('texture_cap', capTexture),
    fire: fireTextures(),
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

  const room = createArena(textures);
  scene.add(room.object);

  const player = new Player();
  player.placeAt(room.spawn);
  const playerView = new PlayerView();
  scene.add(playerView.object);

  const rig = new CameraRig();
  rig.snapTo(player);

  const debugView = new DebugView();
  debugView.showRoom(room.collision);
  scene.add(debugView.object);

  // Lógica no passo fixo de 60 Hz
  function update(dt: number): void {
    player.update(dt, room.collision);
    // Dano de teste da tecla H (só com F1 ligado), aplicado no passo fixo
    debugView.updateTestDamage(player, room.collision);
    room.update(dt, reducedMotion);
    rig.update(dt, player, reducedMotion);
  }

  // Desenho uma vez por quadro do navegador
  function draw(): void {
    playerView.sync(player);
    debugView.sync(player);
    renderer.render(scene, rig.camera);
    drawHud(hud, player);
    debugView.drawHud(hud);
  }

  // Primeiro quadro já montado, pra tela nunca abrir vazia
  update(0);
  draw();
  start(update, draw);
}

// --- Inicialização ---
// Só entra no loop depois que tudo carregou. Se faltar asset obrigatório,
// o erro aparece no console e escrito na tela, pra não ficar só uma tela preta.
// A fonte do HUD carrega junto com as imagens
Promise.all([loadAll(), loadPixelFont()])
  .then(startGame)
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Não foi possível iniciar o jogo:', err);
    hud.fillStyle = debugCfg.textColor;
    hud.font = '8px monospace';
    hud.textBaseline = 'top';
    hud.fillText(message, 4, 4);
  });
