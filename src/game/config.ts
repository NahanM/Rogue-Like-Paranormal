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
  // Andar (ESTILO, seção 8): não existe animação de andar — só o parado/ de
  // cada personagem —, então o sprite parado sobe e desce 1 px a cada passo,
  // em QUALQUER direção, inclusive de lado. Troca 8 vezes por segundo; o
  // relógio é o walkTime do Player
  bobRate: 8,
  bobHeight: 1 / PX_POR_UNIDADE,
  shadow: { radius: 0.42, opacity: 0.55, color: '#050409' },
};

// Personagens em 8 direções do PixelLab (ESTILO, seção 3, tabela de
// escala). O tamanho do plano sai do PNG: lado = pngSize × scale ÷
// PX_POR_UNIDADE (32 × 1 ÷ 18,7 = 1,71 no protagonista). footLine é a
// LINHA DO PÉ NO PNG que fica em y = 0 no mundo — no protagonista, a 29,
// 2 px acima da borda de baixo. A linha é fixa por personagem (não por
// direção), pra o boneco não pular 1 px quando vira.
// Sprint 8, troca de arte: os quatro vêm da mesma tabela da seção 3,
// não se inventa aqui — e o tamanho do chefe na tela sai todo daqui
export const characters = {
  protagonista: { pngSize: 32, scale: 1, footLine: 29 },
  // Perturbado de Energia: 32x32, escala 1x, linha do pé 29 (ESTILO §3)
  perturbado: { pngSize: 32, scale: 1, footLine: 29 },
  // Mulher Afogada: 48x48, escala 1x, linha do pé 46 (ESTILO §3)
  mulher: { pngSize: 48, scale: 1, footLine: 46 },
  // Chefe (ESTILO, seção 3, tabela): PNG 48x48 em escala 1x — "o chefe
  // ficou em 1x, do tamanho da Mulher". Lado do plano = 48 × 1 ÷ 18,7 ≈
  // 2,57 un. Linha do pé no PNG 46: 1 px acima da borda de baixo
  chefe: { pngSize: 48, scale: 1, footLine: 46 },
};

