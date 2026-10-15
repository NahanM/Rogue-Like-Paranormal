# COMBATE.md

Números iniciais da luta. Todos vão pro `src/game/config.ts` e serão ajustados jogando.
Tempos em segundos, distâncias em pixels da tela de 480x270. No código, converte pra unidades do mundo dividindo por `PX_POR_UNIDADE` (18,7, no `config.ts`).

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

Ele **anda atrás do jogador**: lento, pesado, e quando chega perto ou cansa de andar, ataca. São dois ataques, os dois com aviso claro e uma janela grande pra punir depois.

| Atributo | Valor |
|---|---|
| Nome | O Deus da Morte (a lore está no `docs/LORE.md`) |
| Vida | 300 (30 golpes) |
| Velocidade | 35 px/s (menos da metade do jogador: dá pra fugir andando) |
| Movimento | Fora dos ataques, anda em linha reta na direção do jogador, com colisão (desliza em pilar e estátua como o jogador). Para quando chega a 30 px dele |
| Corpo | Círculo de raio 20 px no pé. Empurra o jogador, mas encostar não dá dano |
| Área que leva dano | 40x30 px centrada no pé (plano do chão) |
| Pausa entre ataques | aleatória entre 1,2 e 2,0 s, andando atrás do jogador nesse tempo |
| Virado pra | o jogador (8 direções, ESTILO seção 8), menos no meio de um ataque, que trava a direção |

### Acordar

- O chefe dorme parado no centro do Símbolo da Morte, em (0, -1,2), até o jogador entrar no símbolo (raio 4,14)
- Ao acordar: faixa com o nome (ESTILO, seção 9), o símbolo acende e a barra de vida aparece. Primeiro ataque depois da pausa normal

### Escolha do ataque

- Jogador a menos de 70 px: 50% Queda, 50% Devastador
- Jogador mais longe: Queda
- Nunca dois Devastadores seguidos

### Ataque 1: Queda (o pulo)

| Fase | Duração | O que acontece |
|---|---|---|
| Agachar | 0,7 s | Parado, virado pro jogador. No fim, **trava o alvo** na posição do jogador naquele instante |
| No ar | 0,8 s | Vai em arco do ponto dele até o alvo, subindo até 2 unidades. No ar não leva dano e não colide com nada |
| Impacto | 0,1 s | Área ativa: círculo de raio 40 px no ponto da queda. 35 de dano, empurrão de 18 px |
| Preso no chão | 0,9 s | Não anda nem ataca. **É a janela pra punir** |

- Alcance máximo do pulo: 160 px. Se o jogador estiver mais longe, cai a 160 px dele, na direção do jogador
- O ponto da queda tem que caber o corpo dele (raio 20 px) no chão andável. Se não couber (pilar, estátua, borda), puxa o alvo de volta na direção do chefe até caber
- Como escapar: sair da marca do chão andando, ou rolar na hora da queda (a invencibilidade da rolagem cobre os 0,1 s do impacto)

### Ataque 2: Devastador

| Fase | Duração | O que acontece |
|---|---|---|
| Carga | 1,6 s | Parado. Aparece o círculo de aviso de raio 100 px em volta dele, escurecendo |
| Estouro | 0,15 s | Área ativa: o círculo inteiro. 55 de dano, empurrão de 24 px |
| Exausto | 1,4 s | Não anda nem ataca. A maior janela pra punir da luta |

- Como escapar: sair do círculo correndo (colado nele são 80 px a 75 px/s, dá 1,07 s, sobra tempo) ou rolar no estouro
- É o ataque que mata quem ficou gananciosamente batendo nele sem olhar o aviso

### Dano e empurrão

- O empurrão do chefe usa a mesma regra do "Tomar dano" do protagonista, só que com a distância de cada ataque no lugar dos 6 px
- Proteção Leve reduz o dano dele também, nos mesmos 25% de qualquer dano (já funciona assim no `player.ts`)

### Fase 2 (opcional)

- Abaixo de 50% de vida, Agachar e Carga ficam 20% mais curtos e a velocidade sobe pra 45 px/s

### Morrer na arena

- O chefe volta pro centro do símbolo, dormindo, com vida cheia

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
