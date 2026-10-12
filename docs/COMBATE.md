# COMBATE.md

Números iniciais da luta. Todos vão pro `src/game/config.ts` e serão ajustados jogando.
Tempos em segundos, distâncias em pixels da tela de 480x270.

## Controles

| Ação | Tecla |
|---|---|
| Andar | WASD ou setas |
| Rolar | Espaço (na direção em que está andando; parado, na direção em que está olhando) |
| Atacar | J ou botão esquerdo do mouse |
| Arremessar machadinha | F |
| Usar Cicatrizante | R |
| Pausar | Esc |

Itens no chão são pegos automaticamente ao pisar neles, como no jogo original.

## Protagonista

| Atributo | Valor |
|---|---|
| Vida | 100 |
| Velocidade andando | 75 px/s |
| Stamina | 100 |
| Recuperação de stamina | 30 por segundo, começa 0,6 s depois do último gasto |

Regra da stamina: dá pra agir com qualquer quantidade acima de zero, mesmo que o custo seja maior que o que sobrou. A stamina para no zero, nunca fica negativa.

### Rolar

| Atributo | Valor |
|---|---|
| Custo | 25 de stamina |
| Duração total | 0,45 s |
| Distância | 48 px |
| Invencível | de 0,10 s a 0,35 s da rolagem |
| Controle | não muda de direção no meio da rolagem |

### Atacar

| Fase | Duração |
|---|---|
| Preparo | 0,15 s |
| Golpe (área ativa) | 0,10 s |
| Recuperação | 0,30 s |

- Custo: 20 de stamina
- Dano no chefe: 10
- Área de acerto: retângulo de 24x16 colado na frente do personagem
- Sem combo no teste: depois da recuperação, pode atacar de novo
- Não dá pra rolar durante o preparo e o golpe; na recuperação, pode (cancela o resto)

### Cicatrizante (a cura)

O spray do jogo original, no papel do frasco de cura.

- Começa com 4 cargas; máximo de 5
- Cura **aleatória entre 25 e 50** de vida (o original também curava um valor sorteado)
- Animação de 1,0 s; a cura entra aos 0,7 s
- Enquanto usa, anda a 30% da velocidade
- Se tomar dano antes dos 0,7 s, perde a carga e não cura

### Tomar dano

- Empurrão de 6 px pra longe da fonte do dano
- 0,4 s de invencibilidade depois do acerto
- Flash branco (ESTILO, seção 8)
- Vida 0: animação de morte e tela de derrota

## Chefe

| Atributo | Valor |
|---|---|
| Nome | O Deus da Morte (a lore está no `docs/LORE.md`) |
| Vida | 300 (30 golpes) |
| Movimento | Não anda: fica enraizado no lugar dele na arena |
| Área que leva dano | 40x60 na base do corpo |
| Pausa entre ataques | aleatória entre 1,2 e 2,0 s (a janela pra punir) |

### Acordar

- O chefe dorme até o jogador entrar no círculo de ritual
- Ao acordar: faixa com o nome (ESTILO, seção 9), luz do círculo acende e a barra de vida aparece

### Escolha do ataque

- Jogador a menos de 70 px: 60% golpe em área, 40% raízes
- Jogador mais longe: 80% raízes, 20% onda

### Ataque 1: Raízes

- Marcas de aviso no chão: uma embaixo do jogador e mais 2 a 4 em lugares aleatórios do chão andável
- Aviso dura 0,8 s, depois a raiz sai e fica ativa por 0,4 s
- Dano: 25, raio de 12 px em cada raiz

### Ataque 2: Golpe em área

- Pose "preparando" por 0,9 s
- Área ativa de 80x40 na frente do chefe, por 0,2 s
- Dano: 35

### Ataque 3: Onda (opcional, se sobrar tempo)

- Pose "preparando" por 1,0 s
- Anel que sai do chefe e cresce a 140 px/s até a borda da arena
- Dano: 20. Só passa rolando por dentro dele (é o ataque que ensina a usar a invencibilidade da rolagem)

### Fase 2 (opcional)

- Abaixo de 50% de vida, todos os tempos de preparo ficam 20% mais curtos

## Sala 1 (antes da arena)

- Uma sala só, com a saída na parte de cima. Passou pela saída: a tela escurece em 0,3 s e o jogador aparece na entrada de baixo da arena
- Começa com 4 Perturbados de Energia e 2 Mulheres Afogadas
- Inimigos não passam pra arena

### Morrer

- Na sala 1: recomeça a sala inteira (inimigos e itens voltam)
- Na arena: volta na entrada da arena com vida cheia e as cargas de Cicatrizante que tinha ao entrar nela. O chefe volta com vida cheia

## Inimigos comuns

Os dois monstros do jogo original, adaptados pra tempo real. Inimigo morto não volta (até o jogador morrer na sala 1).

### Perturbado de Energia (fraco, perdido)

| Atributo | Valor |
|---|---|
| Vida | 20 (2 golpes) |
| Velocidade | 30 px/s |
| Movimento | Ignora o jogador: anda numa direção aleatória e troca de direção a cada 0,8 a 1,6 s |
| Ataque | Só por encostar: 10 de dano |
| Tamanho da área de dano | 14x14 |

Fiel ao original: ele não persegue. Só machuca quem esbarra nele.

### Mulher Afogada (moderada, caçadora)

| Atributo | Valor |
|---|---|
| Vida | 40 (4 golpes) |
| Velocidade | 55 px/s (mais lenta que o jogador, dá pra fugir) |
| Percebe o jogador | a 120 px |
| Ataque | Golpe curto: preparo 0,5 s, alcance de 20 px, 15 de dano, depois espera 1,0 s |
| Abaixo de 40% de vida | Foge do jogador a 60 px/s. Se ficar encurralada a menos de 20 px, ataca mesmo assim |

Fiel ao original: persegue enquanto está saudável e foge quando está ferida.

## Itens

Ficam espalhados no chão da sala 1. Na primeira vez que o jogador pega cada um, aparece a descrição do jogo original (`docs/LORE.md`).

| Item | Na sala 1 | Efeito |
|---|---|---|
| Machadinha | 3 no chão | Munição: carrega até 5. **F** arremessa na direção em que o jogador olha, a 200 px/s, com alcance de 64 px. Dano 15 (mata um Perturbado de uma vez). A machadinha some depois de arremessada, como no original |
| Proteção Leve | 1 no chão | Equipa sozinha ao pegar. Reduz todo dano recebido em 25% |
| Cicatrizante | 1 no chão | +1 carga de cura (até o máximo de 5) |

**Ficam pra versão 2** (precisam ser repensados pra tempo real, de preferência com o criador do jogo original): Coração Pulsante e Instrumental. A pergunta "S/N" no meio do dano quebra o ritmo de uma luta em tempo real.