// Chefe: O Deus da Morte (COMBATE.md, Chefe). Anda atrás do jogador
export const boss = {
  // Ponto de NASCIMENTO e reset do chefe: o centro do Símbolo da Morte,
  // em (0, -1,2) (CENA3D.md, Arena), onde ele dorme até o jogador entrar
  // no símbolo (COMBATE.md, Acordar) e pra onde volta ao morrer na arena
  // (COMBATE.md, "Morrer na arena"). A posição viva mora no boss.ts —
  // ele anda, este ponto é só a origem dele
  position: { x: 0, z: -1.2 },
  // Corpo que empurra o jogador (COMBATE.md, Corpo): círculo de raio
  // 20 px no pé. Colisão tratada no CÓDIGO (CENA3D.md, Arena: "o corpo
  // dele (raio 20 px = 1,07) é tratado no código"), porque o chefe saiu
  // dos obstáculos do arena.json ao começar a andar. Serve também de
  // raio de colisão dele com a sala na perseguição, e o mesmo círculo
  // resolve o empurrão do corpo (boss.ts), o teste da machadinha
  // (main.ts) e o desenho no F1 (debug.ts) — todos leem daqui
  bodyRadius: 20 / PX_POR_UNIDADE,
  // Velocidade da perseguição (COMBATE.md: 35 px/s, menos da metade do
  // jogador — dá pra fugir andando)
  speed: 35 / PX_POR_UNIDADE,
  // Distância de parada (COMBATE.md, Movimento: "para quando chega a
  // 30 px dele"). DECISÃO JÁ TOMADA: os 30 px são medidos entre os PÉS
  // dos dois, centro a centro (a borda do corpo do chefe fica a ~4 px
  // do pé do jogador parado, sem espremer)
  stopDistance: 30 / PX_POR_UNIDADE,
  // COMBATE.md: 300 de vida (30 golpes de 10)
  maxHealth: 300,
  // Acordar (COMBATE.md, Acordar): o jogador entra no círculo de ritual.
  // É a distância do pé do jogador até o centro do círculo (0, -1,2), igual
  // ao anel de ouro externo (raio 4,14 — CENA3D.md, Arena)
  wakeRadius: 4.14,
  // Área que leva dano (COMBATE.md, Chefe): retângulo de 40x30 px centrado
  // no pé, no plano do chão — x dá a largura e z a profundidade. Segue o
  // chefe, porque ele anda. Divergência antiga corrigida: o config
  // carregava 40x60, mas o doc manda 40x30
  hurtbox: {
    width: 40 / PX_POR_UNIDADE,
    depth: 30 / PX_POR_UNIDADE,
  },
  // Dano recebido: flash branco #f5effd por 2 frames de jogo (ESTILO, seção 8),
  // aplicado no boss-view.ts — mesmo padrão do player.hurt
  hurt: {
    flashDuration: 2 / 60,
  },
  // Andar (ESTILO, seção 8): não existe animação de andar — só o parado/,
  // então o sprite parado sobe e desce 1 px a cada passo, como nos outros
  // personagens. O relógio (walkTime) mora no boss-view, ligado pelo
  // `moving` do boss — mesmos bobRate/bobHeight dos inimigos
  bobRate: 8,
  bobHeight: 1 / PX_POR_UNIDADE,
  // Pausa entre ataques (COMBATE.md, Chefe): aleatória entre 1,2 e 2,0 s.
  // É a janela pra punir o chefe
  attackPause: { min: 1.2, max: 2.0 },
  // Escolha do ataque (COMBATE.md, Escolha do ataque), FINAL com a entrada
  // do Devastador: jogador a menos de 70 px do chefe (distância pé a pé),
  // 50% Queda / 50% Devastador; mais longe, Queda; NUNCA dois Devastadores
  // seguidos (memória do último ataque no boss.ts). nearRange separa
  // "perto" de "longe"; devastatorChanceNear é a fatia do Devastador no
  // sorteio de perto
  attackChoice: {
    nearRange: 70 / PX_POR_UNIDADE,
    devastatorChanceNear: 0.5,
  },
  // Ataque 1: Queda, o pulo (COMBATE.md, Ataque 1). Agachar 0,7 s parado
  // (o alvo trava NO FIM), voo em arco por 0,8 s (no ar não leva dano e
  // não colide com nada), impacto com a área ativa por 0,1 s e 0,9 s
  // preso no chão — a janela pra punir
  fall: {
    // Agachar: 0,7 s (COMBATE.md, tabela da Queda)
    crouch: 0.7,
    // No ar: 0,8 s
    air: 0.8,
    // Impacto (área ativa): 0,1 s
    impact: 0.1,
    // Preso no chão: 0,9 s
    stuck: 0.9,
    // Dano do impacto: 35
    damage: 35,
    // Área ativa: círculo de raio 40 px no ponto da queda
    radius: 40 / PX_POR_UNIDADE,
    // Empurrão de 18 px (COMBATE.md, "Dano e empurrão": a distância do
    // ataque no lugar dos 6 px padrão do "Tomar dano")
    knockback: 18 / PX_POR_UNIDADE,
    // Alcance máximo do pulo: 160 px — jogador mais longe, o chefe cai a
    // 160 px dele, na direção dele
    maxRange: 160 / PX_POR_UNIDADE,
    // Altura do arco: "subindo até 2 unidades" (COMBATE.md) — em UNIDADES
    // DO MUNDO, sem conversão: este número não vem em px do doc
    jumpHeight: 2,
  },
  // Ataque 2: Devastador (COMBATE.md, Ataque 2), que substituiu o golpe
  // em área antigo. Carga de 1,6 s PARADO com o círculo de aviso de raio
  // 100 px em volta dele escurecendo (o desenho é tarefa futura da
  // ESTILO, seção 7 — aqui é só a lógica), estouro com a área ativa por
  // 0,15 s no círculo inteiro centrado NELE e 1,4 s exausto — "a maior
  // janela pra punir da luta". Escape do doc: colado na borda do aviso
  // são 80 px a 75 px/s ≈ 1,07 s, sobra tempo na carga de 1,6 s; ou
  // rolar no estouro (a invencibilidade cobre os 0,15 s)
  devastator: {
    // Carga: 1,6 s (COMBATE.md, tabela do Devastador)
    charge: 1.6,
    // Estouro (área ativa): 0,15 s
    burst: 0.15,
    // Exausto: 1,4 s
    exhausted: 1.4,
    // Dano do estouro: 55
    damage: 55,
    // Área ativa: o círculo inteiro, raio 100 px em volta dele (COMBATE.md)
    radius: 100 / PX_POR_UNIDADE,
    // Empurrão de 24 px (COMBATE.md, "Dano e empurrão": a distância do
    // ataque no lugar dos 6 px padrão do "Tomar dano"). A fonte é o
    // próprio chefe no boss.ts — o círculo é em volta dele
    knockback: 24 / PX_POR_UNIDADE,
  },
  // sombra redonda no chão (ESTILO, seção 4): raio 0,6 no chefe, igual ao
  // da Mulher — os quatro personagens seguem a seção 4 (0,42 no protagonista
  // e no Perturbado). Opacidade 55% e cor continuam as mesmas
  shadow: { radius: 0.6, opacity: 0.55, color: '#050409' },
};

