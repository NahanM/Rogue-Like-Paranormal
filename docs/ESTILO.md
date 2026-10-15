# ESTILO.md

Regras visuais do teste. Toda tarefa visual segue este arquivo. Se um pedido conflitar com algo daqui, pergunte antes de inventar.

O jogo é **HD-2D**: cenário 3D de verdade, personagens em sprite 2D, câmera de ângulo fixo e tudo renderizado em pixel baixo. A montagem da cena (posições, peças, colisão) está no `docs/CENA3D.md`.

Referências (pasta `ref/`, na raiz do projeto):
- `ref/arena-3d.html`: **protótipo que funciona**. Abre no navegador e usa como referência de câmera, luz, escala e billboard. É three.js r128 num arquivo só: copia a abordagem, não o código às cegas
- `ref/arena.png`: clima, paleta e detalhe de textura que a gente quer alcançar
- `ref/protagonista.png`: folha do personagem
- `ref/igreja.png`: base da tela de título

## 1. Resolução

- O three.js renderiza num canvas de **480x270**: `renderer.setPixelRatio(1)`, `renderer.setSize(480, 270, false)`, `antialias: false`.
- O canvas é ampliado só por **múltiplo inteiro** (2x, 3x, 4x) via CSS, com `image-rendering: pixelated`. O que sobrar vira borda `#050409`.
- Toda textura usa `NearestFilter` (magnificação e minificação) e sem mipmap. Nada é suavizado.
- O HUD é um segundo canvas 2D de 480x270 por cima do canvas 3D, ampliado igual.

## 2. Câmera

- `PerspectiveCamera` com fov 30.
- Posição = alvo + (0, 21, 17), sempre olhando pro alvo. **O ângulo nunca muda**: sem girar, sem zoom.
- O alvo segue o jogador **pela metade** (alvo = posição do jogador × 0,5, puxado 0,3 pra cima como no protótipo), com suavização `1 - e^(-4·dt)`. Assim a arena fica quase toda na tela e a câmera ainda acompanha.
- Com `prefers-reduced-motion`, sem suavização.
- Tremida só nestes casos: golpe do chefe que acerta (2 px, 120 ms), chefe caindo do pulo (3 px, 200 ms), estouro do Devastador (4 px, 400 ms) e morte do chefe (3 px, 400 ms).

## 3. Escala

Constante `PX_POR_UNIDADE = 18.7` no `config.ts`: 1 unidade do mundo dá uns 18,7 px na tela de 480x270, no centro da arena. Todo número em px do `COMBATE.md` é convertido com ela.

Os personagens vêm do PixelLab (`public/assets/personagens/`). O tamanho do plano sai do tamanho do PNG: **lado do PNG × escala ÷ 18,7**.

| Elemento | PNG | Escala | Boneco na tela | Plano no mundo | Linha do pé no PNG |
|---|---|---|---|---|---|
| Protagonista | 32x32 | 1x | ~29 px | 1,71 × 1,71 | 29 (2 px acima da borda de baixo) |
| Perturbado de Energia | 32x32 | 1x | ~29 px | 1,71 × 1,71 | 29 |
| Mulher Afogada | 48x48 | 1x | ~46 px | 2,57 × 2,57 | 46 (1 px acima) |
| Chefe | 48x48 | **2x** | ~92 px | 5,13 × 5,13 | 46 (2 px na tela, por causa do 2x) |
| Item no chão | 8x8 | 1x | 8 px | 0,45 (o que já está no código) | 7 |

- O plano no mundo é antes de multiplicar a altura por `BILLBOARD_STRETCH` (seção 4).
- **O chefe é a única exceção da densidade:** cada texel dele vira 2x2 px na tela, pra ele ficar com o dobro do tamanho dos outros. Sempre 2x inteiro com `NearestFilter`, nunca 1,5x ou 2,7x.
- A linha do pé é fixa por personagem (não por direção), pra o boneco não pular 1 px quando vira. Ela é que fica em `y = 0`.
- **Densidade de textura:** 32 texels a cada 1,71 unidade (1 texel ≈ 1 pixel na tela). Ajusta o `repeat` de cada textura pra manter isso. Textura esticada ou espremida quebra o visual.
- Sprite nunca é girado no código. Pode só espelhar na horizontal.

## 4. Personagens e profundidade

