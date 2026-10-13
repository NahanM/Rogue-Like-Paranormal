// Números de ajuste do jogo. Tudo que se calibra jogando fica aqui.
// Mundo em unidades 3D (docs/CENA3D.md); HUD em pixels da tela de 480x270.
// Números em px do COMBATE.md entram divididos por PX_POR_UNIDADE.

// Resolução interna fixa (ESTILO, seção 1)
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

// Cor mais escura da paleta: fundo, bordas da janela e neblina
export const BACKGROUND_COLOR = '#050409';

// 1 unidade do mundo dá uns 18,7 px na tela, no centro da arena (ESTILO, seção 3)
export const PX_POR_UNIDADE = 18.7;

// Densidade de textura (ESTILO, seção 3): 32 texels a cada 1,71 unidade,
// o que dá 1 texel por pixel da tela. Uma textura de 16 px cobre metade disso.
export const TEXTURE_TEXELS_PER_TILE = 32;
export const TEXTURE_TILE_UNITS = 1.71;

// Câmera de ângulo fixo (ESTILO, seção 2)
export const camera = {
  fov: 30,
  near: 0.1,
  far: 120,
  // posição = alvo + deslocamento; o ângulo nunca muda
  offset: { x: 0, y: 21, z: 17 },
  // o alvo anda metade do que o jogador anda
  follow: 0.5,
  // o protótipo puxa o alvo 0,3 pra cima, pra sobrar mais chão na frente do jogador
  targetShiftZ: -0.3,
  // suavização 1 - e^(-k·dt)
  smoothing: 4,
};

// Protagonista
export const player = {
  // 75 px/s do COMBATE.md
  speed: 75 / PX_POR_UNIDADE,
  // raio do pé na colisão (CENA3D)
  radius: 0.32,
  // altura do billboard no mundo; o sprite tem 32 px de altura
  height: 1.8,
  spriteHeightPx: 32,
  maxHealth: 100,
  maxStamina: 100,
  // Regeneração de stamina (COMBATE.md, Protagonista): 30 por segundo,
  // começando 0,6 s depois do último gasto. Qualquer stamina acima de zero
  // deixa agir, e o gasto para no zero (nunca fica negativa) — regra lá no Player
  staminaRegenPerSecond: 30,
  staminaRegenDelay: 0.6,
  // Rolagem (COMBATE.md, Rolar): custo 25, percorre 48 px em 0,45 s com
  // velocidade constante, invencível de 0,10 a 0,35 s (limites inclusos)
  // e direção travada do começo ao fim
  roll: {
    cost: 25,
    duration: 0.45,
    distance: 48 / PX_POR_UNIDADE,
    invulnStart: 0.1,
    invulnEnd: 0.35,
  },
  // Ataque (COMBATE.md, Atacar): preparo 0,15 s, golpe com a área ativa por
  // 0,10 s, recuperação 0,30 s; sem combo — depois da recuperação pode atacar
  // de novo. Custa 20 de stamina. O dano no chefe (10) fica anotado aqui, mas
  // ainda não existe chefe pra receber (Sprint 3).
  // A área de acerto é um retângulo de 24x16 px colado na frente do personagem:
  // width é a largura (perpendicular ao olhar), depth a profundidade (na
  // direção do olhar), contada a partir da borda do raio de colisão.
  attack: {
    cost: 20,
    windup: 0.15,
    active: 0.1,
    recover: 0.3,
    damage: 10,
    width: 24 / PX_POR_UNIDADE,
    depth: 16 / PX_POR_UNIDADE,
  },
  // Cicatrizante (COMBATE.md, Cicatrizante): começa com 4 cargas, máximo 5.
  // Cura sorteada entre 25 e 50 (o jogo original também sorteava). Animação
  // de 1,0 s com a cura entrando aos 0,7 s; andando a 30% da velocidade
  // enquanto usa. Dano antes dos 0,7 s = carga perdida sem cura
  heal: {
    startCharges: 4,
    maxCharges: 5,
    healMin: 25,
    healMax: 50,
    duration: 1.0,
    healAt: 0.7,
    slowFactor: 0.3,
  },
  // Tomar dano (COMBATE.md, Tomar dano): empurrão de 6 px pra longe da fonte
  // e 0,4 s de invencibilidade depois do acerto. O flash branco do ESTILO,
  // seção 8, dura 2 frames de jogo a 60 Hz (= 2/60 s)
  hurt: {
    knockback: 6 / PX_POR_UNIDADE,
    invulnTime: 0.4,
    flashDuration: 2 / 60,
  },
  // andar de lado: 4 quadros a 10 fps (ESTILO, seção 8)
  walkFps: 10,
  // andar pra cima ou pra baixo: sobe e desce 1 px, trocando 8 vezes por segundo
  bobRate: 8,
  bobHeight: 1 / PX_POR_UNIDADE,
  shadow: { radius: 0.42, opacity: 0.55, color: '#050409' },
};