// Efeitos visuais dos ataques do chefe (ESTILO, seção 7, "Efeitos do
// chefe"). São desenho puro e moram no boss-effects.ts; os números de cada
// efeito vêm daqui — as próximas tarefas da Sprint 9 acrescentam os
// sub-blocos dos outros efeitos (anel de choque, lascas, poeira do
// impacto...) neste mesmo bloco
export const bossEffects = {
  // Marca da queda (ESTILO, seção 7, "Queda (o pulo)": "No alvo aparece a
  // marca da queda: círculo #050409 que cresce de 20% a 100% do raio do
  // impacto durante o voo, com um anel #942c40 na borda que pisca a cada
  // 0,1 s nos últimos 0,3 s"). Ela é AVISO DE JOGABILIDADE (mostra pra
  // onde fugir, COMBATE.md: "sair da marca do chão andando"), não enfeite:
  // por isso NÃO atende ao "reduzir movimento" — o ESTILO, seção 7, só
  // isenta tremida e piscada da tela
  mark: {
    // círculo escuro da marca (ESTILO §7)
    color: '#050409',
    // anel fino na borda do círculo (ESTILO §7)
    ringColor: '#942c40',
    // opacidade do círculo: o doc não dá; 0,65 pra ler bem em cima do
    // chão iluminado (entre a sombra de 55% e o preto cheio)
    opacity: 0.65,
    // "cresce de 20% a 100% do raio do impacto": fração do raio no começo
    // do voo; o update interpola até 1
    growthStart: 0.2,
    // "pisca a cada 0,1 s": passo da alternância visível/invisível do anel
    blinkEvery: 0.1,
    // "nos últimos 0,3 s": janela antes da aterrissagem em que o anel existe
    blinkWindow: 0.3,
    // altura sobre o chão: acima dos decalques existentes da arena (poças
    // 0,01, símbolo 0,02, veias 0,03), pra não brigar de z-fighting — e
    // abaixo das linhas do F1 (0,05)
    y: 0.04,
  },
  // Círculo de aviso do Devastador (ESTILO, seção 7, "Devastador"): carga
  // de 1,6 s com o círculo de raio 100 px em volta dele (COMBATE.md,
  // Ataque 2) "escurecendo" — o escurecer é DITHERING em três degraus
  // (25%, 50%, 75% dos pixels), um terço da carga cada. Como a marca, é
  // AVISO DE JOGABILIDADE (mostra até onde o estouro pega): por isso NÃO
  // atende ao "reduzir movimento" — o ESTILO, seção 7, só isenta tremida
  // e piscada da tela. O raio continua vindo do boss.devastator.radius:
  // aqui é só o visual
  warning: {
    // faixa de pixels do dither: o escuro da paleta (ESTILO, seção 5)
    color: '#050409',
    // os três degraus do doc, um por terço da carga
    densities: [0.25, 0.5, 0.75],
    // altura sobre o chão: a MESMA da marca da queda — os dois decalques
    // nunca coexistem (só um ataque roda por vez), então não brigam de
    // z-fighting; segue acima dos decalques da arena (poças 0,01,
    // símbolo 0,02, veias 0,03)
    y: 0.04,
  },
  // Rastro da Queda (ESTILO §7, Saída): 3 cópias do sprite pelo caminho com
  // 30%, 20% e 10% de opacidade, que somem em 0,2 s na aterrissagem.
  // spacing: distância em SEGUNDOS DE VOO entre o chefe e cada cópia
  // (o doc não dá; calibrável)
  trail: {
    opacities: [0.3, 0.2, 0.1],
    spacing: 0.08,
    fadeOut: 0.2,
  },
  // Poeira dos pés no agachar (ESTILO §7: "#7f78a1 sobe dos pés").
  // Taxa/vida/velocidade o doc não dá — calibráveis aqui
  crouchDust: {
    color: '#7f78a1',
    perSecond: 30,
    lifetime: 0.6,
    riseSpeed: 0.5,
    spread: 0.4, // raio em volta do pé onde nasce
    pool: 40,
  },
  // Decalques do impacto da Queda (ESTILO §7, "Impacto"): "Rachadura no
  // chão (linhas #050409 tortas saindo do ponto, gerada por código) que
  // some em 4 s. Mancha de lodo #1d0f12 que fica 6 s". Nascem no ponto da
  // aterrissagem (fall.targetX/targetZ) e têm vida própria, cruzando as
  // fases do ataque. Pool = quantos podem coexistir: a Queda pode voltar
  // antes de a mancha anterior expirar (o ciclo mínimo entre pulos é ~2,7
  // s — pausa de 1,2 + agachar 0,7 + voo 0,8 — e o lodo dura 6 s), então
  // o re-disparo recicla o slot mais antigo
  impactDecals: {
    crack: {
      // cor das linhas (doc, ESTILO §7)
      color: '#050409',
      // polilinhas por rachadura, saindo do ponto — o doc não dá; 6 lê
      // como rachadura sem virar estrela (calibrável)
      lines: 6,
      // trechos de cada polilinha — o doc não dá; 2 a 5 (calibrável)
      segments: { min: 2, max: 5 },
      // comprimento das linhas, em unidades, saindo do ponto — o doc não
      // dá; calibrável. 0,5 a 1,2 ≈ metade do raio do impacto (2,14) até
      // um pouco menos dele
      length: { min: 0.5, max: 1.2 },
      // tortuosidade das dobras (mesmo papel do wander das veias do
      // kit.ts) — o doc não dá; calibrável
      wander: 0.2,
      // "some em 4 s" (doc): a opacidade derrete em linha reta durante os
      // 4 s inteiros, do 1 ao 0
      fadeDuration: 4,
      // altura sobre o chão: acima das poças permanentes (0,01) e abaixo
      // do símbolo (0,02), pra não brigarem de z-fighting — escolha de
      // camada, os mesmos respiros do kit
      y: 0.015,
      // Quedas seguidas: 3 cobrem o derreter de 4 s (a rachadura vencida
      // já está invisível quando o slot volta)
      pool: 3,
    },
    sludge: {
      // cor do miolo da mancha (doc, ESTILO §7)
      fill: '#1d0f12',
      // borda: a dupla de lodo das poças da arena (CENA3D, Arena)
      border: '#412e29',
      // raio da mancha, em unidades — o doc não dá; um pouco menor que o
      // das poças permanentes (0,4 a 1,2 no kit), o impacto respinga
      radius: { min: 0.5, max: 0.9 },
      // "fica 6 s" (doc): dura inteira e some — sem fade
      duration: 6,
      // altura sobre o chão: acima das poças permanentes (0,01) e abaixo
      // da rachadura (0,015), os mesmos respiros de camada do kit
      y: 0.012,
      // a Queda volta em ~2,7 s e o lodo dura 6 s: 3 cobrem até 3
      // aterrissagens vivas ao mesmo tempo
      pool: 3,
    },
  },
  // Poses do sprite do chefe (ESTILO, seção 7: ainda não existe animação
  // desenhada dele, a pose vem do CÓDIGO — achatar, esticar e tremer o
  // plano; sprite nunca é girado, seção 3, e a origem no pé segura a
  // linha do pé no chão). Os fatores multiplicam o tamanho normal:
  // 1 = sem pose, o desenho fica exatamente como fora de ataque
  poses: {
    // Queda/Agachar, a fase inteira: "o sprite achata (altura 85%,
    // largura 110%, sempre com o pé no chão) e treme 1 px pros lados"
    crouch: { height: 0.85, width: 1.1, tremblePx: 1 },
    // Queda/Saída: "estica (altura 115%, largura 90%) por 0,1 s e volta
    // ao normal no ar" — vale só no comecinho da fase 'air'
    takeoff: { height: 1.15, width: 0.9, duration: 0.1 },
    // Queda/Impacto: "achata a 70% de altura por 0,1 s e volta" — a fase
    // 'impact' dura exatamente os 0,1 s, então o fator vale por ela toda
    impact: { height: 0.7 },
    // Devastador/Carga: tamanho normal, "o tremor do sprite cresce de 0
    // a 2 px" LINEARMENTE com o progresso da carga
    charge: { trembleMaxPx: 2 },
    // Devastador/Exausto: "ele fica curvado (altura 92%)" — só a altura,
    // largura normal (as faíscas devagar são outro efeito)
    exhausted: { height: 0.92 },
    // cadência da alternância do lado do tremor (+1/−1 a cada 1/trembleHz
    // s). O doc não diz — 30 Hz lê como vibração de verdade
    trembleHz: 30,
  },
};