- Personagens, itens e chefe são **billboards em pé**: um plano com a imagem, sem rotação nenhuma (a câmera nunca gira, então ele já fica de frente pra ela), com a origem no pé e a altura multiplicada por `BILLBOARD_STRETCH` (`src/engine/billboard.ts`), pra ficar com o tamanho certo na tela.
- **Não** copie o `quaternion` da câmera: com ela olhando de cima, o plano fica deitado pra trás e a parte de cima do boneco entra nos pilares e no muro.
- Material dos billboards: `MeshLambertMaterial` com `alphaTest: 0.5` e `DoubleSide`, **pra receberem a luz** da cena (o roxo da mão, o fogo, o vermelho do chefe).
- Sombra: círculo `#050409` com 55% de opacidade deitado no chão. Raio 0,42 unidade no protagonista e no Perturbado, 0,6 na Mulher, 1,2 no chefe.
- Quem fica na frente de quem é resolvido pelo 3D. Não existe recorte nem ordenação manual.

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
- Ouro da UI (rastro de dano, nome de item): `#dcbe74` `#fce6af`
- Roxo da luz do protagonista: `#6a5ba3` `#8e7ad0` `#f5effd` (núcleo)
- Sangue: `#540b1a` `#942c40`
- Faísca do chefe: `#cf9ba3` `#eeb4c5`
- Lodo do chefe (tirado do sprite dele): `#1d0f12` `#251619` `#412e29` `#554131`

**UI**
vida `#b03a48`*, stamina `#5f8a45`*, rastro de dano `#fce6af`, fundo de barra `#0e0d16`, contorno `#050409`, texto `#e2cab1`

Regras:
- **Texturas e sprites** são pintados com esta paleta. As texturas usam os tons médios e claros da pedra, porque a luz da cena escurece tudo.
- A luz do 3D vai criar tons entre essas cores. Isso é esperado. Um filtro de paleta no fim da renderização pode vir depois, se precisar.
- Cor de destaque só aparece onde existe fonte de luz ou magia.

## 6. Luz (luz de verdade do three.js)

| Luz | Tipo | Cor | Intensidade (r186, no `config.ts`) | No protótipo (r128) | Alcance | Comportamento |
|---|---|---|---|---|---|---|
| Geral | Ambient | `#b8a8d0` | 0,85 | 0,42 | | estável |
| Braseiro | Point, **decay 1** | `#dd7530` | 4,6 | 1,6 (decay 2) | 9,5 | varia 12% pra mais ou pra menos a cada 80 a 120 ms |
| Mão do protagonista | Point, decay 2 | `#8e7ad0` | 5,0 | 1,5 | 6,5 | 0,35 unidade pro lado em que ele olha, a 0,9 de altura |
| Chefe | Point, **decay 1** | `#942c40` | 40 | 1,6 (decay 2) | 10 | **anda junto com ele**, a 2,5 de altura. Pulsa devagar (seno, ±25%). Nos ataques, ver seção 7 |
| Símbolo da Morte (chão da arena) | sem luz, `emissive` | `#942c40` | | | | apagado até o chefe acordar; depois o `emissive` pulsa entre 30% e 100% (ciclo de 2 s) |

- Neblina: `Fog` `#050409` de 24 a 44 unidades.
- **Versão do three:** o jogo usa r186, onde a luz é física. Os números da coluna r186 já foram calibrados com o protótipo aberto lado a lado e valem; os do protótipo ficam só de referência. Fogo e chefe usam decay 1 porque, com decay 2, a tampa do pilar (colada na luz) estoura de branco antes do chão ficar iluminado. Toda textura de cor usa `colorSpace = SRGBColorSpace`. Luz nova: começa perto das que já existem e calibra olhando a cena.
- Chamas dos braseiros: `Sprite` sem luz (brilha sozinho), 8x12 texels, altura oscilando junto com a luz.

## 7. Partículas

- Poeira: `Points` de 1 px na tela (`sizeAttenuation: false`), `#7f78a1`, umas 150 na cena, subindo 0,25 unidade por segundo.
- Brasas: 1 px, `#ffdd9b`, 5 por braseiro, subindo e renascendo na bacia.
- Faíscas do chefe: 1 px, cores de faísca, saindo do topo dele.

### Efeitos do chefe

Ainda não tem animação desenhada dele (só o parado), então **a pose vem do código**: esticar e achatar o plano (sem girar, seção 3), tremer, partículas e luz. Toda partícula é pixel inteiro, sem blur, com as cores da paleta.

**Queda (o pulo)**
- Agachar: o sprite achata (altura 85%, largura 110%, sempre com o pé no chão) e treme 1 px pros lados. Poeira `#7f78a1` sobe dos pés
- Saída: estica (altura 115%, largura 90%) por 0,1 s e volta ao normal no ar. Deixa um rastro de 3 cópias do sprite pelo caminho, com 30%, 20% e 10% de opacidade, que somem em 0,2 s
- No ar: a sombra fica no chão embaixo dele. No alvo aparece a marca da queda: círculo `#050409` que cresce de 20% a 100% do raio do impacto durante o voo, com um anel `#942c40` na borda que pisca a cada 0,1 s nos últimos 0,3 s
- Impacto: achata a 70% de altura por 0,1 s e volta. Anel de choque fino `#eeb4c5` que cresce de 0 a 70 px em 0,3 s, escurecendo pra `#942c40` e sumindo. 24 lascas de pedra (2x2 px, tons da pedra) voando com gravidade, quicando uma vez e sumindo. Leque de 40 pontos de poeira. Rachadura no chão (linhas `#050409` tortas saindo do ponto, gerada por código) que some em 4 s. Mancha de lodo `#1d0f12` que fica 6 s. Luz do chefe em 2x por 0,15 s. Tremida (seção 2)

