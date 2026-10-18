import './style.css';
import * as THREE from 'three';
import { renderer, hud, startScreenShake, updateScreenShake, applyScreenShake } from './engine/screen';
import { start } from './engine/loop';
import { registerOptional, loadAll, getOptionalImage } from './engine/assets';
import { imageTexture } from './engine/textures';
import { loadPixelFont } from './engine/pixel-text';
import { assetPaths, fog, debug as debugCfg, player as playerCfg, death as deathCfg, roomTransition, items as itemsCfg, boss as bossCfg } from './game/config';
import { pointInRect, rectsOverlap, type SpawnEntry } from './game/collision';
import { registerCharacterSprites } from './game/character-sprites';
import { Player } from './game/player';
import { PlayerView } from './game/player-view';
import { Boss } from './game/boss';
import { BossView } from './game/boss-view';
import { BossEffects } from './game/boss-effects';
import { createEnemies, KNOWN_ENEMY_KINDS, type Enemy } from './game/enemies';
import { EnemiesView } from './game/enemy-view';
import { Hatchet } from './game/hatchet';
import { HatchetsView } from './game/hatchet-view';
import { checkPickup, createItems, KNOWN_ITEM_KINDS, type Item, type ItemKind } from './game/items';
import { ItemsView } from './game/item-view';
import { CameraRig } from './game/camera';
import { DebugView } from './game/debug';
import { createArena } from './game/scene/arena-room';
import { createSala1 } from './game/scene/sala1-room';
import type { Room } from './game/scene/room';
import { arenaFloorTexture, brickTexture, capTexture, fireTextures, floorTexture } from './game/scene/procedural-textures';
import type { KitTextures } from './game/scene/kit';
import { drawHud, drawRoomFade, updateHud } from './ui/hud';
import { drawBossHud, updateBossHud } from './ui/boss-hud';
import { drawItemDescription, queueItemDescription, updateItemDescription } from './ui/item-description';

// Com "reduzir movimento" ligado no sistema: câmera sem suavização, fogo sem piscar
// e partículas paradas (ESTILO, seção 2)
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery.matches;
motionQuery.addEventListener('change', () => {
  reducedMotion = motionQuery.matches;
});

// --- Assets ---
// Personagens em 8 direções do PixelLab (ESTILO, seção 8): as 8 texturas de
// cada um são obrigatórias, e as views dos 4 consomem os sprites — chefe
// incluso (o boss-view troca o map pela direção do olhar dele)
registerCharacterSprites('protagonista', assetPaths.characters.protagonista);
registerCharacterSprites('perturbado', assetPaths.characters.perturbado);
registerCharacterSprites('mulher', assetPaths.characters.mulher);
registerCharacterSprites('chefe', assetPaths.characters.chefe);
// Texturas finais são opcionais (enquanto não existem, entra a gerada por código)
registerOptional('texture_floor', assetPaths.textures.floor);
registerOptional('texture_wall', assetPaths.textures.wall);
registerOptional('texture_cap', assetPaths.textures.cap);
// Máscara do Símbolo da Morte (ASSETS.md: "feito"): se o arquivo faltar, o
// símbolo simplesmente não monta — não há versão gerada dele. É a regra do
// CENA3D ("arquivo faltando = volta pra gerada, sem quebrar") aplicada a uma
// peça sem gerada: a "volta" aqui é o chão limpo
registerOptional('texture_symbol', assetPaths.textures.simbolo);

// Usa o arquivo de public/assets/texturas/ se ele existir; senão, a gerada
function pickTexture(key: string, generated: () => THREE.Texture): THREE.Texture {
  const image = getOptionalImage(key);
  return image ? imageTexture(image, true) : generated();
}

