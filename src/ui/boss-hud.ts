import { hud as cfg, boss as bossCfg, GAME_WIDTH, GAME_HEIGHT, font } from '../game/config';
import { drawPixelText, measurePixelText } from '../engine/pixel-text';
import type { Boss, BossState } from '../game/boss';
import { drawBar, updateTrail, type TrailState } from './hud';

// Nome e barra de vida do chefe no HUD (ESTILO, seção 9, tabela: nome em x90
// y238, barra de 300x4 em x90 y248; nota de barras: contorno de 1 px,
// preenchimento sólido e rastro de dano — vale pra ela também). Módulo com
// estado próprio, mesmo padrão do hud.ts e do item-description.ts: o
// cronômetro do rastro anda no PASSO FIXO (updateBossHud, chamada do main)
// e o desenho (drawBossHud) só lê o estado, nunca decide na hora de desenhar.
// Nada duplicado: a barra sai do drawBar e o rastro do updateTrail, ambos
// exportados do ui/hud.ts.
// Aqui também mora a FAIXA DE ENTRADA do chefe (ESTILO, seção 9), com
// cronômetro próprio na mesma regra: anda no passo fixo, desenha só lendo.

// O rastro do chefe segue a mesma regra do do jogador (ESTILO §9: "a parte
// perdida fica em ouro claro e esvazia depois de 0,5 s"). Estado em frações
// de barra, começando cheio: o chefe nasce dormindo com o máximo
// (boss.maxHealth = 300, COMBATE.md)
const healthTrail: TrailState = { value: 1, timer: 0, prev: 1 };

// Estado da faixa de entrada: cronômetro próprio (-1 = parada; senão,
// segundos desde o disparo — o ciclo inteiro dura fadeIn + hold + fadeOut
// = 3 s) mais o estado do chefe do passo anterior, pra detectar a BORDA
// (edge) de acordar. Inicializa em 'sleep', que é como o chefe nasce: se a
// primeira chamada já o vir 'awake', a transição conta mesmo assim
const banner = { timer: -1 };
let prevBossState: BossState = 'sleep';

// Progresso da faixa, 0 a 1: sobe linear no fadeIn, fica em 1 no hold,
// desce linear no fadeOut. LINEAR de propósito — DÚVIDA DO DOC, decidida:
// o ESTILO §9 não fala em easing, então nada de suavização. 0 = nada é
// desenhado (faixa parada ou ciclo acabado de encerrar)
function bannerProgress(): number {
  if (banner.timer < 0) return 0;
  const b = cfg.boss.banner;
  if (banner.timer < b.fadeIn) return banner.timer / b.fadeIn;
  if (banner.timer < b.fadeIn + b.hold) return 1;
  return 1 - (banner.timer - b.fadeIn - b.hold) / b.fadeOut;
}

// Passo fixo. O main só chama isto onde a luta existe: na arena em
// 'playing' (onde o update do boss roda) e em 'victory' (chefe morto: o
// realinhamento abaixo zera o ouro de graça). Na sala 1, na 'transition' e
// na 'dead' o rastro e a faixa CONGELAM junto com o jogo — mesma regra já
// adotada pro rastro do jogador (updateHud) e pra caixa de descrição
export function updateBossHud(dt: number, boss: Boss): void {
  // Faixa de entrada ANTES do resto: ela não se prende ao 'awake' (o return
  // do rastro abaixo não pode pular ela). A borda sleep → awake deste passo
  // é a "entrada do chefe" e dispara o cronômetro. DÚVIDA DO DOC, decidida:
  // o ESTILO não diz quando repetir — leitura: uma vez POR ACORDAR. Morrer
  // na arena reseta o chefe pra 'sleep' (boss.reset), então a próxima
  // entrada no círculo toca a faixa de novo
  if (prevBossState === 'sleep' && boss.state === 'awake') banner.timer = 0;
  prevBossState = boss.state;
  if (banner.timer >= 0) {
    banner.timer += dt;
    const b = cfg.boss.banner;
    if (banner.timer >= b.fadeIn + b.hold + b.fadeOut) banner.timer = -1;
    // DE PROPÓSITO a faixa não é cancelada quando o chefe morre: no caso
    // raro da morte nos primeiros 3 s da luta, ela termina o ciclo
    // normalmente — a faixa é da ENTRADA, não da barra de vida
  }
  const fraction = boss.health / bossCfg.maxHealth;
  if (boss.state !== 'awake') {
    // Dormindo ou morto, o rastro é REALINHADO ao valor atual em vez de
    // seguir a regra de segurar ouro (planicíe: dormindo = vida cheia de
    // fábrica; morto = zero e nem há barra desenhada; no reset pós-derrota o
    // boss.reset volta a 'sleep' com 300). Sem este ajuste ficaria ouro
    // fantasma da última porrada: a virada dormindo→acordado da próxima
    // tentativa sobe a vida sem ser uma "queda", então o updateTrail nunca
    // reiniciaria o relógio pra baixar a fatia presa
    healthTrail.value = fraction;
    healthTrail.prev = fraction;
    healthTrail.timer = 0;
    return;
  }
  updateTrail(healthTrail, fraction, dt);
}

// Desenho uma vez por quadro, entre o drawHud e o drawItemDescription (o
// fade de sala vem depois e cobre tudo). DÚVIDA DO DOC, decidida: o ESTILO
// não diz QUANDO a barra aparece — a tabela só dá posição e tamanho. Leitura:
// a barra é DA LUTA — aparece quando o chefe acorda (mesmo gatilho do círculo
// de ritual aceso) e some dormindo ou morto. Assim o reset pós-morte do
// jogador (vida a 300, estado 'sleep') some a barra junto, limpa pra próxima.
// A faixa de entrada NÃO segue esse corte: desenhada depois de nome+barra,
// ela termina o ciclo mesmo com o chefe já morto (ver updateBossHud)
export function drawBossHud(g: CanvasRenderingContext2D, boss: Boss): void {
  const c = cfg.boss;
  if (boss.state === 'awake') {
    drawPixelText(g, c.name, c.nameX, c.nameY, c.textColor);
    drawBar(g, c.bar, boss.health / bossCfg.maxHealth, healthTrail.value);
  }
  const p = bannerProgress();
  if (p === 0) return; // alpha 0: nada desenhado
  const b = c.banner;
  // Retângulo de largura total (480) por 24 px. "No meio da tela" (§9): y é
  // derivado da regra, (altura da tela − altura da faixa) / 2 — não vira
  // número novo no config
  const y = (GAME_HEIGHT - b.height) / 2;
  g.globalAlpha = b.opacity * p; // pico 0,7: o "70% de opacidade" do §9
  g.fillStyle = b.color;
  g.fillRect(0, y, GAME_WIDTH, b.height);
  // Nome centralizado na faixa, por cima do retângulo. Horizontal pela
  // largura medida, porque o drawPixelText só alinha 'left'/'right'; o topo
  // da linha em y + (24 − 8) / 2, porque a Silkscreen desenha 8 px de glifo
  // (font.size). DÚVIDA DO DOC, decidida: o texto entra e sai JUNTO com a
  // faixa (mesmo progresso p, também linear) — o §9 anima "a faixa" como um
  // todo; nome a alpha cheio desde o instante zero daria um "pop" de texto
  // flutuando antes do fundo aparecer
  g.globalAlpha = p;
  drawPixelText(g, c.name, (GAME_WIDTH - measurePixelText(c.name)) / 2, y + (b.height - font.size) / 2, c.textColor);
  g.globalAlpha = 1;
}
