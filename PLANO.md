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
src/engine/billboard.ts        BILLBOARD_STRETCH: todo billboard fica em pé e esticado na altura
src/engine/pixel-text.ts       fonte Silkscreen e texto sem suavização pro HUD
src/game/config.ts             todos os números de ajuste, inclusive as luzes
src/game/collision.ts          colisão em unidades do mundo e leitura dos .json de sala
src/game/camera.ts             câmera de ângulo fixo
src/game/player.ts             lógica do protagonista (posição, direção, vida, stamina)
src/game/player-view.ts        billboard, sombra e luz da mão
src/game/boss.ts               lógica do chefe (posição, estado, vida)
src/game/boss-view.ts          billboard, sombra e luz vermelha do chefe
src/game/debug.ts              F1
src/game/scene/kit.ts          peças do CENA3D (chão, muro, pilar, braseiro, estátua, círculo, raízes)
src/game/scene/room.ts         o que toda sala entrega (Room)
src/game/scene/arena-room.ts   a arena montada com o kit
src/game/scene/particles.ts    poeira e brasas
src/game/scene/procedural-textures.ts  texturas provisórias geradas por código
src/ui/hud.ts                  barras de vida e stamina, legenda dos controles
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

## Sprint 3: chefe (FEITA)

- [x] O Deus da Morte como billboard de 7 unidades, em pé com `BILLBOARD_STRETCH` igual ao protagonista (provisório: a massa escura do protótipo, até o `chefe_parado.png` chegar)
- [x] Acordar ao entrar no círculo, vida, dano recebido e flash branco
- [x] Ataque 1: raízes saindo do chão, com aviso antes
- [x] Ataque 2: golpe em área na frente dele
- [x] Morte do protagonista e do chefe, e a volta na entrada da arena (COMBATE.md, "Morrer")

**Pronto quando:** dá pra ganhar e perder a luta.

## Sprint 4: sala 1 e troca de sala (FEITA)

- [x] Sala 1 montada em 3D com o kit de peças, nas posições do CENA3D.md
- [x] `src/game/sala1.json` com a colisão, a saída, o início, os inimigos e os itens (CENA3D.md)
- [x] Saída nos fundos: escurece em 0,3 s e leva pra chegada da arena
- [x] O jogo começa na sala 1
- [x] Morrer na sala 1 recomeça a sala

**Pronto quando:** dá pra andar da sala 1 até a arena, e morrer em cada uma volta no lugar certo.

## Sprint 5: inimigos (FEITA)

- [x] Perturbado de Energia: anda sem rumo e machuca ao encostar (COMBATE.md)
- [x] Mulher Afogada: persegue, ataca e foge quando ferida
- [x] Inimigos levam dano do ataque do protagonista e morrem
- [x] 4 Perturbados e 2 Mulheres na sala 1, em posições fixas no `sala1.json`

**Pronto quando:** dá pra limpar a sala, e os dois inimigos se comportam como o COMBATE.md descreve.

## Sprint 6: itens (FEITA)

- [x] Pegar item ao pisar
- [x] Machadinha: munição, arremesso com F, dano, some depois de arremessada. Acrescenta `F MACHADINHA` na legenda dos controles (`hud.controls.lines` no `config.ts`)
- [x] Proteção Leve: reduz o dano em 25%
- [x] Cicatrizante extra: +1 carga
- [x] Caixa de descrição na primeira vez que pega cada item, com o texto do LORE.md (ESTILO, seção 9)

**Pronto quando:** os 3 itens funcionam como no COMBATE.md e as descrições aparecem.

## Sprint 7: HUD (FEITA)

- [x] Vida e stamina com rastro de dano, Cicatrizantes, Proteção e Machadinhas (ESTILO, seção 9)
- [x] Nome e barra de vida do chefe no HUD (ESTILO, seção 9)
- [x] Faixa de entrada do chefe (ESTILO, seção 9)

## Sprint 8: sprites do PixelLab e chão da arena (FEITA)

Arte nova em `public/assets/personagens/` e `public/assets/texturas/simbolo_morte.png`. Tamanhos na ESTILO, seção 3; direções na seção 8; chão no CENA3D, Arena.

- [X] Carregar os 4 personagens parados (8 direções cada) e usar no lugar dos placeholders: protagonista (some o `protagonista_temp/`), Perturbado, Mulher e chefe (some a massa escura gerada por código)
- [x] Tamanho do plano pelo tamanho do PNG, pé na linha certa. Sombras com os raios novos (ESTILO, seção 4)
- [x] Escolher a direção do sprite pelo vetor pra onde cada um olha, em 8 fatias de 45°. Andando, o parado sobe e desce 1 px por passo
- [ ] Ajustar a área que leva dano e o alcance de quem mudou de tamanho só se ficar visivelmente errado no debug (F1). Números do COMBATE.md continuam valendo (verificação estática feita: nenhuma área depende do tamanho do PNG e os números do COMBATE.md estão intactos; falta o olho humano no F1, rodando `npm run dev`)
- [x] Chão da arena: textura `chao_arena`, Símbolo da Morte no lugar do círculo de ritual dourado (apagado dormindo, acende quando o chefe acorda), veias e poças (CENA3D, Arena)
- [x] Esconder a legenda dos controles enquanto a caixa de descrição de item estiver aberta (hoje a caixa cobre o começo da legenda)

**Pronto quando:** os 4 personagens aparecem com a arte nova, virando pra onde olham, no tamanho da tabela, e a arena tem o símbolo, as veias e as poças.

## Sprint 9: o chefe anda e ataca (FEITA)

Tudo no COMBATE.md (seção Chefe) e nos efeitos da ESTILO, seção 7. **Substitui** os ataques antigos (raízes e golpe em área): o código deles sai.

- [x] Tirar o chefe dos obstáculos do `arena.json`. Ele anda atrás do jogador com colisão, o corpo dele empurra o jogador, e a luz vermelha vai junto
- [x] Queda: agachar, voo em arco até o alvo travado, impacto, preso no chão. Com a marca da queda no alvo
- [x] Devastador: carga com o círculo de aviso, estouro, exausto
- [x] Efeitos da Queda e do Devastador (ESTILO, seção 7): achatar e esticar, rastro, anel de choque, lascas, poeira, rachadura, lodo, partículas sugadas, luz, piscada e tremida
- [x] Escolha do ataque e pausa entre ataques do COMBATE.md. Morreu na arena: chefe volta dormindo no centro
- [x] Debug (F1): desenhar a área do impacto, o círculo do Devastador e o corpo do chefe

**Pronto quando:** dá pra fugir dele andando, desviar dos dois ataques (saindo da área ou rolando) e bater nele nas janelas de "preso no chão" e "exausto".

## Sprint 10: clima (ATUAL)

- [ ] O resto das luzes (ESTILO, seção 6)
- [ ] Faíscas do chefe (ESTILO, seção 7)
- [x] Tremida de tela (adiantada na Sprint 3)

## Sprint 11: telas

- [ ] Título (com o crédito ao jogo original), morte, vitória e reiniciar

## Sprint 12: resto da arte

- [ ] Trocar as texturas geradas e os sprites parados pelas animações e assets do `docs/ASSETS.md` conforme forem chegando

## Sprint 13: publicar

- [ ] Gerar o build e publicar como site estático (Vercel ou GitHub Pages), pra jogar pelo link