// Inimigos comuns da sala 1 (COMBATE.md, "Inimigos comuns"; ESTILO, seções
// 3 e 8): os dois tipos do jogo original. O Perturbado anda sem rumo e
// machuca ao encostar; a Mulher persegue, ataca num ciclo de preparo/golpe/
// espera e foge ferida. Ambos tomam dano do ataque do jogador e morrem em
// faíscas (Tarefa 2). Inimigo morto não volta até o jogador morrer na sala
// 1: aí o main chama o reset() de cada um ("recomeça a sala inteira")
export const enemies = {
  perturbado: {
    // Vida (COMBATE.md): 20 — morre em 2 golpes de 10
    maxHealth: 20,
    // Velocidade (COMBATE.md): 30 px/s, convertidos como tudo que vem de lá
    speed: 30 / PX_POR_UNIDADE,
    // Movimento (COMBATE.md): ignora o jogador — anda numa direção aleatória
    // e troca a cada intervalo sorteado entre 0,8 e 1,6 s
    directionChange: { min: 0.8, max: 1.6 },
    // Dano (COMBATE.md): só por encostar, 10. Entra pelo player.takeDamage,
    // que resolve empurrão, invencibilidade de 0,4 s e flash do jogador —
    // e NÃO dispara tremida de tela (ESTILO, seção 2: tremida só existe pro
    // chefe)
    touchDamage: 10,
    // Área de dano (COMBATE.md): retângulo de 14x14 px centrado no PÉ dele,
    // no plano do chão. DÚVIDA DO DOC, decidida: o doc diz "14x14" e
    // "encostar" sem definir o corpo do jogador — usamos o quadrado do raio
    // de colisão (2 × player.radius = 0,64 un de lado) centrado no pé como
    // o "corpo" do jogador
    touchArea: 14 / PX_POR_UNIDADE,
    // DÚVIDA DO DOC, decidida (o COMBATE.md não dá raio pro inimigo): raio
    // de colisão com a sala igual ao do jogador, 0,32 — os corpos têm porte
    // parecido (24 px dele vs 32 do protagonista). E inimigos NÃO colidem
    // entre si nem com o jogador como corpo rígido: no original era jogo
    // de grade; aqui o único efeito do toque é a área de dano acima
    radius: 0.32,
    // Andar (ESTILO, seção 8): não há sprite de andar, só o parado — o
    // sprite parado sobe e desce 1 px a cada passo, 8 vezes por segundo.
    // Mesmos bobRate/bobHeight do bloco `player` (o relógio mora no view)
    bobRate: 8,
    bobHeight: 1 / PX_POR_UNIDADE,
    // Sombra no chão (ESTILO, seção 4): raio 0,42, o mesmo do protagonista
    shadow: { radius: 0.42, opacity: 0.55, color: '#050409' },
    // Dano recebido: flash branco #f5effd por 2 frames de jogo (ESTILO,
    // seção 8), mesmo padrão do player.hurt e do boss.hurt. SEM empurrão no
    // inimigo: o COMBATE só define empurrão pro jogador
    hurt: { flashDuration: 2 / 60 },
    // "Forma plasmática inconsistente" (ESTILO, seção 8): a OPACIDADE do
    // billboard oscila entre 60% e 80%, trocando a cada 0,2 s com um valor
    // sorteado no intervalo. É só dele: a mulher não oscila
    opacity: { min: 0.6, max: 0.8, changeEvery: 0.2 },
  },
  // Mulher Afogada (COMBATE.md, Inimigos comuns): "moderada, caçadora" —
  // persegue enquanto está saudável e foge quando está ferida. SEM
  // oscilação de opacidade: ela é matéria, não plasma (ESTILO, seção 8)
  mulher: {
    // Vida (COMBATE.md): 40 — 4 golpes de 10
    maxHealth: 40,
    // Percepção (COMBATE.md): percebe o jogador a 120 px, distância pé-a-pé.
    // DÚVIDA DO DOC, decidida no enemies.ts: antes de ver, PARADA no
    // spawn; uma vez que viu, sabe SEMPRE onde ele está — a sala é pequena,
    // não inventamos "esquecer"
    noticeRange: 120 / PX_POR_UNIDADE,
    // Perseguição (COMBATE.md): 55 px/s — mais lenta que o jogador (75),
    // dá pra fugir dela
    chaseSpeed: 55 / PX_POR_UNIDADE,
    // Ataque (COMBATE.md): golpe curto — preparo de 0,5 s, alcance de
    // 20 px, 15 de dano e depois 1,0 s de espera parada. DÚVIDA DO DOC,
    // decidida no enemies.ts: "alcance de 20 px" lido como CÍRCULO ao
    // redor do pé (o doc não diz cone), testado no instante do golpe.
    // O dano entra pelo player.takeDamage: empurrão, invencibilidade e
    // flash saem de graça — e a tela NÃO treme (ESTILO, seção 2)
    windup: 0.5,
    attackRange: 20 / PX_POR_UNIDADE,
    damage: 15,
    cooldown: 1.0,
    // Fuga (COMBATE.md): abaixo de 40% de vida (16 de 40) foge a 60 px/s;
    // encurralada a menos de 20 px, ataca mesmo assim, pelo MESMO ciclo
    fleeBelowFraction: 0.4,
    fleeSpeed: 60 / PX_POR_UNIDADE,
    // DÚVIDA DO DOC (mesma linha da Tarefa 1): raio de colisão com a sala
    // igual ao do jogador, 0,32; sem colisão de corpo rígido com nada
    radius: 0.32,
    // Hurtbox (DÚVIDA DO DOC, extensão da decisão da Tarefa 1): quadrado
    // de 16x16 px no pé — o porte do sprite (16x32, como o protagonista)
    hurtbox: 16 / PX_POR_UNIDADE,
    // Andar (ESTILO, seção 8): mesmo bob do player e do perturbado — o
    // sprite parado sobe e desce 1 px a cada passo, 8 vezes por segundo,
    // ligado pelo `moving` dela no view
    bobRate: 8,
    bobHeight: 1 / PX_POR_UNIDADE,
    // Sombra (ESTILO, seção 4): raio 0,6 — porte maior que o do protagonista
    shadow: { radius: 0.6, opacity: 0.55, color: '#050409' },
    // Flash de dano: mesmo padrão de todos (ESTILO, seção 8). SEM
    // empurrão nela: o COMBATE só define empurrão pro jogador
    hurt: { flashDuration: 2 / 60 },
  },
};

