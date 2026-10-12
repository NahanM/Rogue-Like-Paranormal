# PLANO.md

Teste: uma sala com inimigos e itens, depois a arena do chefe. Sprints pequenas, e cada uma termina com o jogo rodando.

Legenda: `[ ]` a fazer, `[x]` feito. Só uma sprint ATUAL por vez.

## Sprint 0: base (FEITA)

- [x] Projeto Vite vanilla-ts rodando com `npm run dev`
- [x] Canvas de 480x270, ampliado só por múltiplo inteiro, centralizado, sobra da janela em `#050409` (ESTILO, seção 1)
- [x] Loop de passo fixo a 60 Hz, com o desenho separado da atualização
- [x] Carregador de imagens que espera tudo carregar antes de começar
- [x] Desenhar `public/assets/arena_placeholder.png` como fundo
- [x] Tecla F1 liga e desliga o modo debug, que mostra o FPS num canto

## Sprint 1: andar (ATUAL)

- [ ] Garantir que o F1 não abre a ajuda do navegador (bloquear o comportamento padrão da tecla)
- [ ] Teclado: WASD e setas, 8 direções, diagonal com a mesma velocidade da reta
- [ ] Protagonista placeholder: retângulo 16x32 na cor `#b89f91`, com sombra (ESTILO, seção 4)
- [ ] Velocidade no `config.ts`
- [ ] `src/game/arena.json`: polígono do chão andável (contorno aproximado da arena) e círculos dos pilares
- [ ] Colisão: o pé do personagem não sai do polígono nem entra nos pilares
- [ ] No modo debug (F1), desenhar a colisão por cima, pra ajustar à mão

**Pronto quando:** dá pra andar pela arena inteira sem atravessar pilar nem sair do chão.

## Sprint 2: combate do protagonista

- [ ] Stamina: gasta pra rolar e atacar, recupera quando não gasta (COMBATE.md)
- [ ] Rolar, com invencibilidade em parte do movimento
- [ ] Atacar: área de acerto na frente, com preparo e recuperação
- [ ] Cicatrizante: cura com animação e risco de perder a carga

**Pronto quando:** tempos e custos batem com o COMBATE.md.

## Sprint 3: chefe

- [ ] O Deus da Morte placeholder (retângulo de ~130 px, ou recorte da arena se já existir)
- [ ] Acordar ao entrar no círculo, vida, dano recebido e flash branco
- [ ] Ataque 1: raízes saindo do chão, com aviso antes
- [ ] Ataque 2: golpe em área na frente dele
- [ ] Morte do protagonista e do chefe, e a volta na entrada da arena (COMBATE.md, "Morrer")

**Pronto quando:** dá pra ganhar e perder a luta.

## Sprint 4: sala 1 e troca de sala

- [ ] Sala 1 com fundo placeholder (chão `#2b2234`, paredes `#191927`) até o `sala1_fundo.png` existir
- [ ] `src/game/sala1.json` com a colisão da sala
- [ ] Saída na parte de cima: escurece em 0,3 s e leva pra entrada de baixo da arena
- [ ] O jogo começa na sala 1
- [ ] Morrer na sala 1 recomeça a sala

**Pronto quando:** dá pra andar da sala 1 até a arena, e morrer em cada uma volta no lugar certo.

## Sprint 5: inimigos

- [ ] Perturbado de Energia: anda sem rumo e machuca ao encostar (COMBATE.md)
- [ ] Mulher Afogada: persegue, ataca e foge quando ferida
- [ ] Inimigos levam dano do ataque do protagonista e morrem
- [ ] 4 Perturbados e 2 Mulheres na sala 1, em posições fixas no `sala1.json`

**Pronto quando:** dá pra limpar a sala, e os dois inimigos se comportam como o COMBATE.md descreve.

## Sprint 6: itens

- [ ] Pegar item ao pisar
- [ ] Machadinha: munição, arremesso com F, dano, some depois de arremessada
- [ ] Proteção Leve: reduz o dano em 25%
- [ ] Cicatrizante extra: +1 carga
- [ ] Caixa de descrição na primeira vez que pega cada item, com o texto do LORE.md (ESTILO, seção 9)

**Pronto quando:** os 3 itens funcionam como no COMBATE.md e as descrições aparecem.

## Sprint 7: HUD

- [ ] Vida e stamina com rastro de dano, Cicatrizantes, Proteção e Machadinhas (ESTILO, seção 9)
- [ ] Nome e barra do chefe, faixa de entrada

## Sprint 8: clima

- [ ] Escuridão e luzes (ESTILO, seção 6)
- [ ] Partículas (ESTILO, seção 7)
- [ ] Tremida de tela

## Sprint 9: telas

- [ ] Título (com o crédito ao jogo original), morte, vitória e reiniciar

## Sprint 10: arte de verdade

- [ ] Trocar os placeholders pelos assets do `docs/ASSETS.md` conforme forem chegando

## Sprint 11: publicar

- [ ] Gerar o build e publicar como site estático (Vercel ou GitHub Pages), pra jogar pelo link