// Luzes (ESTILO, seção 6), já nos números do three r186 (luz física).
// O protótipo (ref/arena-3d.html) usa r128, onde a luz cai de outro jeito; estes valores
// foram calibrados com os dois abertos lado a lado, comparando o brilho do chão, do muro,
// das tampas dos pilares e do boneco. Depois o chefe foi baixado, porque na ref/arena.png
// o vermelho fica nas raízes e não inunda o chão.
// Fogo e chefe usam decay 1: com decay 2 (queda física), pra iluminar o chão a 3 unidades
// de distância a tampa do pilar, colada na luz, estourava de branco. Com 1, a poça de luz
// fica larga como no protótipo. A luz do chefe tem número alto porque, na conta física,
// vermelho escuro ilumina pouco.
export const lights = {
  ambient: { color: '#b8a8d0', intensity: 0.85 },
  brazier: {
    color: '#dd7530',
    intensity: 4.6,
    distance: 9.5,
    decay: 1,
    // altura da luz, um pouco acima da chama
    height: 3.1,
    // a cada 80 a 120 ms a luz sorteia um valor entre 88% e 112% da base
    flickerMin: 0.88,
    flickerMax: 1.12,
    flickerIntervalMin: 0.08,
    flickerIntervalMax: 0.12,
  },
  hand: {
    color: '#8e7ad0',
    intensity: 5.0,
    distance: 6.5,
    decay: 2,
    // 0,35 pro lado em que ele olha, a 0,9 de altura, um pouco pra frente
    side: 0.35,
    height: 0.9,
    forward: 0.25,
  },
  boss: {
    color: '#942c40',
    intensity: 40,
    // pulso lento: seno com amplitude de 25% da base (no protótipo, 1,6 ± 0,4)
    pulseFraction: 0.25,
    pulseSpeed: 1.6,
    distance: 10,
    decay: 1,
    height: 1.4,
  },
};

// Neblina (ESTILO, seção 6)
export const fog = { color: '#050409', near: 24, far: 44 };

// Partículas (ESTILO, seção 7)
export const particles = {
  dust: {
    count: 150,
    color: '#7f78a1',
    riseSpeed: 0.25,
    maxHeight: 6,
    // área em volta do centro da sala onde a poeira nasce
    spreadX: 26,
    spreadZ: 24,
    // balanço lateral, pra não subir em linha reta
    sway: 0.05,
  },
  embers: {
    perBrazier: 5,
    color: '#ffdd9b',
    riseSpeed: 0.9,
    // nascem na bacia e somem um pouco acima da chama
    startHeight: 2.8,
    maxHeight: 4.6,
    spread: 0.5,
  },
};

// HUD (ESTILO, seção 9), em pixels da tela de 480x270
export const hud = {
  health: { x: 8, y: 8, width: 100, height: 4, color: '#b03a48' },
  stamina: { x: 8, y: 14, width: 80, height: 3, color: '#5f8a45' },
  barBackground: '#0e0d16',
  outline: '#050409',
  // Legenda dos controles no canto de baixo à direita (longe da barra do chefe,
  // que vai de x90 a x390). Alinhada pela direita, crescendo de baixo pra cima.
  // A tecla C esconde e mostra. Só entra aqui o que já funciona no jogo
  controls: {
    rightX: 472,
    bottomY: 262,
    lineHeight: 8,
    keyColor: '#e2cab1',
    labelColor: '#7f78a1',
    // fundo escuro atrás do texto, pra ler em cima do chão iluminado
    backdrop: '#050409',
    backdropOpacity: 0.6,
    toggleKey: 'KeyC',
    lines: [
      ['WASD', 'ANDAR'],
      ['ESPAÇO', 'ROLAR'],
      ['J', 'ATACAR'],
      ['R', 'CURAR'],
      ['C', 'ESCONDER'],
    ] as ReadonlyArray<readonly [string, string]>,
  },
};

// Fonte pixel do HUD (ESTILO, seção 9): Silkscreen, licença OFL, com os acentos
// do português (ÇÃÉÊÕ testados). Tamanho 8 px, que é a grade de desenho dela
export const font = {
  family: 'Silkscreen',
  path: 'assets/fonts/Silkscreen-Regular.ttf',
  size: 8,
};

// Modo debug (F1)
export const debug = {
  // FPS no canto de cima à direita, longe das barras
  fpsRightX: 476,
  fpsY: 8,
  // linha de QA do player (estado/stamina/invencível), embaixo do FPS
  playerInfoY: 20,
  textColor: '#e2cab1',
  // linhas no chão (CENA3D, seção Debug)
  floorColor: '#7f78a1',
  obstacleColor: '#b03a48',
  playerColor: '#e2cab1',
  // área de acerto do ataque: ouro claro #fce6af, o "rastro de dano" da paleta
  // (ESTILO, seção 5) — cor quente pra não se confundir com as linhas de
  // colisão, que são frias
  attackColor: '#fce6af',
  // Tecla H (só com F1 ligado): dano de teste no jogador, com a fonte no
  // centro da arena (0, 0) — provisório até o chefe existir (Sprint 3),
  // porque hoje nada mais machuca o player. Serve pra conferir no olho o
  // empurrão pra longe do centro, a invencibilidade de 0,4 s e o flash
  testDamage: { amount: 10, sourceX: 0, sourceZ: 0 },
};

// Caminhos dos assets (relativos à pasta public/)
export const assetPaths = {
  playerSprites: {
    down: 'assets/protagonista_temp/baixo.png',
    up: 'assets/protagonista_temp/cima.png',
    side: 'assets/protagonista_temp/lado.png',
    walk1: 'assets/protagonista_temp/andar1.png',
    walk2: 'assets/protagonista_temp/andar2.png',
    walk3: 'assets/protagonista_temp/andar3.png',
    walk4: 'assets/protagonista_temp/andar4.png',
  },
  // Texturas finais (docs/ASSETS.md). Se o arquivo não existir, o jogo usa a gerada por código
  textures: {
    floor: 'assets/texturas/chao_pedra.png',
    wall: 'assets/texturas/parede_tijolo.png',
    cap: 'assets/texturas/tampa_pedra.png',
  },
};
