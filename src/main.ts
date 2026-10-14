import './style.css';
import * as THREE from 'three';
import { renderer, hud, startScreenShake, updateScreenShake, applyScreenShake } from './engine/screen';
import { start } from './engine/loop';
import { register, registerOptional, loadAll, getOptionalImage } from './engine/assets';
import { imageTexture } from './engine/textures';
import { loadPixelFont } from './engine/pixel-text';
import { assetPaths, fog, debug as debugCfg, player as playerCfg, death as deathCfg, roomTransition } from './game/config';
import { pointInRect, rectsOverlap, type SpawnEntry } from './game/collision';
import { Player } from './game/player';
import { PlayerView, playerSpriteAssetKey } from './game/player-view';
import { Boss, getBossHurtbox } from './game/boss';
import { BossView, BOSS_SPRITE_KEY } from './game/boss-view';
import { createEnemies, KNOWN_ENEMY_KINDS, type Enemy } from './game/enemies';
import { EnemiesView } from './game/enemy-view';
import { CameraRig } from './game/camera';
import { DebugView } from './game/debug';
import { createArena } from './game/scene/arena-room';
import { createSala1 } from './game/scene/sala1-room';
import type { Room } from './game/scene/room';
import { brickTexture, capTexture, fireTextures, floorTexture } from './game/scene/procedural-textures';
import type { KitTextures } from './game/scene/kit';
import { drawHud, drawRoomFade } from './ui/hud';

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

  // As duas salas existem na cena desde o começo; só a ativa fica visível.
  // Cada Room já lê o próprio .json (colisão, spawn e, na sala 1, a saída)
  const sala1 = createSala1(textures);
  const arena = createArena(textures);
  scene.add(sala1.object);
  scene.add(arena.object);

  // Sala ativa: é a colisão do jogador, a única que roda room.update e a
  // única visível. O jogo começa na sala 1 (CENA3D); a arena acende na troca
  let currentRoomId: 'sala1' | 'arena' = 'sala1';
  let currentRoom: Room = sala1;
  sala1.object.visible = true;
  arena.object.visible = false;

  const player = new Player();
  const playerView = new PlayerView();
  scene.add(playerView.object);

  // O chefe não é peça da sala: lógica e desenho próprios (boss.ts /
  // boss-view.ts). Ele só existe com a arena ativa: começa escondido e a
  // lógica dele não roda na sala 1 (ver o update — sleep eterno lá)
  const boss = new Boss();
  const bossView = new BossView();
  bossView.object.visible = false;
  scene.add(bossView.object);

  // Inimigos da sala 1 (Sprint 5): criados da lista "inimigos" do
  // sala1.json, exposta pela sala1-room. Eles não passam pra arena
  // (COMBATE.md, Sala 1): a visibilidade segue a sala ativa, igual ao
  // bossView ao contrário, e o update deles só roda na sala 1
  const enemies = createEnemies(sala1.enemySpawns);
  // Foto do spawn original de cada inimigo, pro reset da sala 1 (COMBATE.md,
  // "Morrer": "inimigos e itens voltam"). O createEnemies anda NA ORDEM dos
  // spawns e só pula tipos fora do KNOWN_ENEMY_KINDS, então repetir o mesmo
  // filtro aqui casa inimigo ↔ spawn um a um — e a lista de tipos é uma
  // fonte só, importada do enemies.ts, pra as duas nunca descasarem
  const enemySpawns = new Map<Enemy, SpawnEntry>();
  {
    let ei = 0;
    for (const spawn of sala1.enemySpawns) {
      if (!KNOWN_ENEMY_KINDS.includes(spawn.tipo)) continue;
      enemySpawns.set(enemies[ei], spawn);
      ei++;
    }
  }
  const enemiesView = new EnemiesView(enemies);
  enemiesView.object.visible = true; // o jogo começa na sala 1
  scene.add(enemiesView.object);

  const rig = new CameraRig();

  const debugView = new DebugView();
  debugView.showRoom(sala1.collision);
  // Inimigos no F1: círculo do corpo + quadrado da hurtbox seguindo o pé,
  // e a linha de QA no HUD
  debugView.attachEnemies(enemies);
  scene.add(debugView.object);

  // Flag do golpe atual: o dano no chefe entra UMA VEZ por ataque, mesmo a
  // área ficando ativa por vários passos. Rearma quando a fase ativa acaba
  // (getAttackHitbox devolve null fora dela) — por golpe, não por tempo
  let attackHitDone = false;

  // O equivalente pra sala 1, com VÁRIOS alvos: um golpe pode pegar dois
  // inimigos ao mesmo tempo — DÚVIDA DO DOC, decidida: o COMBATE.md não
  // restringe e souls-like deixa o arco atingir quem estiver dentro da
  // área — mas cada inimigo toma o dano UMA vez por golpe. O conjunto
  // limpa quando o hitbox some (fim da fase ativa), mesmo padrão da flag
  // do chefe. O boss continua com a flag SÓ dele lá na arena: sala
  // diferente, sem mistura
  const enemiesHitByAttack = new Set<Enemy>();

  // Estado do jogo, mínimo (Tarefa 5 da Sprint 3 + troca de sala da
  // Sprint 4). As telas de morte/vitória (Sprint 9) vão tomar conta disto
  //   'playing'    — o jogo roda na sala ativa
  //   'transition' — troca sala 1 → arena: a tela escurece em 0,3 s, a troca
  //                  acontece no preto e clareia de volta em 0,3 s. Jogador
  //                  e chefe ficam congelados — só o relógio do fade anda
  //   'dead'       — vida do jogador zerou: congelado durante a pausa de
  //                  morte, depois resetFight (PROVISÓRIO: sem tela de morte)
  //   'victory'    — chefe morto: estado terminal e parado (sem reinício
  //                  automático e sem tela de vitória); o jogador segue
  //                  controlável na arena vazia
  type GameState = 'playing' | 'transition' | 'dead' | 'victory';
  let gameState: GameState = 'playing';
  let deathTime = 0;
  // Cargas de Cicatrizante fotografadas na entrada da arena (COMBATE.md,
  // "Morrer": morrer na arena devolve as cargas que o jogador tinha AO
  // ENTRAR nela — ou seja, as que ele carregava ao SAIR da sala 1). A foto
  // é tirada no enterArena, chamado pela transição ao chegar no preto total
  let arenaEntryCharges = player.healCharges;

  // Foto SIMÉTRICA pra sala 1: o COMBATE.md é omisso sobre as cargas lá —
  // DECISÃO DO ORQUESTRADOR (a revisar com o humano): morrer na sala 1
  // devolve as cargas que o jogador tinha AO ENTRAR nela, igual à regra da
  // arena. Hoje o jogo NASCE na sala 1, então a foto é tirada no arranque
  // (no final do startGame) e vale o startCharges do config (4)
  let sala1EntryCharges = player.healCharges;

  // Chegada na arena (chamada no auge do fade de ida): acende a arena,
  // apaga a sala 1, mostra o chefe, joga o jogador na chegada (0, 9.4 —
  // arena.json) e fotografa as cargas de cura. Sem o snap a câmera
  // atravessaria o mapa em suavização até a arena
  function enterArena(): void {
    currentRoomId = 'arena';
    currentRoom = arena;
    sala1.object.visible = false;
    arena.object.visible = true;
    bossView.object.visible = true;
    // inimigos não passam pra arena (COMBATE.md): somem junto com a sala 1,
    // e os desenhos deles no F1 também
    enemiesView.object.visible = false;
    debugView.showEnemies(false);
    player.placeAt(arena.spawn);
    arenaEntryCharges = player.healCharges;
    rig.snapTo(player);
  }

  // Troca de sala (CENA3D, Sala 1). O relógio anda no passo fixo e o
  // desenho (drawRoomFade) só lê a opacidade — mesma separação da tremida
  let transitionTime = 0;
  // a troca das salas acontece UMA vez, no preto total do fade de ida
  let roomSwapped = false;
  let fadeOpacity = 0;

  function startTransition(): void {
    gameState = 'transition';
    transitionTime = 0;
    roomSwapped = false;
  }

  // Reset da derrota, com um caminho explícito por sala (COMBATE.md,
  // "Morrer" — PROVISÓRIO sem tela de morte: Sprint 9). O que cada caminho
  // faz NÃO é simétrico, e a diferença é intencional:
  //   Arena:  jogador de volta na chegada (0, 9.4 — arena.json) com vida e
  //           stamina cheias e as cargas da foto da entrada; chefe dormindo
  //           com 300, sem raízes nem slam (a luz vermelha e o círculo
  //           apagam sozinhos na leitura do estado 'sleep'; as faíscas já
  //           expiraram); flag do golpe rearmada.
  //   Sala 1: jogador recomeça no início (0, 4.6 — sala1.json) com vida e
  //           stamina cheias e as cargas da foto do arranque. O chefe NÃO
  //           é tocado de propósito: ele dorme escondido na outra sala e o
  //           update dele nunca rodou até aqui — mexer nele seria efeito
  //           colateral sem motivo, porque "recomeçou a sala 1" não é da
  //           conta da arena. A sala em si também não reseta: braseiros e
  //           poeira são ambiente e seguem animando; "recomeçar a sala
  //           inteira" (COMBATE.md) agora significa o jogador e, no futuro,
  //           os inimigos e os itens (ver o comentário no ramo da sala 1)
  function resetFight(): void {
    if (currentRoomId === 'arena') {
      player.respawn(arena.spawn, arenaEntryCharges);
      boss.reset();
      attackHitDone = false;
    } else {
      player.respawn(sala1.spawn, sala1EntryCharges);
      // COMBATE.md, "Morrer": na sala 1, "recomeça a sala inteira (inimigos
      // e itens voltam)". INIMIGOS VOLTAM AGORA: cada um ao spawn original
      // (a foto enemySpawns da criação), com vida cheia e estado inicial —
      // o reset() de cada tipo já cuida de tudo (o Perturbado re-semeia o
      // passeio igual à criação; a Mulher volta a 'idle', sem memória do
      // jogador; hurtFlashTime zerado). O view rearma faíscas e visibilidade
      // sozinho, só lendo o estado (sparksFired reseta na virada pra vivo,
      // sprite e sombra voltam visíveis no sync). Os cronômetros de
      // opacidade NÃO são rearmados de propósito: a oscilação é contínua e
      // um revivido piscando de onde parou é indistinguível de um novo.
      // ITENS: Sprint 6 — entram neste mesmo lugar quando existirem
      for (const enemy of enemies) {
        const spawn = enemySpawns.get(enemy);
        // o mapa cobre todos os inimigos por construção; a guarda é só pra
        // agradar o tipo do Map.get
        if (spawn) enemy.reset(spawn);
      }
      // Um golpe em curso no instante da morte não pode arrastar a marca
      // de "já atingiu" pra sala recomeçada — espelho do attackHitDone da
      // arena
      enemiesHitByAttack.clear();
    }
    // sem o snap a câmera atravessaria a sala em suavização até a entrada
    rig.snapTo(player);
    gameState = 'playing';
  }

  // Lógica no passo fixo de 60 Hz
  function update(dt: number): void {
    updateScreenShake(dt);

    if (gameState === 'playing') {
      player.update(dt, currentRoom.collision);
      // Dano de teste da tecla H (só com F1 ligado), aplicado no passo fixo
      debugView.updateTestDamage(player, currentRoom.collision);

      if (currentRoomId === 'arena') {
        // O acordar mora aqui dentro: se o jogador pisou no círculo, o estado
        // sai de 'sleep' uma única vez (COMBATE.md, Acordar). A sala vai junto
        // porque as raízes do Ataque 1 sorteiam ponto no chão andável e o dano
        // no jogador passa pelo takeDamage (empurrão com colisão)
        boss.update(dt, player, currentRoom.collision);
        // Tremida do acerto (ESTILO, seção 2: golpe do chefe que PEGA —
        // raízes ou slam — 2 px, 120 ms; rolar por dentro não treme, porque
        // o boss só levanta a conta quando o takeDamage morde de verdade)
        if (boss.playerHitLanded) {
          startScreenShake(deathCfg.shake.bossHit.amplitudePx, deathCfg.shake.bossHit.duration);
        }
        // Golpe do jogador no chefe: só na fase ativa e só se a área de
        // acerto e a área que leva dano se tocarem no plano do chão. O
        // takeDamage em si ignora o chefe dormindo ou morto
        const hitbox = player.getAttackHitbox();
        if (!hitbox) {
          attackHitDone = false;
        } else if (!attackHitDone && rectsOverlap(hitbox, getBossHurtbox())) {
          attackHitDone = true;
          boss.takeDamage(playerCfg.attack.damage);
        }
        // Morte do chefe: vitória terminal por ora — nada reinicia sozinho
        // e não existe tela (Sprint 9). As faíscas saem no boss-view ao ler
        // 'dead'; aqui fica a tremida de 3 px/400 ms (ESTILO, seção 2)
        if (boss.state === 'dead') {
          gameState = 'victory';
          startScreenShake(deathCfg.shake.bossKill.amplitudePx, deathCfg.shake.bossKill.duration);
        }
      } else {
        // Sala 1: cada inimigo vivo anda e testa o próprio dano de encostar
        // DENTRO do update dele (recebe o jogador e a sala, como o boss faz
        // com as raízes) — o main só chama, sem decidir dano aqui. O morto
        // sai pela guarda de estado e nem aparece (o view esconde)
        for (const enemy of enemies) {
          if (enemy.state === 'alive') enemy.update(dt, player, currentRoom.collision);
        }
        // Golpe do jogador nos inimigos (COMBATE.md: 10 de dano por golpe —
        // 2 golpes matam um Perturbado de 20): a área ativa do ataque contra
        // o hurtbox de cada um. O arco pode pegar vários de uma vez, mas
        // cada um toma o dano UMA vez por golpe (o Set acima; limpa quando
        // a fase ativa acaba). Morto nem é testado: não toma mais dano e
        // marcar o cadáver no conjunto seria inútil. SEM tremida de tela:
        // ela só existe pro chefe (ESTILO, seção 2)
        const hitbox = player.getAttackHitbox();
        if (!hitbox) {
          enemiesHitByAttack.clear();
        } else {
          for (const enemy of enemies) {
            if (enemy.state !== 'alive' || enemiesHitByAttack.has(enemy)) continue;
            if (rectsOverlap(hitbox, enemy.hurtbox())) {
              enemiesHitByAttack.add(enemy);
              enemy.takeDamage(playerCfg.attack.damage);
            }
          }
        }
        // Cronômetros visuais e faíscas da morte leem o estado DEPOIS do
        // dano do passo, pra explosão sair no mesmo instante da morte —
        // padrão do bossView.update lá embaixo, que também roda depois do
        // takeDamage do chefe
        enemiesView.update(dt, reducedMotion);
        // Sala 1: pé do jogador dentro do retângulo da "saida" (sala1.json,
        // exposto pela sala1-room) dispara a troca. A guarda de vida é pra
        // não "viajar morto": se um inimigo zerou a vida no mesmo passo, a
        // morte (logo abaixo) tem prioridade sobre a saída
        if (player.health > 0 && pointInRect(player, sala1.exit)) {
          startTransition();
        }
      }
    } else if (gameState === 'transition') {
      // Congelado: jogador e chefe NÃO atualizam — só o relógio do fade
      // anda. 0,3 s escurecendo + 0,3 s clareando: o CENA3D só manda
      // escurecer em 0,3 s; clarear de volta no mesmo tempo é a leitura
      // simétrica (decisão registrada no config.ts)
      transitionTime += dt;
      // No preto total acontece a troca de verdade: salas visíveis, chegada
      // do jogador, foto das cargas e snap da câmera (enterArena)
      if (!roomSwapped && transitionTime >= roomTransition.fadeTime) {
        roomSwapped = true;
        enterArena();
        debugView.showRoom(arena.collision);
      }
      const fade = roomTransition.fadeTime;
      fadeOpacity =
        transitionTime <= fade
          ? transitionTime / fade
          : Math.max(0, (fade * 2 - transitionTime) / fade);
      if (transitionTime >= fade * 2) {
        fadeOpacity = 0;
        gameState = 'playing';
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
      player.update(dt, currentRoom.collision);
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
    // (ESTILO, seção 6). Chamada idempotente, todo passo. Só existe na
    // arena — na sala 1 o chefe nem acorda (o update dele não é chamado)
    arena.setRitualCircleLit(boss.state === 'awake');
    bossView.update(dt, boss, reducedMotion);
    // só a sala ativa anima (poeira, braseiros, círculo); a outra fica
    // parada e invisível até a troca
    currentRoom.update(dt, reducedMotion);
    rig.update(dt, player, reducedMotion);
  }

  // Desenho uma vez por quadro do navegador
  function draw(): void {
    playerView.sync(player);
    bossView.sync(boss);
    enemiesView.sync();
    debugView.sync(player, boss);
    renderer.render(scene, rig.camera);
    drawHud(hud, player);
    debugView.drawHud(hud);
    // Fade da troca de sala por cima de TUDO (HUD e debug), lendo só a
    // opacidade que o passo fixo calculou
    drawRoomFade(hud, fadeOpacity);
    applyScreenShake();
  }

  // O jogo começa na sala 1 (CENA3D): jogador no "inicio" (0, 4.6) do
  // sala1.json e câmera snapada. Como nascer aqui É a entrada na sala 1,
  // a foto das cargas da sala 1 é tirada agora (4 cargas do config). A da
  // arena só existe depois — tirada na chegada (enterArena, na transição)
  player.placeAt(sala1.spawn);
  sala1EntryCharges = player.healCharges;
  rig.snapTo(player);

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
