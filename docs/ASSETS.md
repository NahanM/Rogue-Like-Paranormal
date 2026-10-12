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
| `circulo_ritual.png` | 128x128, fundo transparente | Círculo de ritual dourado com símbolos, visto de cima | P2 |
| `raizes.png` | 64x64, fundo transparente | Veias e raízes vermelho-sangue se espalhando, vistas de cima | P2 |

**Pedido pra IA de imagem** (troca o que tá entre colchetes):
> Seamless tileable pixel art texture, [top-down view of old stone floor tiles with dark mortar and cracks]. Dark purple-gray stone, muted colors, flat lighting, no shadows, no perspective, no border.

- **Sem luz e sem sombra pintada:** quem ilumina é o 3D. Textura com sombra pintada fica errada quando a luz se mexe
- **Vista reta:** chão de cima, parede de frente. Nada em perspectiva
- A IA vai devolver uma imagem grande. Eu reduzo pra 32x32, encaixo na paleta e confiro se emenda sem costura

## Protagonista (PixelLab), 32 px de altura, 3 direções

| Animação | Frames | Prioridade |
|---|---|---|
| Parado | 2 a 4 | P1 |
| Andar | 6 (mínimo 4) | P1 |
| Rolar | 6 | P1 |
| Atacar (preparo, golpe, recuperação) | 4 | P1 |
| Usar Cicatrizante | 4 | P2 |
| Arremessar machadinha | 3 | P2 |
| Morrer | 4 | P2 |
| Tomar dano | 0 (flash no código) | P3 |

Base: `ref/protagonista.png`. Ordem: primeiro gera o personagem **parado nas 3 direções** e aprova. Só depois anima, pra não gastar crédito animando boneco errado. Até lá, o jogo usa os sprites de `public/assets/protagonista_temp/`.

## Inimigos comuns (PixelLab), 3 direções

O visual é **novo e nosso**: no jogo original eles eram só letras (`p` e `w`), então a aparência sai da descrição do `docs/LORE.md`.

| Inimigo | Altura | Animações | Prioridade |
|---|---|---|---|
| Perturbado de Energia | 24 px | Andar (4) | P1 |
| Mulher Afogada | 32 px | Andar (4), atacar (3) | P1 |
| Os dois | | Morrer: some em faíscas no código | P3 |

## Chefe e estátuas (IA de imagem, viram billboard)

| Arquivo | O que pedir | Prioridade |
|---|---|---|
| `chefe_parado.png` | O chefe da `ref/arena.png`, corpo inteiro, de frente, **fundo preto liso** (eu tiro o fundo por script) | P1 |
| `chefe_preparando.png` | A mesma criatura erguendo os braços/raízes | P1 |
| `chefe_golpe.png` | A mesma criatura golpeando pra frente | P1 |
| `estatua.png` | Uma estátua de pedra rezando, como as da `ref/arena.png`, fundo preto liso | P2 |

Efeitos de ataque:

| Efeito | Tamanho | Frames | Prioridade |
|---|---|---|---|
| Raiz saindo do chão | 16x40 | 5 | P1 |
| Aviso no chão antes do ataque | código (círculo com dithering) | 0 | P3 |

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
2. Protagonista parado nas 3 direções, e tu aprova
3. Chefe parado (fundo preto liso)
4. Andar, rolar e atacar
5. Inimigos parados, depois andando
6. O resto

Conta do crédito grátis do PixelLab (40 gerações): protagonista e inimigos parados primeiro. Animação só depois de aprovar e, se faltar crédito, só se o teste convencer.
