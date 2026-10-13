import './style.css';
import * as THREE from 'three';
import { renderer, hud, startScreenShake, updateScreenShake, applyScreenShake } from './engine/screen';
import { start } from './engine/loop';
import { register, registerOptional, loadAll, getOptionalImage } from './engine/assets';
import { imageTexture } from './engine/textures';
import { loadPixelFont } from './engine/pixel-text';
import { assetPaths, fog, debug as debugCfg, player as playerCfg, death as deathCfg } from './game/config';
import { rectsOverlap } from './game/collision';
import { Player } from './game/player';
import { PlayerView, playerSpriteAssetKey } from './game/player-view';
import { Boss, getBossHurtbox } from './game/boss';
import { BossView, BOSS_SPRITE_KEY } from './game/boss-view';
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
// Sprite do chefe: opcional; enquanto o arquivo não existe, o jogo gera a massa escura
registerOptional(BOSS_SPRITE_KEY, assetPaths.bossIdle);

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
  const playerView = new PlayerView();
  scene.add(playerView.object);

  // O chefe não é peça da sala: lógica e desenho próprios (boss.ts / boss-view.ts)
  const boss = new Boss();
  const bossView = new BossView();
  scene.add(bossView.object);

  const rig = new CameraRig();
  rig.snapTo(player);

  const debugView = new DebugView();
  debugView.showRoom(room.collision);
  scene.add(debugView.object);

  // Flag do golpe atual: o dano no chefe entra UMA VEZ por ataque, mesmo a
  // área ficando ativa por vários passos. Rearma quando a fase ativa acaba
  // (getAttackHitbox devolve null fora dela) — por golpe, não por tempo
  let attackHitDone = false;

  // Estado do jogo, mínimo (Tarefa 5 da Sprint 3). A arena é a única sala:
  // o estado é global, não por sala. A sala 1 (Sprint 4) e as telas de
  // morte/vitória (Sprint 9) vão tomar conta disto
  //   'playing' — a luta roda
  //   'dead'    — vida do jogador zerou: congelado durante a pausa de morte,
  //               depois a luta reseta (PROVISÓRIO: sem tela de morte)
  //   'victory' — chefe morto: estado terminal e parado (sem reinício
  //               automático e sem tela de vitória); o jogador segue
  //               controlável na arena vazia
  type GameState = 'playing' | 'dead' | 'victory';
  let gameState: GameState = 'playing';
  let deathTime = 0;
  // Cargas de Cicatrizante fotografadas na entrada da arena (COMBATE.md,
  // "Morrer": morrer na arena devolve as cargas que o jogador tinha AO
  // ENTRAR nela). A foto é tirada no enterArena abaixo — hoje chamado uma
  // vez, no início, porque em dev o jogo começa na arena; a troca de sala
  // da Sprint 4 vai chamar de novo ao chegar da sala 1
  let arenaEntryCharges = player.healCharges;

  // Entrada na arena: joga o jogador na chegada (0, 9.4 — arena.json) e
  // fotografa as cargas de cura
  function enterArena(): void {
    player.placeAt(room.spawn);
    arenaEntryCharges = player.healCharges;
  }

  // Reset da luta (PROVISÓRIO, sem recarregar a página — COMBATE.md,
  // "Morrer" na arena): jogador na entrada com vida cheia e as cargas da
  // foto; chefe dormindo com 300, sem raízes nem slam. A luz vermelha e o
  // círculo apagam sozinhos na leitura do estado 'sleep' (boss-view e a
  // chamada setRitualCircleLit abaixo); as faíscas já expiraram sozinhas
  function resetFight(): void {
    player.respawn(room.spawn, arenaEntryCharges);
    boss.reset();
    attackHitDone = false;
    // sem o snap a câmera atravessaria a arena em suavização até a entrada
    rig.snapTo(player);
    gameState = 'playing';
  }

  // Lógica no passo fixo de 60 Hz
  function update(dt: number): void {
    updateScreenShake(dt);

    if (gameState === 'playing') {
      player.update(dt, room.collision);
      // Dano de teste da tecla H (só com F1 ligado), aplicado no passo fixo
      debugView.updateTestDamage(player, room.collision);
      // O acordar mora aqui dentro: se o jogador pisou no círculo, o estado
      // sai de 'sleep' uma única vez (COMBATE.md, Acordar). A sala vai junto
      // porque as raízes do Ataque 1 sorteiam ponto no chão andável e o dano
      // no jogador passa pelo takeDamage (empurrão com colisão)
      boss.update(dt, player, room.collision);
      // Tremida do acerto (ESTILO, seção 2: golpe do chefe que PEGA —
      // raízes ou slam — 2 px, 120 ms; rolar por dentro não treme, porque
      // o boss só levanta a conta quando o takeDamage morde de verdade)
      if (boss.playerHitLanded) {
        startScreenShake(deathCfg.shake.bossHit.amplitudePx, deathCfg.shake.bossHit.duration);
      }
      // Golpe do jogador no chefe: só na fase ativa e só se a área de acerto
      // e a área que leva dano se tocarem no plano do chão. O takeDamage em si
      // ignora o chefe dormindo ou morto
      const hitbox = player.getAttackHitbox();
      if (!hitbox) {
        attackHitDone = false;
      } else if (!attackHitDone && rectsOverlap(hitbox, getBossHurtbox())) {
        attackHitDone = true;
        boss.takeDamage(playerCfg.attack.damage);
      }
      // Morte do chefe: vitória terminal por ora — nada reinicia sozinho e
      // não existe tela (Sprint 9). As faíscas saem no boss-view ao ler
      // 'dead'; aqui fica a tremida de 3 px/400 ms (ESTILO, seção 2)
      if (boss.state === 'dead') {
        gameState = 'victory';
        startScreenShake(deathCfg.shake.bossKill.amplitudePx, deathCfg.shake.bossKill.duration);
      }
    } else if (gameState === 'dead') {
      // Pausa de morte (PROVISÓRIO, sem animação nem tela: Sprint 9). O
      // jogador não atualiza — sem input e sem mover, congelado onde caiu —
      // e o chefe fica como estava até o reset
      deathTime += dt;
      if (deathTime >= deathCfg.playerRespawnDelay) resetFight();
    } else {
      // 'victory': a luta acabou, mas o jogador continua controlável na
      // arena vazia até existir um reinício de verdade (Sprint 9)
      player.update(dt, room.collision);
    }

    // Morte do jogador, processada no mesmo passo do dano (seja do chefe,
    // seja da tecla H de debug — inclusive na vitória): vida zerada entra
    // no estado de morte na hora. Sem animação de morte do jogador ainda
    // (Sprint 2 terminou sem ela): só congela e reseta
    if (gameState !== 'dead' && player.health <= 0) {
      gameState = 'dead';
      deathTime = 0;
    }

    // O círculo de ritual acompanha o chefe ACORDADO: acordou, ele acende e
    // passa a pulsar; dormindo (início e reset) ou morto, fica apagado
    // (ESTILO, seção 6). Chamada idempotente, todo passo
    room.setRitualCircleLit(boss.state === 'awake');
    bossView.update(dt, boss, reducedMotion);
    room.update(dt, reducedMotion);
    rig.update(dt, player, reducedMotion);
  }

  // Desenho uma vez por quadro do navegador
  function draw(): void {
    playerView.sync(player);
    bossView.sync(boss);
    debugView.sync(player, boss);
    renderer.render(scene, rig.camera);
    drawHud(hud, player);
    debugView.drawHud(hud);
    applyScreenShake();
  }

  // O jogo começa na arena em dev: a entrada é a chegada (0, 9.4) do
  // arena.json, e é aqui que as cargas de Cicatrizante são fotografadas
  enterArena();

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
