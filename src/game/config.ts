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

// Chefe: O Deus da Morte (COMBATE.md, Chefe). Não anda: fica enraizado
export const boss = {
  // posição no chão (CENA3D.md, Arena).
  position: { x: 0, z: -1.2 },
  // Raio do corpo que empurra o jogador. ESPELHADO do círculo
  // { x: 0, z: -1.2, r: 2.3 } do arena.json (CENA3D.md) — a colisão mora no
  // json de sala, que o boss.ts não lê, mas o golpe em área precisa deste
  // número pra medir o alcance a partir da borda (ver slam abaixo).
  // Mudou um, muda o outro
  bodyRadius: 2.3,
  // COMBATE.md: 300 de vida (30 golpes de 10)
  maxHealth: 300,
  // Acordar (COMBATE.md, Acordar): o jogador entra no círculo de ritual.
  // É a distância do pé do jogador até o centro do círculo (0, -1,2), igual
  // ao anel de ouro externo (raio 4,14 — CENA3D.md, Arena)
  wakeRadius: 4.14,
  // Área que leva dano (COMBATE.md, Chefe): retângulo de 40x60 px na base do
  // corpo, centrado na posição dele. O combate acontece no plano do chão
  // (x/z), então os 60 px de "altura na tela" viram a profundidade em z.
  // Convertido pra unidades do mundo aqui, como tudo que vem do COMBATE.md
  hurtbox: {
    width: 40 / PX_POR_UNIDADE,
    depth: 60 / PX_POR_UNIDADE,
  },
  // Dano recebido: flash branco #f5effd por 2 frames de jogo (ESTILO, seção 8),
  // aplicado no boss-view.ts — mesmo padrão do player.hurt
  hurt: {
    flashDuration: 2 / 60,
  },
  // Pausa entre ataques (COMBATE.md, Chefe): aleatória entre 1,2 e 2,0 s.
  // É a janela pra punir o chefe
  attackPause: { min: 1.2, max: 2.0 },
  // Escolha do ataque (COMBATE.md, Escolha do ataque): a menos de 70 px do
  // chefe, 60% golpe em área (Tarefa 4) e 40% raízes; mais longe, 80% raízes
  // e 20% onda. A onda é opcional (Ataque 3, fora da Sprint 3): quando a
  // sorte cairia nela, viram raízes — comentado no boss.ts
  attackChoice: {
    nearRange: 70 / PX_POR_UNIDADE,
    slamChanceNear: 0.6,
  },
  // Ataque 1: Raízes (COMBATE.md). Marca de aviso no chão por 0,8 s; depois
  // a raiz sai e fere por 0,4 s, 25 de dano num raio de 12 px por raiz
  roots: {
    warnTime: 0.8,
    activeTime: 0.4,
    damage: 25,
    radius: 12 / PX_POR_UNIDADE,
    // marcas extras além da que sai embaixo do jogador (2 a 4, sorteadas)
    extraMin: 2,
    extraMax: 4,
    // Círculo de aviso: sangue da paleta (#942c40), com um pulso leve de
    // opacidade em volta da base (provisório até ter sprite — ESTILO 5/8)
    warn: {
      color: '#942c40',
      opacity: 0.6,
      pulseFraction: 0.25,
      pulseSpeed: 7,
    },
    // Raiz estalada: espinhos gerados por código (provisório; o sprite vem
    // com o raizes.png do ASSETS.md). Sai do chão com um "pop" de crescimento
    // em popTime segundos — ESTILO 8: 1-2 frames já bastam de animação
    spike: {
      color: '#942c40',
      height: 2.0,
      popTime: 0.08,
    },
  },
  // Ataque 2: Golpe em área (COMBATE.md): pose de preparo de 0,9 s, área
  // ativa por 0,2 s, 35 de dano. Retângulo de 80 px de largura (na
  // perpendicular da mira) por 40 px de alcance, centrado na linha da mira.
  // DÚVIDA DO DOC, decidida (o COMBATE.md não diz o ponto de origem): o
  // alcance é medido a partir da BORDA do corpo (bodyRadius), não do
  // centro — medido do centro, o retângulo ia de 0 a 40 px e o corpo de
  // raio 2,3 (~43 px) empurraria o jogador pra fora dele pra sempre,
  // tornando o golpe inofensivo. Da borda, a área cobre de ~43 px a
  // ~83 px do centro (2,3 u a 2,3 + 40/18,7 ≈ 4,44 u), e o jogador
  // encostado no corpo para a 2,3 + 0,32 (player.radius) ≈ 2,62 u ≈ 49 px
  // — quase 6 px DENTRO da área: quem abusa do corpo a corpo toma o golpe,
  // e a luta pode ser perdida. Fuga: 0,9 s de preparo a 75 px/s ≈ 67 px,
  // mais que os 40 px de profundidade, então dá pra sair a tempo
  // DÚVIDA DO DOC, decisão a revisar: "na frente do chefe" não define
  // direção — ele é enraizado, não anda nem gira. Fica assim: a frente é
  // a direção do jogador no instante do disparo, travada até o fim do
  // golpe (padrão souls de ataque de preparo longo). Implementação no
  // boss.ts (startSlamAttack).
  slam: {
    windup: 0.9,
    active: 0.2,
    damage: 35,
    width: 80 / PX_POR_UNIDADE,
    // 40 px de alcance contados da borda do corpo (decisão no bloco acima):
    // a área ativa vai de bodyRadius até bodyRadius + reach
    reach: 40 / PX_POR_UNIDADE,
    // Pose provisória (sem sprite de preparo, ASSETS.md): o billboard
    // "carrega" crescendo na vertical ao longo do preparo até este
    // acréscimo e corta de volta no instante do golpe — mínimo escolhido
    // entre as opções (escala 10% com volta seca)
    windupGrowY: 0.1,
    // Retângulo no chão (provisório, mesma linguagem das marcas de raiz):
    // no preparo, sangue pulsando leve como aviso; nos 0,2 s de golpe,
    // acende em cor de faísca do chefe. Decisão: mostrar o aviso, porque
    // 35 de dano num golpe cuja única telegrafia seria a pose de +10% de
    // altura é praticamente invisível a 480x270. MeshBasic: magia brilha
    // sozinha, como as marcas das raízes (ESTILO 5/6)
    warn: { color: '#942c40', opacity: 0.45, pulseFraction: 0.3, pulseSpeed: 7 },
    activeRect: { color: '#cf9ba3', opacity: 0.85 },
  },
  // sombra redonda no chão (ESTILO, seção 4): raio 0,6 no chefe, igual ao
  // da Mulher — os quatro personagens seguem a seção 4 (0,42 no protagonista
  // e no Perturbado). Opacidade 55% e cor continuam as mesmas
  shadow: { radius: 0.6, opacity: 0.55, color: '#050409' },
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
  // Tremida de tela (ESTILO, seção 2): os dois ÚNICOS casos do jogo
  // inteiro. Amplitude em pixels da tela de 480x270, aplicada na moldura
  // (3D e HUD andam juntos) pelo engine/screen.ts
  shake: {
    // golpe do chefe que acerta (raízes ou slam)
    bossHit: { amplitudePx: 2, duration: 0.12 },
    // morte do chefe
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
  // Círculos das marcas do Ataque 1 (raízes): sangue escuro pro aviso e
  // faísca clara pra raiz estalada, pra ler a fase de olho no chão
  rootWarnColor: '#942c40',
  rootActiveColor: '#eeb4c5',
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
