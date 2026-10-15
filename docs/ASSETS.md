# ASSETS.md: o que produzir pro teste

Tudo segue o `ESTILO.md`. Nada fora desta lista gasta crédito.

Prioridade:
- **P1**: sem isso não tem jogo
- **P2**: dá pra testar sem
- **P3**: o código resolve, não gasta crédito

## Texturas do cenário (em `public/assets/texturas/`)

Elas são o que deixa o 3D com a cara da `ref/arena.png`. Até chegarem, o código gera texturas provisórias (CENA3D.md).

| Arquivo | Tamanho | O que é | Prioridade |
|---|---|---|---|
| `chao_pedra.png` | 32x32, repetível | Laje de pedra vista de cima, rejunte escuro, rachaduras | P1 |
| `chao_pedra_musgo.png` | 32x32, repetível | A mesma laje com musgo nas frestas, pra variar o chão | P2 |
| `parede_tijolo.png` | 32x32, repetível | Tijolo de pedra visto de frente, musgo no alto | P1 |
| `tampa_pedra.png` | 16x16, repetível | Pedra lisa e mais clara, pro topo dos pilares | P2 |
| `simbolo_morte.png` | 156x156, branco com fundo transparente | **Chegou.** Símbolo da Morte no chão da arena, no lugar do círculo de ritual dourado. É só a máscara: a cor vem do código (CENA3D, Arena) | feito |
| `veias.png` | 64x64, fundo transparente | Veias vermelho-sangue se espalhando, vistas de cima. Até chegar, o código desenha as veias (CENA3D, Arena) | P3 |

**Pedido pra IA de imagem** (troca o que tá entre colchetes):
> Seamless tileable pixel art texture, [top-down view of old stone floor tiles with dark mortar and cracks]. Dark purple-gray stone, muted colors, flat lighting, no shadows, no perspective, no border.

- **Sem luz e sem sombra pintada:** quem ilumina é o 3D. Textura com sombra pintada fica errada quando a luz se mexe
- **Vista reta:** chão de cima, parede de frente. Nada em perspectiva
- A IA vai devolver uma imagem grande. Eu reduzo pra 32x32, encaixo na paleta e confiro se emenda sem costura

## Personagens (PixelLab), 8 direções

**Chegaram os 4 parados**, em `public/assets/personagens/<nome>/parado/<direção>.png`, com os nomes de direção do PixelLab (ESTILO, seção 8). Tamanhos e escala na ESTILO, seção 3.

| Pasta | PNG | Tem | Falta (na ordem) |
|---|---|---|---|
| `protagonista/` | 32x32 | parado | andar (6), rolar (6), atacar (4), cicatrizante (4), arremessar (3), morrer (4) |
| `perturbado/` | 32x32 | parado | flutuar/andar (4) |
| `mulher_afogada/` | 48x48 | parado | andar (4), atacar (3) |
| `chefe/` | 48x48, aparece em 2x | parado | andar (4), agachar (3), no ar (2), queda (3), carregar Devastador (4), exausto (2) |

- Animação nova vai numa pasta irmã do `parado/` (`andar/`, `atacar/`...), com uma subpasta por direção e os quadros numerados: `chefe/andar/south/0.png`, `1.png`... Mesmo tamanho de PNG do parado
- Pra economizar crédito, pode gerar só 4 direções (`south`, `east`, `north`, `west`) das animações. Faltando a diagonal, o código usa a reta mais próxima
- Enquanto a animação não existe, o código faz a pose (ESTILO, seções 7 e 8). Nada trava esperando arte
- Os sprites antigos de `public/assets/protagonista_temp/` ficam no repositório, mas o jogo para de usar

## Estátuas (IA de imagem, viram billboard)

| Arquivo | O que pedir | Prioridade |
|---|---|---|
| `estatua.png` | Uma estátua de pedra rezando, como as da `ref/arena.png`, fundo preto liso | P2 |

Efeitos de ataque:

| Efeito | Tamanho | Frames | Prioridade |
|---|---|---|---|
| Queda e Devastador (anel de choque, lascas, rachadura, lodo) | código (ESTILO, seção 7) | 0 | P3 |
| Avisos no chão | código (círculo com dithering) | 0 | P3 |

## Itens, efeitos e UI (Piskel ou código, sem crédito)

| Arquivo | Tamanho | Frames | Prioridade |
|---|---|---|---|
| Fogo do braseiro | 8x12 | 4 | P2 (o código já desenha um) |
| Corte da espada | 24x24 | 3 | P1 |
| Cicatrizante (cheio e vazio, pro HUD) | 6x8 | 2 | P1 |
| Machadinha no chão e no HUD | 8x8 | 1 | P1 |
| Machadinha em voo (girando) | 8x8 | 4 | P1 |
| Proteção Leve no chão e no HUD | 8x8 | 1 | P1 |
| Cicatrizante no chão | 8x8 | 1 | P1 |
| Poeira, brasas, faíscas | código | 0 | P3 |
| `titulo.png` (a igreja refeita em 16:9) | 480x270 | 1 | P2 |

## Ordem de produção

1. `chao_pedra.png` e `parede_tijolo.png`: sozinhas, já mudam a cara do jogo inteiro
2. ~~Protagonista, inimigos e chefe parados~~ (chegaram)
3. Andar do protagonista e do chefe
4. Rolar e atacar do protagonista, agachar e queda do chefe
5. Andar e atacar dos inimigos
6. O resto

Conta do crédito grátis do PixelLab (40 gerações): protagonista e inimigos parados primeiro. Animação só depois de aprovar e, se faltar crédito, só se o teste convencer.
