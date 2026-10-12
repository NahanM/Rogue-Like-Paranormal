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

## Sprint 1: andar (FEITA)

- [x] Teclado: WASD e setas, 8 direções, diagonal com a mesma velocidade da reta
- [x] Protagonista placeholder: retângulo 16x32 na cor `#b89f91`, com sombra (ESTILO, seção 4)
- [x] Velocidade no `config.ts`
- [x] `src/game/arena.json`: polígono do chão andável (contorno aproximado da arena) e círculos dos pilares
- [x] Colisão: o pé do personagem não sai do polígono nem entra nos pilares
- [x] No modo debug (F1), desenhar a colisão por cima, pra ajustar à mão

## Sprint 1B: migrar pra 3D (ATUAL)

O jogo deixa de ser uma imagem parada e vira cenário 3D com câmera de ângulo fixo. A referência que funciona é o `ref/arena-3d.html`: abre ele no navegador antes de começar. Ler `docs/ESTILO.md` (inteiro) e `docs/CENA3D.md`.

- [ ] Instalar `three` e `@types/three` na versão estável atual, as duas na mesma versão, fixadas no `package.json` (sem `^`). Essa dependência está liberada
- [ ] Renderizador WebGL em 480x270 no lugar do canvas 2D, com a ampliação inteira que já existe (ESTILO, seção 1)
- [ ] Canvas 2D de HUD por cima, por enquanto só com as barras de vida e stamina
- [ ] Câmera da ESTILO, seção 2
- [ ] Arena montada com o kit de peças do CENA3D.md, com texturas geradas por código até as finais chegarem
- [ ] Protagonista como billboard com os sprites de `public/assets/protagonista_temp/` (ESTILO, seções 4 e 8): parado por direção, andar de lado em loop, balanço de 1 px andando pra cima e pra baixo
- [ ] Colisão em unidades do mundo: `src/game/arena.json` no formato novo (CENA3D.md). O polígono antigo em pixels sai
- [ ] Luzes e neblina (ESTILO, seção 6), poeira e brasas (seção 7)
- [ ] Velocidade de 75 px/s convertida com `PX_POR_UNIDADE`
- [ ] F1: debug da CENA3D.md, e a tecla não abre a ajuda do navegador
- [ ] O fundo em imagem (`arena_placeholder.png`) deixa de ser usado. Não apaga o arquivo

**Pronto quando:** o jogo aberto lado a lado com o `ref/arena-3d.html` fica igual ou melhor, e o build passa.

## Sprint 2: combate do protagonista

- [ ] Stamina: gasta pra rolar e atacar, recupera quando não gasta (COMBATE.md)
- [ ] Rolar, com invencibilidade em parte do movimento
- [ ] Atacar: área de acerto na frente, com preparo e recuperação
- [ ] Cicatrizante: cura com animação e risco de perder a carga

**Pronto quando:** tempos e custos batem com o COMBATE.md.

## Sprint 3: chefe

- [ ] O Deus da Morte como billboard de 7 unidades (provisório: a massa escura do protótipo, até o `chefe_parado.png` chegar)
- [ ] Acordar ao entrar no círculo, vida, dano recebido e flash branco
- [ ] Ataque 1: raízes saindo do chão, com aviso antes
- [ ] Ataque 2: golpe em área na frente dele
- [ ] Morte do protagonista e do chefe, e a volta na entrada da arena (COMBATE.md, "Morrer")

**Pronto quando:** dá pra ganhar e perder a luta.

## Sprint 4: sala 1 e troca de sala

- [ ] Sala 1 montada em 3D com o kit de peças, nas posições do CENA3D.md
- [ ] `src/game/sala1.json` com a colisão, a saída, o início, os inimigos e os itens (CENA3D.md)
- [ ] Saída nos fundos: escurece em 0,3 s e leva pra chegada da arena
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

- [ ] O resto das luzes (ESTILO, seção 6): círculo de ritual e golpe do chefe
- [ ] Faíscas do chefe (ESTILO, seção 7)
- [ ] Tremida de tela

## Sprint 9: telas

- [ ] Título (com o crédito ao jogo original), morte, vitória e reiniciar

## Sprint 10: arte de verdade

- [ ] Trocar as texturas geradas e os sprites temporários pelos assets do `docs/ASSETS.md` conforme forem chegando

## Sprint 11: publicar

- [ ] Gerar o build e publicar como site estático (Vercel ou GitHub Pages), pra jogar pelo link
