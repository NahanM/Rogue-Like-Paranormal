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

## Sprint 1B: migrar pra 3D (FEITA)

O jogo deixou de ser uma imagem parada e virou cenário 3D com câmera de ângulo fixo, igual ao `ref/arena-3d.html`.

- [x] `three` e `@types/three` 0.186.0, fixadas no `package.json`
- [x] Renderizador WebGL em 480x270 no lugar do canvas 2D, com a ampliação inteira (ESTILO, seção 1)
- [x] Canvas 2D de HUD por cima, por enquanto só com as barras de vida e stamina
- [x] Câmera da ESTILO, seção 2
- [x] Arena montada com o kit de peças do CENA3D.md, com texturas geradas por código até as finais chegarem (se o arquivo existir em `public/assets/texturas/`, ele entra no lugar)
- [x] Protagonista como billboard com os sprites de `public/assets/protagonista_temp/`: parado por direção, andar de lado em loop, balanço de 1 px andando pra cima e pra baixo
- [x] Colisão em unidades do mundo: `src/game/arena.json` no formato novo (CENA3D.md)
- [x] Luzes e neblina (ESTILO, seção 6, já calibradas pro r186), poeira e brasas (seção 7)
- [x] Velocidade de 75 px/s convertida com `PX_POR_UNIDADE`
- [x] F1: debug da CENA3D.md, e a tecla não abre a ajuda do navegador
- [x] O fundo em imagem (`arena_placeholder.png`) deixou de ser usado (o arquivo continua lá)

### Mapa do código (leia antes da Sprint 2)

```
src/main.ts                    junta tudo: carrega assets, monta a cena, roda o loop
src/engine/screen.ts           renderizador WebGL 480x270 + canvas do HUD + ampliação inteira
src/engine/loop.ts             passo fixo de 60 Hz
src/engine/input.ts            teclado (getMoveAxis)
src/engine/assets.ts           carregador de imagens (obrigatórias e opcionais)
src/engine/textures.ts         regras de pixel das texturas (Nearest, sRGB, densidade)
src/engine/random.ts           aleatório com semente
src/game/config.ts             todos os números de ajuste, inclusive as luzes
src/game/collision.ts          colisão em unidades do mundo e leitura dos .json de sala
src/game/camera.ts             câmera de ângulo fixo
src/game/player.ts             lógica do protagonista (posição, direção, vida, stamina)
src/game/player-view.ts        billboard, sombra e luz da mão
src/game/debug.ts              F1
src/game/scene/kit.ts          peças do CENA3D (chão, muro, pilar, braseiro, estátua, círculo, raízes, chefe provisório)
src/game/scene/room.ts         o que toda sala entrega (Room)
src/game/scene/arena-room.ts   a arena montada com o kit
src/game/scene/particles.ts    poeira e brasas
src/game/scene/procedural-textures.ts  texturas provisórias geradas por código
src/ui/hud.ts                  barras de vida e stamina
```

- Lógica no `update(dt)` (passo fixo); desenho no `draw()`. O `player.ts` não sabe nada de three.js: o que aparece na tela fica no `player-view.ts`. Mantenha essa separação nos inimigos e no chefe.
- Sala nova (Sprint 4) = um arquivo tipo `arena-room.ts` que monta com o `kit.ts` e devolve um `Room`.

## Sprint 2: combate do protagonista (FEITA)

- [x] Stamina: gasta pra rolar e atacar, recupera quando não gasta (COMBATE.md)
- [x] Rolar, com invencibilidade em parte do movimento
- [x] Atacar: área de acerto na frente, com preparo e recuperação
- [x] Cicatrizante: cura com animação e risco de perder a carga

**Pronto quando:** tempos e custos batem com o COMBATE.md.

Decisões tomadas onde o COMBATE.md não dizia nada (revisadas, valem daqui pra frente):
- Atacando, o protagonista fica parado. Usando o Cicatrizante, não dá pra rolar nem atacar
- Tomar dano durante o Cicatrizante encerra o uso na hora
- Com o F1 ligado, a tecla H dá 10 de dano de teste (some quando o chefe existir)

## Sprint 3: chefe (ATUAL)

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
