# ESTILO.md

Regras visuais do teste. Toda tarefa visual segue este arquivo. Se um pedido conflitar com algo daqui, pergunte antes de inventar.

Referências (pasta `ref/`, na raiz do projeto):
- `ref/arena.png`: arena do chefe (câmera, paleta, clima)
- `ref/protagonista.png`: folha do personagem
- `ref/igreja.png`: base da tela de título

## 1. Resolução

- Resolução interna fixa: **480x270**. O jogo inteiro é desenhado num canvas desse tamanho.
- O canvas é ampliado só por **múltiplo inteiro** (2x, 3x, 4x) pra caber na janela. O que sobrar vira borda `#050409`.
- `ctx.imageSmoothingEnabled = false` e CSS `image-rendering: pixelated` no canvas. Nada é suavizado em lugar nenhum.
- Toda posição de desenho é arredondada pra inteiro (`Math.round`) na hora de desenhar. A física pode usar decimal; o desenho não.

## 2. Câmera

- Fixa: sem rolagem, sem zoom, sem rotação. A arena inteira cabe numa tela.
- Vista de cima, inclinada, igual à `ref/arena.png`. O fundo é uma pintura, então a câmera é a da pintura.
- Tremida de tela só em dois casos: golpe do chefe que acerta (2 px, 120 ms) e morte do chefe (3 px, 400 ms).

## 3. Escala

| Elemento | Tamanho |
|---|---|
| Protagonista | 32 px de altura (corpo, sem sombra) |
| Chefe | ~130 px de altura |
| Ícone de frasco | 6x8 px |
| Fonte | 8 px |

- Sprite nunca é escalado nem girado no código. Pode só espelhar na horizontal (esquerda = direita espelhada).

## 4. Camadas (ordem de desenho)

1. Fundo (`arena_fundo.png`)
2. Sombras: elipse `#050409` com 50% de opacidade (14x5 px no protagonista)
3. Personagens e objetos, **ordenados pelo Y do pé**: quem está mais embaixo na tela é desenhado por cima
4. Recortes de primeiro plano (pilares e braseiros da frente, `arena_frente.png`): entram na mesma ordenação do item 3, usando o `baseY` de cada recorte
5. Partículas
6. Escuridão e luzes (seção 6)
7. HUD (a escuridão nunca afeta o HUD)

A colisão não vem da imagem. Fica em `arena.json`, definida à mão: polígono do chão andável + círculos dos pilares.

## 5. Paleta

Extraída da `ref/arena.png` e da folha do personagem. Tons com `*` foram completados pra fechar a rampa.

**Pedra (rampa fria arroxeada, do escuro pro claro)**
`#050409` `#0e0d16` `#191927` `#2b2234` `#4c3d4c` `#765d68` `#7f78a1`

**Musgo**
`#1f251b` `#252d1d` `#313525` `#4a5235`*

**Personagem**
`#120d14` calça e contorno, `#3b2e36` cabelo e couro, `#5c4033`* couro claro, `#826e6a` `#b89f91` `#e2cab1` casaco (sombra até luz)

**Destaques TRAVADOS** (nunca reduzir, nunca misturar com outra cor)
- Fogo: `#dd7530` `#f29465` `#ffdd9b` (núcleo)
- Ouro do círculo de ritual: `#dcbe74` `#fce6af`
- Roxo da luz do protagonista: `#6a5ba3` `#8e7ad0` `#f5effd` (núcleo)
- Sangue: `#540b1a` `#942c40`
- Faísca do chefe: `#cf9ba3` `#eeb4c5`

**UI**
vida `#b03a48`*, stamina `#5f8a45`*, rastro de dano `#fce6af`, fundo de barra `#0e0d16`, contorno `#050409`, texto `#e2cab1`

Regras:
- Todo asset novo é convertido pra esta paleta antes de entrar no jogo.
- Cor de destaque só aparece onde existe fonte de luz ou magia. Pixel de destaque em pedra comum é erro.
- Degradê liso é proibido. Transição de cor sempre com dithering ordenado (Bayer 4x4).

## 6. Luz (falsa, desenhada por cima)

- Escuridão: retângulo `#050409` com 35% de opacidade cobrindo a cena.
- Cada luz "fura" a escuridão e soma cor por cima. O gradiente é desenhado já em 480x270, com dithering na borda.

| Luz | Cor | Raio | Comportamento |
|---|---|---|---|
| Braseiro | fogo | 40 px | raio varia 10% pra mais ou pra menos a cada 80 a 120 ms (aleatório) |
| Protagonista | roxo | 28 px | segue o jogador, estável |
| Círculo de ritual | ouro | círculo inteiro | apagado até o chefe acordar; depois pulsa devagar (ciclo de 2 s) |
| Golpe do chefe | sangue | 24 px | só durante o ataque |

## 7. Partículas

- Poeira: 1 px, `#7f78a1`, de 25 a 40 na tela, sobem 0,1 a 0,3 px por frame, somem em 2 a 4 s.
- Brasas: 1 px, cores de fogo, 3 a 6 por braseiro, sobem e apagam.
- Faíscas do chefe: 1 px, cores de faísca, saem do topo do chefe.

## 8. Animação

- Jogo a 60 fps; sprites animam a 10 fps.
- Protagonista em 3 direções: baixo, cima e lado (esquerda = lado espelhado).
- Tomar dano: o sprite fica branco (`#f5effd`) por 2 frames do jogo. Feito no código, não é desenho.
- Morte do chefe: ele se desfaz em faíscas no código, sem animação desenhada.

## 9. HUD (coordenadas em 480x270)

| Item | Posição | Tamanho |
|---|---|---|
| Barra de vida | x8 y8 | 100x4 |
| Barra de stamina | x8 y14 | 80x3 |
| Frascos | x8 y254, um a cada 8 px | 6x8 cada |
| Nome do chefe | x90 y238 | fonte 8 px |
| Barra do chefe | x90 y248 | 300x4 |

- Barras: contorno de 1 px, preenchimento sólido e **rastro de dano** (a parte perdida fica em ouro claro e esvazia depois de 0,5 s).
- Entrada do chefe: faixa preta com 70% de opacidade, 24 px de altura, no meio da tela, com o nome centralizado. Aparece em 0,5 s, fica 2 s, some em 0,5 s.
- Texto sempre desenhado no próprio canvas, nunca em HTML por cima.
- Fonte: pixel art com licença livre (OFL) e acentos do português. Candidatas: Silkscreen e Press Start 2P (Google Fonts). Antes de usar, testar se "ÇÃÉÊÕ" aparecem.

## 10. Tela de título

- `titulo.png` em 480x270 (a igreja, refeita em 16:9), nome do jogo e "PRESSIONE ENTER" piscando a cada 0,6 s.

## 11. Proibido

- Suavização, blur, sombra de CSS, fonte do sistema
- Cor fora da paleta
- Escala não inteira ou rotação de sprite
- Degradê sem dithering
- Copiar cena, chefe, nomes ou textos do vídeo de referência: de lá só vem o estilo