// Itens no chão da sala 1 (COMBATE.md, "Itens"; ESTILO, seções 3, 4 e 8) —
// Sprint 6. Pegos automaticamente ao pisar ("como no jogo original"): a sala
// só os posiciona, o items.ts testa o "pisar" e o main aplica o efeito no
// Player. Item pego some do chão; morrer na sala 1 recomeça a sala inteira e
// eles voltam (COMBATE.md, "Morrer")
export const items = {
  // Pegar ao pisar: DÚVIDA DO DOC, decidida (o COMBATE.md diz "pegos ao
  // pisar" sem definir o "pisar"). Fica a sobreposição de CÍRCULOS no plano
  // do chão: o pé do jogador (player.radius, 0,32) contra o círculo do item
  // com ESTE raio. 0,25 ≈ metade do lado do desenho (0,45 un, ESTILO seção
  // 3): pegar pede o pé quase em cima do item (~0,57 un de alcance somado),
  // em vez de sugar de longe ou exigir precisão de pixel
  pickupRadius: 0.25,
  // Tamanho do billboard (ESTILO, seção 3): item no chão = 8x8 px na tela,
  // ~0,45 un de lado no mundo. Quadrado: o mesmo número pra largura e pra
  // altura, e a altura vai multiplicada por BILLBOARD_STRETCH no item-view
  size: 8 / PX_POR_UNIDADE,
  // Balanço (ESTILO, seção 8: "Item no chão: sobe e desce 1 px a cada 0,5
  // s"). Mesma receita do balanço do andar do jogador (player.bobHeight): o
  // deslocamento vertical no mundo é multiplicado por BILLBOARD_STRETCH no
  // view, pra renderizar exatamente 1 px na tela
  bobHeight: 1 / PX_POR_UNIDADE,
  bobPeriod: 0.5,
  // Machadinha (COMBATE.md, Itens): "Munição: carrega até 5. F arremessa na
  // direção em que o jogador olha, a 200 px/s, com alcance de 64 px. Dano
  // 15. A machadinha some depois de arremessada" — a munição é da Tarefa 1;
  // o arremesso e o projétil são a Tarefa 2
  hatchet: {
    maxAmmo: 5,
    // 200 px/s de voo e 64 px de alcance (≈ 3,42 un), convertidos como tudo
    // que vem do COMBATE.md. O alcance é medido na distância percorrida
    speed: 200 / PX_POR_UNIDADE,
    range: 64 / PX_POR_UNIDADE,
    // Dano 15. DÚVIDA DO DOC, fica pro humano: a tabela diz "Dano 15 (mata
    // um Perturbado de uma vez)", mas o Perturbado tem 20 de vida — 15
    // deixa 5 (a Mulher, com 40, leva 3). Segue o NÚMERO da tabela; a nota
    // entre parênteses parece desatualizada
    damage: 15,
    // Raio de colisão do projétil com a sala (parede, pilares, corpo do
    // chefe): metade do lado do sprite (~0,21 un) — a cara do desenho
    radius: 8 / PX_POR_UNIDADE / 2,
    // Altura do voo: DÚVIDA DO DOC, decidida (o doc não diz) — o pé do
    // billboard flutua a 0,6 un do chão, meia altura do corpo do jogador
    // (1,8): por cima dos itens do chão e da altura dos pés dos inimigos,
    // onde um arremesso lê "voador". SEM sombra deitada: os itens parados
    // já não têm (decisão da Tarefa 1, item-view.ts)
    flyHeight: 0.6,
    // Giro em voo (ESTILO, seção 8: "Machadinha em voo: 4 frames de giro
    // desenhados", sprites a 10 fps). São 4 SPRITES trocados — o objeto
    // nunca é girado no código (ESTILO, seção 3)
    spinFps: 10,
  },
  // Proteção Leve (COMBATE.md, Itens): "Reduz todo dano recebido em 25%",
  // equipada sozinha ao pegar. Aplicada no player.takeDamage
  protection: {
    damageReduction: 0.25,
  },
};

