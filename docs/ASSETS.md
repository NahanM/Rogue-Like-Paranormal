# ASSETS.md: o que produzir pro teste

Tudo segue o `ESTILO.md`. Nada fora desta lista gasta crédito.

Prioridade:
- **P1**: sem isso não tem jogo
- **P2**: dá pra testar sem
- **P3**: o código resolve, não gasta crédito

## Cenário (na IA de imagem que tu usou pra fazer a arena)

| Arquivo | Tamanho | O que é | Prioridade |
|---|---|---|---|
| `arena_fundo.png` | 480x270 (vem da imagem grande reduzida por script) | A tua arena **sem o chefe, sem o personagem e sem fogo nos braseiros** (o fogo é animado à parte) | P1 |
| `arena_frente.png` | 480x270 com transparência | Só os pilares e braseiros da frente, recortados do fundo (sai por script) | P1 |
| `titulo.png` | 480x270 | A igreja refeita em 16:9 | P2 |

Dica: pra fazer o `arena_fundo.png`, **edita a imagem atual** pedindo pra remover o chefe e o personagem, em vez de gerar outra do zero. Assim a câmera e o enquadramento não mudam.

## Protagonista (PixelLab), 32 px de altura, 3 direções

| Animação | Frames | Prioridade |
|---|---|---|
| Parado | 2 a 4 | P1 |
| Andar | 6 (mínimo 4) | P1 |
| Rolar | 6 | P1 |
| Atacar (preparo, golpe, recuperação) | 4 | P1 |
| Beber frasco | 4 | P2 |
| Morrer | 4 | P2 |
| Tomar dano | 0 (flash no código) | P3 |

Base: `ref/protagonista.png`. Ordem: primeiro gera o personagem **parado nas 3 direções** e aprova. Só depois anima, pra não gastar crédito animando boneco errado.

## Chefe (~130 px de altura)

Truque pra economizar: o chefe quase não anima. Quem dá vida a ele são os efeitos e a luz.

| Pose | Frames | De onde vem | Prioridade |
|---|---|---|---|
| Parado | 1 (respira no código) | Recorte do chefe da tua arena atual (custo zero) | P1 |
| Preparando ataque | 1 | IA de imagem, mesma do cenário | P1 |
| Golpe | 1 a 2 | IA de imagem, mesma do cenário | P1 |
| Morte | 0 (vira faísca no código) | código | P3 |

Efeitos de ataque:

| Efeito | Tamanho | Frames | Prioridade |
|---|---|---|---|
| Raiz saindo do chão | 16x40 | 5 | P1 |
| Aviso no chão antes do ataque | código (círculo com dithering) | 0 | P3 |

## Efeitos e UI (Piskel ou código, sem crédito)

| Arquivo | Tamanho | Frames | Prioridade |
|---|---|---|---|
| Fogo do braseiro | 10x14 | 4 | P1 |
| Corte da espada | 24x24 | 3 | P1 |
| Frasco (cheio e vazio) | 6x8 | 2 | P1 |
| Poeira, brasas, faíscas | código | 0 | P3 |

## Ordem de produção

1. `arena_fundo.png` (sem ele não dá pra julgar mais nada)
2. Protagonista parado nas 3 direções, e tu aprova
3. Andar, rolar e atacar
4. Chefe: recorte, 2 poses novas e a raiz
5. Efeitos, UI e título