**Devastador**
- Carga (1,6 s): partículas de lodo (`#412e29`, `#251619`) e sangue (`#942c40`) saem da borda do círculo de aviso e são **sugadas pro corpo dele**, cada vez mais rápido e em maior quantidade. O tremor do sprite cresce de 0 a 2 px. A luz dele sobe de 1x a 3x. O Símbolo da Morte no chão vai pro brilho máximo. O círculo de aviso escurece com dithering conforme carrega (25%, 50%, 75% dos pixels)
- Estouro: tela inteira pisca `#f5effd` com 40% de opacidade por 2 frames. Anel de choque grosso (3 px) até a borda do aviso em 0,2 s. 60 partículas de sangue e lodo pra cima e pra fora, caindo com gravidade. Luz em 5x por 0,1 s e volta. Tremida (seção 2)
- Exausto: ele fica curvado (altura 92%) e soltando faíscas devagar até se recuperar

- Com `prefers-reduced-motion`: sem tremida e sem a piscada da tela. O resto fica.

## 8. Animação

- Jogo a 60 fps; sprites animam a 10 fps.
- Personagens em **8 direções**, com os nomes do PixelLab: `south` (baixo na tela, z+), `south-east`, `east` (direita, x+), `north-east`, `north`, `north-west`, `west`, `south-west`. A direção sai do vetor pra onde ele olha, em fatias de 45°. Não espelha: o PixelLab já manda as 8.
- Por enquanto só existe o `parado/` de cada um. Andando sem animação própria: o sprite parado sobe e desce 1 px a cada passo (no chefe, 2 px, por causa do 2x).
- Quando chegar uma animação nova, ela entra numa pasta irmã do `parado/` com o mesmo esquema de direções (`docs/ASSETS.md`).
- Tomar dano: o sprite fica branco (`#f5effd`) por 2 frames do jogo. Feito no código.
- Morte do chefe: ele se desfaz em faíscas no código, sem animação desenhada.
- Perturbado de Energia ("forma plasmática inconsistente"): opacidade oscilando entre 60% e 80% a cada 0,2 s.
- Machadinha em voo: 4 frames de giro desenhados.
- Item no chão: sobe e desce 1 px a cada 0,5 s.

## 9. HUD (coordenadas em 480x270, no canvas 2D de cima)

| Item | Posição | Tamanho |
|---|---|---|
| Barra de vida | x8 y8 | 100x4 |
| Barra de stamina | x8 y14 | 80x3 |
| Ícone da Proteção Leve (só se tiver) | x8 y20 | 8x8 |
| Cicatrizantes | x8 y254, um a cada 8 px | 6x8 cada |
| Machadinhas | ícone em x56 y254, número ao lado | 8x8 |
| Nome do chefe | x90 y238 | fonte 8 px |
| Barra do chefe | x90 y248 | 300x4 |
| Caixa de descrição de item | centralizada, y196 | 300x44 |
| Legenda dos controles | canto de baixo à direita, alinhada em x472, de baixo pra cima a partir de y262 | fonte 8 px, a tecla C esconde |

- Barras: contorno de 1 px, preenchimento sólido e **rastro de dano** (a parte perdida fica em ouro claro e esvazia depois de 0,5 s).
- Entrada do chefe: faixa preta com 70% de opacidade, 24 px de altura, no meio da tela, com o nome centralizado. Aparece em 0,5 s, fica 2 s, some em 0,5 s.
- Caixa de descrição: fundo `#050409` com 85% de opacidade, contorno de 1 px `#4c3d4c`, nome do item em `#fce6af` e texto em `#e2cab1`. Some depois de 4 s ou quando o jogador aperta qualquer tecla.
- Fonte: **Silkscreen** (licença OFL, arquivo em `public/assets/fonts/`), em 8 px. Os acentos "ÇÃÉÊÕ" já foram testados. Todo texto do HUD passa pelo `drawPixelText` (`src/engine/pixel-text.ts`), que tira a suavização das letras.

## 10. Tela de título

- `titulo.png` em 480x270 (a igreja, refeita em 16:9), nome do jogo e "PRESSIONE ENTER" piscando a cada 0,6 s.
- Embaixo, em texto pequeno: "Baseado em Roguelike de Terminal, de Gaardenn".

## 11. Proibido

- Antialias, blur, filtro linear em textura, fonte do sistema
- Ampliação do canvas por número não inteiro (exceto em tela menor que 480 px)
- Girar a câmera, dar zoom ou mudar o ângulo
- Sprite de personagem com `MeshBasicMaterial` ou `SpriteMaterial` (fica sem luz e parece colado por cima)
- Copiar cena, chefe, nomes ou textos do vídeo de referência: de lá só vem o estilo
