# AGENTS.md

Projeto: teste de um mini souls-like HD-2D no navegador. Uma arena, um protagonista e um chefe.

## Antes de qualquer tarefa

1. Leia o `PLANO.md` e trabalhe **só na sprint marcada como ATUAL**.
2. Se a tarefa tiver qualquer coisa visual, leia o `docs/ESTILO.md` antes. Ele manda: se o pedido conflitar com ele, pare e pergunte.
3. Se precisar de asset, confira o `docs/ASSETS.md`.

## Stack (não mude sem perguntar)

- Vite + TypeScript (template vanilla-ts)
- Canvas 2D puro. Proibido adicionar Phaser, Pixi, Three.js ou qualquer biblioteca de jogo
- Nenhuma dependência nova sem perguntar

## Estrutura

```
src/
  main.ts        inicializa e roda o loop
  engine/        canvas, loop, input, carregamento de assets, tremida de tela
  game/          player, boss, combate, arena (colisão), config.ts
  ui/            HUD e telas (título, morte, vitória)
public/assets/   imagens que o jogo carrega
ref/             referências só pra consulta; o jogo nunca carrega daqui
docs/            ESTILO.md, ASSETS.md e COMBATE.md (quando existir)
```

## Regras de código

- Loop com passo fixo de 60 atualizações por segundo; desenho a cada frame
- Toda coordenada do jogo é em pixels da tela de 480x270
- Números de ajuste (velocidade, dano, tempos, custos de stamina) ficam em `src/game/config.ts`, nunca soltos no meio do código
- Nomes de variáveis e funções em inglês; comentários em português, explicando o porquê
- Asset que ainda não existe: use placeholder (retângulo do tamanho certo, com cor da paleta) e avise no resumo
- Não renomeie nem apague assets. Não mexa em `ref/` nem em `docs/`

## Ao terminar a sprint

1. `npm run build` tem que passar sem erro
2. Marque no `PLANO.md` os itens feitos
3. Escreva um resumo curto: o que mudou, quais arquivos foram tocados, como testar no navegador e o que ficou faltando