// Morte e respawn (COMBATE.md, "Morrer"; ESTILO, seções 2, 7 e 8) —
// Tarefa 5 da Sprint 3. A tela de morte/vitória é Sprint 9: por ora a
// derrota é um reset direto da luta e a vitória um estado parado
export const death = {
  // Pausa entre a vida do jogador zerar e a volta na entrada da arena.
  // PROVISÓRIO: não existe animação de morte do jogador ainda, então ele
  // só fica congelado onde caiu durante este tempo
  playerRespawnDelay: 1.5,
  // Ponto de respawn: a "chegada" do arena.json (0, 9.4 — CENA3D.md). O
  // main lê do Room.spawn, que já é a fonte única do número — não duplicar
  // Faíscas da morte do chefe (ESTILO 8: "sem animação desenhada", é
  // código): pontos de 1 px nas duas cores de faísca travadas (ESTILO
  // 5/7), explodindo do miolo do corpo pra fora e pra cima e apagando
  // em linha reta até o fim
  bossSparks: {
    count: 90,
    duration: 0.6,
    colors: ['#cf9ba3', '#eeb4c5'],
    // corpo 1x (ESTILO, seção 3): ~47 linhas visíveis do PNG ≈ 2,51 un de
    // altura (47 ÷ 18,7); miolo = metade ≈ 1,26. A regra "o miolo é a
    // metade" continua valendo — mesma fórmula do footLine no enemy-view:
    // (48 ÷ 18,7) × 47/48 ÷ 2
    originHeight: 1.26,
    // deslocamento inicial em volta do miolo, pra explosão nascer com volume
    spread: 0.9,
    horizontalSpeed: { min: 1.5, max: 4.0 },
    riseSpeed: { min: 2.0, max: 5.5 },
  },
  // Faíscas da morte dos INIMIGOS comuns (ASSETS.md: "Morrer: some em
  // faíscas no código", vale pros dois inimigos). A explosão é menor em
  // contagem e velocidade (~30 pontos contra 90 nele, deslocamento e
  // velocidades mais curtos): os inimigos são menores que o chefe no
  // restante (o Perturbado tem PNG 32x32; a Mulher tem o mesmo PNG do
  // chefe — corpo dele ~2,5 un, ver death.bossSparks agora corrigido).
  // duration igual (0,6 s): é o tempo de LEITURA da morte, não do tamanho
  // do corpo
  // DÚVIDA DO DOC, decidida: a única paleta de faísca do ESTILO (seções
  // 5/7) é a do chefe (#cf9ba3/#eeb4c5) — os inimigos a reutilizam em vez
  // de inventar cor nova
  // originHeight NÃO fica aqui: depende do PNG de cada bicho — o miolo é a
  // metade da altura da linha do pé ao topo do sprite (conta do footLine,
  // no enemy-view) — então o view deriva do PRÓPRIO personagem ao montar
  // as faíscas dele
  enemySparks: {
    count: 30,
    duration: 0.6,
    colors: ['#cf9ba3', '#eeb4c5'],
    spread: 0.5,
    horizontalSpeed: { min: 1.0, max: 2.5 },
    riseSpeed: { min: 1.5, max: 3.5 },
  },
  // Tremida de tela (ESTILO, seção 2): os 4 casos do jogo inteiro — golpe
  // do chefe que acerta (2 px, 120 ms), chefe caindo do pulo (3 px,
  // 200 ms), estouro do Devastador (4 px, 400 ms) e morte do chefe
  // (3 px, 400 ms). Amplitude em pixels da tela de 480x270, aplicada na
  // moldura (3D e HUD andam juntos) pelo engine/screen.ts
  shake: {
    // golpe do chefe que acerta (Queda ou Devastador; rolar por dentro não treme)
    bossHit: { amplitudePx: 2, duration: 0.12 },
    // chefe caindo do pulo (ESTILO §2: "chefe caindo do pulo", 3 px, 200 ms)
    bossFall: { amplitudePx: 3, duration: 0.2 },
    // estouro do Devastador (ESTILO §2: 4 px, 400 ms), INCONDICIONAL —
    // o chão explode, pegue o jogador ou não
    devastatorBurst: { amplitudePx: 4, duration: 0.4 },
    // morte do chefe (ESTILO §2: 3 px, 400 ms)
    bossKill: { amplitudePx: 3, duration: 0.4 },
  },
};

