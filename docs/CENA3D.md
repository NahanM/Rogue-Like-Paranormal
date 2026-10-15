# CENA3D.md

Como montar as duas salas em 3D. Regras visuais (câmera, luz, escala) estão no `docs/ESTILO.md`. A referência que funciona é o `ref/arena-3d.html`: as posições abaixo são as dele.

## Eixos e unidades

- `x` pra direita, `y` pra cima, `z` **na direção da câmera** (z maior = mais embaixo na tela)
- O chão fica em `y = 0`
- 1 unidade ≈ 18,7 px na tela (`PX_POR_UNIDADE` no `config.ts`)
- Raio de colisão do jogador: 0,32

## Kit de peças

Todas as salas são montadas com estas peças. Cada uma é uma função que recebe a posição e devolve o objeto.

| Peça | Geometria | Textura | Observação |
|---|---|---|---|
| Chão | `CircleGeometry` (arena) ou `PlaneGeometry` (sala) | `chao_pedra` | densidade da ESTILO, seção 3 |
| Bloco de muro | `BoxGeometry` 1,55 × altura × 1,0 | `parede_tijolo` | muro da frente (z alto) baixo, entre 0,5 e 1,0, pra não esconder o jogador |
| Pilar com braseiro | caixa 1,1 × 2,2 × 1,1, tampa 1,4 × 0,24 × 1,4, bacia `CylinderGeometry(0.42, 0.28, 0.3, 8)` | `parede_tijolo`, `tampa_pedra` | chama + luz do braseiro em cima (ESTILO, seção 6). Colisão: círculo de raio 0,85 |
| Estátua | provisória: base + cilindro + esfera | | depois vira billboard com arte. Colisão: raio 0,75 |
| Símbolo da Morte | plano de 8,34 × 8,34 deitado, a 0,02 do chão | `simbolo_morte.png` (máscara branca) | substitui o círculo de ritual dourado (os anéis e os 8 raios saem). Cor e brilho na seção Arena |
| Veias | 12 linhas tortas de 2 a 3 texels de largura, da borda do símbolo até perto do muro, a 0,03 do chão | código | sangue |
| Poça | mancha irregular deitada, a 0,01 do chão, forma gerada por código com semente | código | sangue ou lodo |

## Texturas

- Enquanto as texturas finais não chegam, **gera por código** (como no protótipo), em 32x32, com a paleta da ESTILO: blocos de pedra com rejunte, pontinhos de desgaste, rachaduras e manchas de musgo.
- Quando existir o arquivo em `public/assets/texturas/` (ver `docs/ASSETS.md`), usa ele no lugar da gerada. Arquivo faltando = volta pra gerada, sem quebrar.

## Arena (sala do chefe)

| O quê | Onde |
|---|---|
| Chão andável | círculo de raio 10,2 em volta de (0, 0) |
| Muro | 44 blocos num anel de raio 11,4, com **entrada** embaixo no centro (z ≈ 11,4) |
| Pilares com braseiro | (-4,6, 4,3), (4,6, 4,3), (-4,9, -6,2), (4,9, -6,2) |
| Estátuas | (-8,6, -1,5), (8,6, 0,8) |
| Chefe | começa dormindo em (0, -1,2). **Anda**: não é mais obstáculo fixo no `arena.json`, o corpo dele (raio 20 px = 1,07) é tratado no código |
| Símbolo da Morte | centrado em (0, -1,2) |
| Jogador chega em | (0, 9,4) |

### Chão da arena (o lugar tem que parecer o covil da Morte)

- **Textura própria**, gerada por código (`chao_arena`): a mesma laje do `chao_pedra`, com o dobro de rachaduras, rejunte tomado de sangue seco (`#540b1a`) em uns 30% das frestas e respingos de lodo (`#1d0f12`, `#251619`). Sem musgo: nada vivo cresce aqui. A Sala 1 continua com o chão normal
- **Símbolo da Morte:** dormindo, cor `#2b2234` sem brilho (parece entalhado na pedra). Acordado, `#942c40` com o `emissive` pulsando (ESTILO, seção 6). No Devastador vai pro brilho máximo
- **Veias:** saem da borda do símbolo, tortas, se dividindo uma vez cada. `#540b1a` dormindo; acordado, pulsam junto com a luz do chefe, clareando até `#942c40`
- **Poças:** 10 manchas espalhadas (semente fixa), raio de 0,4 a 1,2. Metade sangue (`#540b1a` com borda `#942c40`), metade lodo (`#1d0f12` com borda `#412e29`). Nenhuma no caminho da entrada (x entre -1,5 e 1,5 com z > 6), pra a chegada ficar limpa
- Tudo isso é decalque: plano deitado, `MeshLambertMaterial` com `alphaTest`, pra pegar a luz do fogo e do chefe. Não muda a colisão

## Sala 1 (antes da arena)

| O quê | Onde |
|---|---|
| Chão andável | retângulo de x -8,6 a 8,6 e z -5,6 a 5,6 |
| Muro | em volta do retângulo, altura 2,4 nos fundos e nas laterais, 0,8 na frente |
| **Saída** | buraco de 2,4 de largura no muro dos fundos, no centro (z = -5,6) |
| Pilares com braseiro | (-4,5, -3,8), (4,5, -3,8) |
| Pilares sem braseiro | (-4,5, 2,2), (4,5, 2,2) |
| Jogador começa em | (0, 4,6) |
| Perturbados de Energia | (-6, -2), (6, -2,5), (-2, 0,5), (2,5, 1,5) |
| Mulheres Afogadas | (-6, 3,5), (6, 0,5) |
| Machadinhas | (-7,5, 4,8), (7,6, -4,8), (0, -4) |
| Proteção Leve | (-7,6, -4,8) |
| Cicatrizante | (7,5, 4,8) |

Passou pela saída: a tela escurece em 0,3 s e o jogador aparece em (0, 9,4) da arena.

## Formato dos arquivos de colisão

`src/game/arena.json`
```json
{
  "chao": { "tipo": "circulo", "x": 0, "z": 0, "raio": 10.2 },
  "obstaculos": [
    { "x": -4.6, "z": 4.3, "r": 0.85 },
    { "x": 4.6, "z": 4.3, "r": 0.85 },
    { "x": -4.9, "z": -6.2, "r": 0.85 },
    { "x": 4.9, "z": -6.2, "r": 0.85 },
    { "x": -8.6, "z": -1.5, "r": 0.75 },
    { "x": 8.6, "z": 0.8, "r": 0.75 }
  ],
  "chegada": { "x": 0, "z": 9.4 }
}
```

`src/game/sala1.json` segue a mesma ideia, com `"chao": { "tipo": "retangulo", "xMin": -8.6, "xMax": 8.6, "zMin": -5.6, "zMax": 5.6 }`, a `"saida"`, o `"inicio"`, e as listas `"inimigos"` e `"itens"` com as posições da tabela acima.

Movimento com colisão: tenta andar inteiro; se bater, tenta só no x; depois só no z (desliza na parede). Igual ao protótipo e à Sprint 1.

## Debug (F1)

- Desenha no chão os círculos de colisão e a borda andável (linhas finas, `#7f78a1` pro chão e `#b03a48` pros obstáculos)
- Mostra o FPS no HUD
- Bloqueia o comportamento padrão da tecla (senão o navegador abre a ajuda)
