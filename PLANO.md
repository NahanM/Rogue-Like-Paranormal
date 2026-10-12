# PLANO.md

Teste: uma arena, protagonista contra chefe. Sprints pequenas, e cada uma termina com o jogo rodando.

Legenda: `[ ]` a fazer, `[x]` feito. Só uma sprint ATUAL por vez.

## Sprint 0: base (ATUAL)

- [x] Projeto Vite vanilla-ts rodando com `npm run dev`
- [x] Canvas de 480x270, ampliado só por múltiplo inteiro, centralizado, sobra da janela em `#050409` (ESTILO, seção 1)
- [x] Loop de passo fixo a 60 Hz, com o desenho separado da atualização
- [x] Carregador de imagens que espera tudo carregar antes de começar
- [x] Desenhar `public/assets/arena_placeholder.png` como fundo
- [x] Tecla F1 liga e desliga o modo debug, que mostra o FPS num canto

**Pronto quando:** a arena aparece nítida, sem borrão, em qualquer tamanho de janela, e o build passa.

## Sprint 1: andar

- [ ] Teclado: WASD e setas, 8 direções, diagonal com a mesma velocidade da reta
- [ ] Protagonista placeholder: retângulo 16x32 na cor `#b89f91`, com sombra (ESTILO, seção 4)
- [ ] Velocidade no `config.ts`
- [ ] `src/game/arena.json`: polígono do chão andável (contorno aproximado da arena) e círculos dos pilares
- [ ] Colisão: o pé do personagem não sai do polígono nem entra nos pilares
- [ ] No modo debug (F1), desenhar a colisão por cima, pra ajustar à mão

**Pronto quando:** dá pra andar pela arena inteira sem atravessar pilar nem sair do chão.

## Sprint 2: combate do protagonista (BLOQUEADA até existir `docs/COMBATE.md`)

- [ ] Stamina: gasta pra rolar e atacar, recupera quando não gasta
- [ ] Rolar, com invencibilidade em parte do movimento
- [ ] Atacar: área de acerto na frente, com preparo e recuperação
- [ ] Frasco de cura

**Pronto quando:** tempos e custos batem com o COMBATE.md.

## Sprint 3: chefe

- [ ] Chefe placeholder (recorte ou retângulo de ~130 px)
- [ ] Vida do chefe, dano recebido e flash branco
- [ ] Ataque 1: raízes saindo do chão, com aviso antes
- [ ] Ataque 2: golpe em área na frente dele
- [ ] Morte do protagonista e do chefe

**Pronto quando:** dá pra ganhar e perder a luta.

## Sprint 4: HUD

- [ ] Vida e stamina com rastro de dano, frascos (ESTILO, seção 9)
- [ ] Nome e barra do chefe, faixa de entrada

## Sprint 5: clima

- [ ] Escuridão e luzes (ESTILO, seção 6)
- [ ] Partículas (ESTILO, seção 7)
- [ ] Tremida de tela

## Sprint 6: telas

- [ ] Título, morte, vitória e reiniciar

## Sprint 7: arte de verdade

- [ ] Trocar os placeholders pelos assets do `docs/ASSETS.md` conforme forem chegando