// Troca de sala (CENA3D.md, Sala 1: "Passou pela saída: a tela escurece em
// 0,3 s"). A transição são dois destes tempos: escurece até o preto, troca
// de sala, e clareia de volta no mesmo tempo — o doc só manda escurecer;
// clarear em 0,3 s também é a leitura simétrica, decidida no main.ts.
// A cor do fade é o BACKGROUND_COLOR (preto da paleta), reaproveitado no
// hud.ts em vez de duplicar aqui
export const roomTransition = {
  fadeTime: 0.3,
};

// Arena: Símbolo da Morte e veias do chão (CENA3D, Arena; ESTILO, seção 6).
// O símbolo NÃO tem luz de verdade: o brilho é todo do emissive, que com o
// chefe acordado pulsa entre 30% e 100% num ciclo de 2 s. As veias pulsam
// junto com a luz do chefe (lights.boss, logo abaixo), clareando do sangue
// seco até o sangue vivo
export const arena = {
  symbol: {
    // dormindo, "entalhado na pedra" (CENA3D): pedra arroxeada da paleta,
    // sem brilho (emissive preto)
    sleepColor: '#2b2234',
    // acordado: sangue da paleta (ESTILO, seção 5) na cor e no emissive
    awakeColor: '#942c40',
    // o emissive pulsa entre 30% e 100% (ESTILO, seção 6)
    pulseMin: 0.3,
    pulseMax: 1,
    // ciclo de 2 s (ESTILO, seção 6)
    pulsePeriod: 2,
    // veias (CENA3D, Arena): sangue seco dormindo; acordadas, clareiam até
    // o sangue vivo
    veinsSleepColor: '#540b1a',
    veinsAwakeColor: '#942c40',
  },
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
    // a 2,5 de altura (ESTILO, seção 6, tabela de luzes)
    height: 2.5,
    // dormindo ou morto, a luz fica apagada; acende só acordado (o
    // boss-view lê o estado a cada passo: reset da luta e morte apagam)
    sleepIntensity: 0,
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
  // Rastro de dano das barras (ESTILO, seção 9: "a parte perdida fica em
  // ouro claro e esvazia depois de 0,5 s"). Ouro claro travado da paleta
  // (ESTILO, seção 5). O atraso conta A PARTIR DA ÚLTIMA QUEDA: sem ele, a
  // fatia perdida sumiria no mesmo instante do dano e não daria pra ler o
  // quanto se perdeu. A lógica (segurar, esperar, esvaziar de uma vez) mora
  // no ui/hud.ts
  trailColor: '#fce6af',
  trailDelay: 0.5,
  // Nome e barra do chefe (ESTILO, seção 9, tabela: nome em x90 y238 com a
  // fonte de 8 px; barra em x90 y248, 300x4; e a nota de barras vale pra ela
  // também: contorno de 1 px, preenchimento sólido e rastro de dano — que sai
  // dos campos gerais trailColor/trailDelay acima e do updateTrail do hud.ts)
  boss: {
    // O nome vem do LORE.md ("O Deus da Morte"), que o doc manda pra barra e
    // pra faixa de entrada (a faixa é outra tarefa da Sprint 7)
    name: 'O Deus da Morte',
    nameX: 90,
    nameY: 238,
    // bege do texto da paleta UI (ESTILO §5), o mesmo das teclas da legenda
    textColor: '#e2cab1',
    bar: {
      x: 90,
      y: 248,
      width: 300,
      height: 4,
      // DÚVIDA DO DOC, decidida: o §9 não dá cor pra barra do chefe — leitura
      // da regra geral de barras + paleta UI: usa o vermelho de vida '#b03a48',
      // a mesma da barra do jogador
      color: '#b03a48',
    },
    // Faixa de entrada do chefe (ESTILO, seção 9: "faixa preta com 70% de
    // opacidade, 24 px de altura, no meio da tela, com o nome centralizado.
    // Aparece em 0,5 s, fica 2 s, some em 0,5 s"). A largura é a tela
    // inteira (GAME_WIDTH, no boss-hud.ts) e o "meio da tela" vira
    // (GAME_HEIGHT - height) / 2 lá no módulo — é layout derivado da regra,
    // não número de ajuste novo. O nome é o `name` acima (LORE.md). O estado
    // (cronômetro + borda de acordar) mora no ui/boss-hud.ts
    banner: {
      height: 24,
      opacity: 0.7,
      color: BACKGROUND_COLOR, // '#050409', o preto da paleta (ESTILO 5)
      fadeIn: 0.5,
      hold: 2,
      fadeOut: 0.5,
    },
  },
  // Indicadores de item (ESTILO, seção 9, tabela). Ainda NÃO existem sprites
  // de ícone em public/assets/: cada indicador é um placeholder — retângulo
  // do tamanho exato da tabela, numa cor da paleta (seção 5), com o mesmo
  // contorno de 1 px das barras (hud.outline, reusado no hud.ts). Quando os
  // ícones finais chegarem, posição e tamanho já valem; só o desenho muda
  healCharges: {
    // Cicatrizantes: "x8 y254, um a cada 8 px", 6x8 cada. spacing é o passo
    // entre o COMEÇO de um ícone e o do próximo (sobram 2 px de respiro)
    x: 8,
    y: 254,
    width: 6,
    height: 8,
    spacing: 8,
    // vermelho da vida (seção 5, UI), porque é o remédio que cura
    color: '#b03a48',
  },
  protection: {
    // Proteção Leve: "x8 y20", 8x8, e o doc é explícito: "só se tiver"
    x: 8,
    y: 20,
    size: 8,
    // couro claro da rampa do personagem (seção 5): é uma jaqueta de couro
    color: '#5c4033',
  },
  hatchet: {
    // Machadinhas: "ícone em x56 y254, número ao lado", 8x8
    x: 56,
    y: 254,
    size: 8,
    // pedra clara (seção 5): a lâmina
    color: '#7f78a1',
    // folga entre o ícone e o número da munição; a cor do número NÃO fica
    // aqui: reusa hud.controls.keyColor (#e2cab1, texto da paleta) no hud.ts
    numberGap: 2,
  },
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
      ['F', 'MACHADINHA'],
      ['R', 'CURAR'],
      ['C', 'ESCONDER'],
    ] as ReadonlyArray<readonly [string, string]>,
  },
  // Caixa de descrição de item (ESTILO, seção 9: "centralizada, y196,
  // 300x44"; "fundo #050409 com 85% de opacidade, contorno de 1 px #4c3d4c,
  // nome do item em #fce6af e texto em #e2cab1", "some depois de 4 s").
  // Abre na primeira vez que se pega cada tipo (COMBATE.md, Itens); os
  // textos são os do LORE.md e o estado (fila, cronômetro, o que já foi
  // visto) mora no ui/item-description.ts
  itemDescription: {
    x: 90, // centralizada na tela de 480: (480 − 300) / 2
    y: 196,
    width: 300,
    height: 44,
    duration: 4,
    background: BACKGROUND_COLOR, // '#050409', o preto da paleta (ESTILO 5)
    backgroundOpacity: 0.85,
    outline: '#4c3d4c', // pedra clara da rampa (ESTILO 5), contorno de 1 px
    nameColor: '#fce6af', // ouro claro travado (ESTILO 5)
    textColor: '#e2cab1', // bege do texto (ESTILO 5)
    // respiro do texto pras bordas internas da caixa
    padding: 4,
    // passo entre linhas: nome + até 3 linhas de descrição cabem nos 44 px
    // (8 px de fonte + 2 de folga por linha)
    lineHeight: 10,
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
  // linha de QA do chefe (estado/vida), embaixo da do player: é o confirmador
  // do dano de 10 por golpe até a barra do chefe existir (Sprint 7)
  bossInfoY: 32,
  textColor: '#e2cab1',
  // Linha de QA dos inimigos: abaixo da do chefe (bossInfoY 32 + 12, mesma
  // cadência das linhas acima)
  enemyInfoY: 44,
  // Círculo do CORPO de cada inimigo: roxo claro da paleta. Frio e claro,
  // sem colidir com chão (#7f78a1, mais cinza), obstáculos (#b03a48,
  // vermelho), player (#e2cab1, bege) nem chefe (#cf9ba3, rosado)
  enemyColor: '#8e7ad0',
  // Quadrado da HURTBOX de cada inimigo: faísca clara, mesma família da
  // hurtbox do chefe (#cf9ba3) — "caixa que leva dano", só mais clara, pra
  // separar da dele no olho. As duas formas (círculo + quadrado) seguem o
  // pé do inimigo no F1
  enemyHurtboxColor: '#eeb4c5',
  // linhas no chão (CENA3D, seção Debug)
  floorColor: '#7f78a1',
  obstacleColor: '#b03a48',
  playerColor: '#e2cab1',
  // hurtbox do chefe: cor de faísca (ESTILO, seção 5), pra não se confundir
  // com as colisões (vermelhas) nem com a área de acerto do ataque (ouro)
  bossColor: '#cf9ba3',
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
  // Pastas dos personagens em 8 direções (ESTILO, seção 8): cada uma tem
  // <direção>.png pras 8 direções do PixelLab. Os 4 são obrigatórios e as
  // views dos 4 (player, perturbado, mulher e chefe) consomem os sprites
  characters: {
    protagonista: 'assets/personagens/protagonista/parado',
    perturbado: 'assets/personagens/perturbado/parado',
    mulher: 'assets/personagens/mulher_afogada/parado',
    chefe: 'assets/personagens/chefe/parado',
  },
  // Texturas finais (docs/ASSETS.md). Se o arquivo não existir, o jogo usa a gerada por código
  textures: {
    floor: 'assets/texturas/chao_pedra.png',
    wall: 'assets/texturas/parede_tijolo.png',
    cap: 'assets/texturas/tampa_pedra.png',
    // máscara branca do Símbolo da Morte (ASSETS.md: "feito"): a cor vem do
    // código, dormindo/acordado (CENA3D, Arena). Faltando o arquivo, não há
    // versão gerada — o símbolo simplesmente não monta
    simbolo: 'assets/texturas/simbolo_morte.png',
  },
};