function startGame(): void {
  const textures: KitTextures = {
    floor: pickTexture('texture_floor', floorTexture),
    // chão da arena (CENA3D, Arena): SEMPRE gerado por código — não existe
    // arquivo final pra ela no ASSETS.md, então nem passa pelo pickTexture
    arenaFloor: arenaFloorTexture(),
    wall: pickTexture('texture_wall', brickTexture),
    cap: pickTexture('texture_cap', capTexture),
    fire: fireTextures(),
  };

  // Máscara do Símbolo da Morte (Tarefa 4c): null se o PNG faltou, e o
  // símbolo não monta (veias e poças não dependem dela e sempre existem).
  // Não entra no KitTextures — só a arena usa, e o parâmetro explícito do
  // createArena deixa a ausência visível na assinatura
  const symbolImage = getOptionalImage('texture_symbol');
  const symbolTexture = symbolImage ? imageTexture(symbolImage, true) : null;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

  // As duas salas existem na cena desde o começo; só a ativa fica visível.
  // Cada Room já lê o próprio .json (colisão, spawn e, na sala 1, a saída)
  const sala1 = createSala1(textures);
  const arena = createArena(textures, symbolTexture);
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

  // Efeitos dos ataques do chefe (ESTILO, seção 7): mesma vida do bossView —
  // criado junto, começa escondido na sala 1 e a arena liga no enterArena.
  // O update roda em todos os estados do jogo lá embaixo: os efeitos são só
  // leitura do estado do chefe, então dormindo/morto/em transição eles
  // simplesmente não desenham nada
  const bossEffects = new BossEffects();
  bossEffects.object.visible = false;
  scene.add(bossEffects.object);

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

  // Itens da sala 1 (Sprint 6): criados da lista "itens" do sala1.json,
  // exposta pela sala1-room — mesmo desenho dos inimigos logo acima. Eles
  // só existem na sala 1: a visibilidade segue a sala ativa (o enterArena
  // esconde) e o teste de pegar só roda lá
  const items = createItems(sala1.itemSpawns);
  // Foto do spawn original de cada item, pro reset da sala 1 (COMBATE.md,
  // "Morrer": "inimigos e itens voltam") — espelha o padrão enemySpawns:
  // createItems anda NA ORDEM dos spawns e só pula tipos fora do
  // KNOWN_ITEM_KINDS, então repetir o mesmo filtro aqui casa item ↔ spawn
  // um a um
  const itemSpawns = new Map<Item, SpawnEntry>();
  {
    let ii = 0;
    for (const spawn of sala1.itemSpawns) {
      if (!KNOWN_ITEM_KINDS.includes(spawn.tipo)) continue;
      itemSpawns.set(items[ii], spawn);
      ii++;
    }
  }
  const itemsView = new ItemsView(items);
  itemsView.object.visible = true; // o jogo começa na sala 1
  scene.add(itemsView.object);

  // Projéteis da machadinha (Sprint 6, Tarefa 2): a lista é VIVA — o F do
  // jogador cria, alcance/parede/acerto matam, a troca de sala e a morte do
  // jogador esvaziam (não cruzam de sala nem sobrevivem, espelho dos itens
  // no chão). O grupo do view fica SEMPRE visível: projéteis voam nas duas
  // salas (com a colisão da ativa) e a lista está vazia em toda troca
  const hatchets: Hatchet[] = [];
  const hatchetsView = new HatchetsView();
  scene.add(hatchetsView.object);

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

  // Fila de pickups do passo atual (Sprint 6): cada item pego entra aqui
  // com o TIPO dele, na ordem em que foi pisado. O main esvazia no começo
  // de cada passo de jogo e o teste de pisar preenche; a Tarefa 3 drena
  // pra caixa de descrição (ui/item-description.ts) no mesmo passo
  const pickupEvents: ItemKind[] = [];

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
  // Munição e proteção vão JUNTAS na foto (DECISÃO DO ORQUESTRADOR — o
  // COMBATE.md só manda restaurar as cargas; ver o respawn no player.ts):
  // como a sala recomeça inteira e os itens voltam pro chão, sem foto a
  // munição/proteção pega acumularia em cima dos itens revividos
  let arenaEntryAmmo = player.hatchetAmmo;
  let arenaEntryHasProtection = player.hasProtection;

  // Foto SIMÉTRICA pra sala 1: o COMBATE.md é omisso sobre as cargas lá —
  // DECISÃO DO ORQUESTRADOR (a revisar com o humano): morrer na sala 1
  // devolve as cargas que o jogador tinha AO ENTRAR nela, igual à regra da
  // arena. Hoje o jogo NASCE na sala 1, então a foto é tirada no arranque
  // (no final do startGame) e vale o startCharges do config (4)
  let sala1EntryCharges = player.healCharges;
  // Mesma extensão da foto da arena (decisão acima): munição 0 e sem
  // proteção no arranque, reafirmados no final do startGame
  let sala1EntryAmmo = player.hatchetAmmo;
  let sala1EntryHasProtection = player.hasProtection;

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
    bossEffects.object.visible = true;
    // inimigos não passam pra arena (COMBATE.md): somem junto com a sala 1,
    // e os desenhos deles no F1 também
    enemiesView.object.visible = false;
    debugView.showEnemies(false);
    // itens são da sala 1 (CENA3D.md): somem junto com ela. Não precisam de
    // desenho no F1 (só estáticos) e o update do view não roda fora da sala
    itemsView.object.visible = false;
    // machadinhas no ar não cruzam de sala: morrem todas na troca
    // (resetFight faz o mesmo na morte do jogador)
    hatchets.length = 0;
    player.placeAt(arena.spawn);
    // foto da entrada: cargas (COMBATE.md) + munição e proteção (decisão do
    // orquestrador, espelhada da sala 1)
    arenaEntryCharges = player.healCharges;
    arenaEntryAmmo = player.hatchetAmmo;
    arenaEntryHasProtection = player.hasProtection;
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
  //           com 300, sem Queda nem Devastador no ar (a luz vermelha, o
  //           símbolo e as veias apagam sozinhos na leitura do estado
  //           'sleep'; as faíscas já expiraram); flag do golpe rearmada.
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
    // machadinhas no ar não sobrevivem à morte do jogador, em qualquer sala
    // (o view remove os desenhos no sync do mesmo quadro)
    hatchets.length = 0;
    if (currentRoomId === 'arena') {
      player.respawn(arena.spawn, arenaEntryCharges, arenaEntryAmmo, arenaEntryHasProtection);
      boss.reset();
      attackHitDone = false;
    } else {
      player.respawn(sala1.spawn, sala1EntryCharges, sala1EntryAmmo, sala1EntryHasProtection);
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
      for (const enemy of enemies) {
        const spawn = enemySpawns.get(enemy);
        // o mapa cobre todos os inimigos por construção; a guarda é só pra
        // agradar o tipo do Map.get
        if (spawn) enemy.reset(spawn);
      }
      // ITENS VOLTAM também (COMBATE.md, "Morrer": "inimigos e itens
      // voltam" — Sprint 6): cada um ao spawn original da foto, vivo de
      // novo. O view mostra de graça, só lendo o alive no sync; o bobTime
      // não é mexido (onda contínua, ver items.ts). E como a foto da
      // munição/proteção do jogador é restaurada pelo respawn acima, item
      // nenhum se duplica: o que estava pego volta ao chão e o jogador
      // volta sem ele
      for (const item of items) {
        const spawn = itemSpawns.get(item);
        if (spawn) item.reset(spawn);
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

  // Arremesso e voo das machadinhas (COMBATE.md, Itens; Sprint 6, Tarefa
  // 2), no passo fixo. Separei num helper pra rodar IGUAL no 'playing' e no
  // 'victory' (lá o jogador continua controlável na arena e pode arremessar
  // à vontade — não há o que estragar: o chefe está morto e não há "sala
  // seguinte"). A munição é a de sempre, o F consumido é o de sempre
  function updateHatchets(dt: number): void {
    // O Player registrou o pedido no passo dele (ação instantânea, sem
    // estado nem custo — decisão no player.ts); aqui nasce o projétil já
    // com a direção travada. Vale nas duas salas
    const throwRequest = player.takeThrowRequest();
    if (throwRequest) {
      hatchets.push(new Hatchet(throwRequest.x, throwRequest.z, throwRequest.dirX, throwRequest.dirZ));
    }

    // Voo: anda com a colisão da sala ATIVA (muro e pilares seguram — o
    // corpo do chefe SAIU dos obstáculos do arena.json na Sprint 9, então
    // o teste dele é aqui embaixo, no bloco da arena). Morre por alcance
    // ou batida no hatchet.ts; por acerto ou corpo, aqui embaixo
    for (const hatchet of hatchets) {
      if (hatchet.alive) hatchet.update(dt, currentRoom.collision);
    }

    // Acerto: só na sala 1, onde existem inimigos (COMBATE.md: eles não
    // passam pra arena). 15 de dano por inimigo, NO MÁXIMO uma vez por
    // projétil — o impacto mata a machadinha na hora ("some depois de
    // arremessada").
    // DÚVIDA DO DOC, decidida: a machadinha NÃO fere o chefe. O COMBATE.md
    // silencia sobre isso, e furar a conta da luta (30 golpes de 10) seria
    // inventar balanceamento — a pergunta fica pro humano
    if (currentRoomId === 'sala1') {
      for (const hatchet of hatchets) {
        if (!hatchet.alive) continue;
        const hitbox = hatchet.hitbox();
        for (const enemy of enemies) {
          if (enemy.state !== 'alive') continue;
          if (rectsOverlap(hitbox, enemy.hurtbox())) {
            enemy.takeDamage(itemsCfg.hatchet.damage);
            hatchet.alive = false;
            break;
          }
        }
      }
    }

    // Corpo do chefe (COMBATE.md, Corpo: "empurra o jogador, mas encostar
    // não dá dano"): com o chefe fora do arena.json, o projétil
    // atravessaria ele — o "bateu no corpo" vira teste de círculo aqui.
    // A machadinha MORRE no impacto e NÃO fere o chefe (decisão acima: o
    // corpo só segura o projétil). Dormindo também: o corpo parado é
    // sólido. NO AR da Queda, o corpo não vale (COMBATE.md: "no ar não
    // colide com nada") — a machadinha passa reto por baixo dele
    if (currentRoomId === 'arena' && boss.state !== 'dead' && !boss.inAir) {
      const hitRange = itemsCfg.hatchet.radius + bossCfg.bodyRadius;
      for (const hatchet of hatchets) {
        if (!hatchet.alive) continue;
        const dx = hatchet.x - boss.x;
        const dz = hatchet.z - boss.z;
        if (dx * dx + dz * dz < hitRange * hitRange) {
          hatchet.alive = false;
        }
      }
    }

    // Fora os mortos (alcance, parede, impacto): o view remove os desenhos
    // deles no próximo sync, lendo a lista limpa
    for (let i = hatchets.length - 1; i >= 0; i--) {
      if (!hatchets[i].alive) hatchets.splice(i, 1);
    }
    // giro dos sprites a 10 fps (ESTILO, seção 8), no passo fixo
    hatchetsView.update(dt);
  }

  // Lógica no passo fixo de 60 Hz
  function update(dt: number): void {
    updateScreenShake(dt);

    if (gameState === 'playing') {
      // A fila de pickups (Sprint 6, Tarefa 1) só guarda o que ESTE passo
      // pegou: esvazia aqui e o teste de pisar preenche. A Tarefa 3 (caixa
      // de descrição) é quem vai drenar de verdade
      pickupEvents.length = 0;
      player.update(dt, currentRoom.collision);
      // Dano de teste da tecla H (só com F1 ligado), aplicado no passo fixo
      debugView.updateTestDamage(player, currentRoom.collision);

      if (currentRoomId === 'arena') {
        // O acordar mora aqui dentro: se o jogador pisou no círculo, o estado
        // sai de 'sleep' uma única vez (COMBATE.md, Acordar). A sala vai junto
        // porque o alvo da Queda precisa caber no chão andável (isFree, no
        // boss.ts) e o dano no jogador passa pelo takeDamage (empurrão com
        // colisão)
        boss.update(dt, player, currentRoom.collision);
        // Tremida do acerto (ESTILO, seção 2: golpe do chefe que PEGA —
        // Queda ou Devastador — 2 px, 120 ms; rolar por dentro não treme,
        // porque o boss só levanta a conta quando o takeDamage morde)
        if (boss.playerHitLanded) {
          startScreenShake(deathCfg.shake.bossHit.amplitudePx, deathCfg.shake.bossHit.duration);
        }
        // Tremida do IMPACTO da Queda (ESTILO, seção 2: "chefe caindo do
        // pulo", 3 px, 200 ms): INCONDICIONAL — é o chão tremendo na
        // aterrissagem, pegue o jogador ou não. Pode cair junto com a do
        // acerto no mesmo passo; o screen.ts fica com a mais forte
        if (boss.fallImpactTrigger) {
          startScreenShake(deathCfg.shake.bossFall.amplitudePx, deathCfg.shake.bossFall.duration);
        }
        // Tremida do ESTOURO do Devastador (ESTILO, seção 2: 4 px, 400 ms):
        // INCONDICIONAL — o círculo explode no chão, pegue o jogador ou
        // não. Se o estouro pegou, a tremida de acerto (2 px, 120 ms) do
        // mesmo passo é engolida pela mais forte, como já acontece com a
        // Queda
        if (boss.devastatorBurstTrigger) {
          startScreenShake(deathCfg.shake.devastatorBurst.amplitudePx, deathCfg.shake.devastatorBurst.duration);
        }
        // Golpe do jogador no chefe: só na fase ativa, só se a área de
        // acerto e a área que leva dano se tocarem no plano do chão E só
        // se o chefe PODE levar dano agora (hittable: acordado e no chão
        // — "no ar não leva dano", COMBATE.md). Sem a guarda do hittable,
        // um golpe no ar marcava attackHitDone sem ferir ninguém: a fase
        // ativa terminava "gasta" e a janela de punição da Queda ficava
        // mais curta sem querer
        const hitbox = player.getAttackHitbox();
        if (!hitbox) {
          attackHitDone = false;
        } else if (!attackHitDone && boss.hittable && rectsOverlap(hitbox, boss.hurtbox())) {
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
        // Rastro da barra do chefe (Sprint 7): no passo fixo, DEPOIS do dano
        // do jogador nele, pra ler a vida já batida deste passo — mesma razão
        // do updateHud mais abaixo. Só roda aqui na arena (o único lugar onde
        // o boss vive) e na 'victory'; na sala 1, na 'transition' e na 'dead'
        // o rastro congela junto com o jogo — mesma regra já adotada pro
        // rastro do jogador e pra caixa de descrição (ESTILO §9)
        updateBossHud(dt, boss);
      } else {
        // Sala 1: cada inimigo vivo anda e testa o próprio dano de encostar
        // DENTRO do update dele (recebe o jogador e a sala, como o boss faz
        // com a Queda) — o main só chama, sem decidir dano aqui. O morto
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
        // Pegar itens ao pisar (COMBATE.md, Itens: "pegos automaticamente
        // ao pisar neles, como no jogo original"). O teste (sobreposição de
        // círculos pé-do-jogador × círculo-do-item — decisão no items.ts)
        // vive no items.ts: aqui só se aplica o efeito de cada tipo nos
        // métodos do Player, e o tipo entra na fila de pickups pra Tarefa 3
        // (caixa de descrição). Guarda de vida: morto não pega item
        if (player.health > 0) {
          for (const item of items) {
            const kind = checkPickup(player, item);
            if (!kind) continue;
            if (kind === 'machadinha') player.addHatchet();
            else if (kind === 'protecao') player.equipProtection();
            else player.addHealCharge();
            pickupEvents.push(kind);
          }
          // Tarefa 3: a caixa de descrição consome a fila de pickups — cada
          // tipo entra uma vez (ela já ignora o que foi mostrado ou está
          // pendente; ver ui/item-description.ts). Como os itens só existem
          // na sala 1, a fila nunca recebe nada na arena
          for (const kind of pickupEvents) queueItemDescription(kind);
        }
        // Cronômetros visuais e faíscas da morte leem o estado DEPOIS do
        // dano do passo, pra explosão sair no mesmo instante da morte —
        // padrão do bossView.update lá embaixo, que também roda depois do
        // takeDamage do chefe
        enemiesView.update(dt, reducedMotion);
        // Balanço dos itens (ESTILO, seção 8): cronômetro no passo fixo,
        // como tudo que anima; o desenho em si é o sync() no draw
        itemsView.update(dt);
        // Sala 1: pé do jogador dentro do retângulo da "saida" (sala1.json,
        // exposto pela sala1-room) dispara a troca. A guarda de vida é pra
        // não "viajar morto": se um inimigo zerou a vida no mesmo passo, a
        // morte (logo abaixo) tem prioridade sobre a saída
        if (player.health > 0 && pointInRect(player, sala1.exit)) {
          startTransition();
        }
      }
      // Machadinhas em voo (Tarefa 2): nascem do pedido do jogador, voam e
      // acertam inimigos — nas duas salas, dentro de 'playing'
      updateHatchets(dt);
      // Cronômetro dos 4 s da caixa de descrição (Tarefa 3): roda aqui e na
      // 'victory'; congela na transição e na pausa de morte (decisão no
      // item-description.ts)
      updateItemDescription(dt);
      // Rastro de dano das barras (Sprint 7, ESTILO seção 9): cronômetros
      // no passo fixo, DEPOIS dos updates pra já ler o dano/cura deste
      // mesmo passo. Não roda na 'transition' nem na 'dead': o rastro
      // congela junto com o jogo, mesma regra da caixa de descrição
      updateHud(dt, player);
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
      // arena vazia até existir um reinício de verdade (Sprint 9) — e o F
      // continua gastando e voando machadinhas, como no 'playing'. O
      // cronômetro da caixa de descrição continua andando também, e o do
      // rastro de dano segue a mesma regra do 'playing'
      player.update(dt, currentRoom.collision);
      updateHatchets(dt);
      updateItemDescription(dt);
      updateHud(dt, player);
      // Chefe MORTO na vitória: o boss-hud realinha o rastro ao valor atual
      // (zero) de graça, e a barra nem é desenhada (boss.state !== 'awake')
      updateBossHud(dt, boss);
    }

    // Morte do jogador, processada no mesmo passo do dano (seja do chefe,
    // seja da tecla H de debug — inclusive na vitória): vida zerada entra
    // no estado de morte na hora. Sem animação de morte do jogador ainda
    // (Sprint 2 terminou sem ela): só congela e reseta
    if (gameState !== 'dead' && player.health <= 0) {
      gameState = 'dead';
      deathTime = 0;
    }

    // O Símbolo da Morte acompanha o chefe ACORDADO (CENA3D, Arena; ESTILO,
    // seção 6): acordou, o emissive dele pulsa e as veias clareiam junto com
    // a luz do chefe; dormindo (início e reset da luta) ou morto, o símbolo
    // volta ao entalhe escuro e as veias ao sangue seco. Chamada idempotente,
    // todo passo — quem decide é o boss.state, então 'sleep' e 'dead' apagam
    // sozinhos, sem caminho extra. Só existe na arena — na sala 1 o chefe
    // nem acorda (o update dele não é chamado)
    arena.setSymbolLit(boss.state === 'awake');
    bossView.update(dt, boss, reducedMotion);
    // Efeitos dos ataques do chefe (ESTILO, seção 7): no passo fixo, depois
    // do update do chefe, pra ler o estado já avançado deste passo — a
    // marca da queda nasce no mesmo passo em que a fase vira 'air'. Roda
    // fora do if do 'playing' de propósito: a leitura do fall só devolve
    // algo no ar da Queda, e nos outros estados (transição, pausa de morte,
    // vitória com chefe morto) os efeitos ficam invisíveis sozinhos
    bossEffects.update(dt, boss);
    // só a sala ativa anima (poeira, braseiros, símbolo); a outra fica
    // parada e invisível até a troca
    currentRoom.update(dt, reducedMotion);
    rig.update(dt, player, reducedMotion);
  }

  // Desenho uma vez por quadro do navegador
  function draw(): void {
    playerView.sync(player);
    bossView.sync(boss);
    enemiesView.sync();
    itemsView.sync();
    // o view das machadinhas reconcilia os desenhos com a lista aqui:
    // projétil morto (ou limpo na troca de sala/morte) some no mesmo quadro
    hatchetsView.sync(hatchets);
    debugView.sync(player, boss);
    renderer.render(scene, rig.camera);
    drawHud(hud, player);
    debugView.drawHud(hud);
    // Nome e barra do chefe (Sprint 7): DEPOIS do drawHud (que limpa o canvas
    // e desenha as barras do jogador) e ANTES da caixa de descrição — o fade
    // de sala, por último, cobre tudo como já é
    drawBossHud(hud, boss);
    // Caixa de descrição (Sprint 6, Tarefa 3): por cima do HUD, mas o fade
    // de sala cobre TUDO — inclusive ela (decisão comentada no drawItemDescription)
    drawItemDescription(hud);
    // Fade da troca de sala por cima de TUDO (HUD e debug), lendo só a
    // opacidade que o passo fixo calculou
    drawRoomFade(hud, fadeOpacity);
    applyScreenShake();
  }

  // O jogo começa na sala 1 (CENA3D): jogador no "inicio" (0, 4.6) do
  // sala1.json e câmera snapada. Como nascer aqui É a entrada na sala 1,
  // a foto das cargas da sala 1 é tirada agora (4 cargas do config) — e
  // junto a de munição/proteção (decisão espelhada nos lets acima). A da
  // arena só existe depois — tirada na chegada (enterArena, na transição)
  player.placeAt(sala1.spawn);
  sala1EntryCharges = player.healCharges;
  sala1EntryAmmo = player.hatchetAmmo;
  sala1EntryHasProtection = player.hasProtection;
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
