import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH, hud as cfg, player as playerCfg } from '../game/config';
import type { Player } from '../game/player';
import { drawPixelText, measurePixelText } from '../engine/pixel-text';

// HUD no canvas 2D por cima da cena (ESTILO, seção 9), em pixels da tela de
// 480x270: barras de vida e stamina (com rastro de dano) e a legenda dos
// controles. O estado do rastro mora neste módulo (mesmo padrão da caixa de
// descrição, ui/item-description.ts): o main chama updateHud no passo fixo
// e o drawHud só desenha o que o estado diz

// Exportadas (com o drawBar e o updateTrail abaixo) porque a barra do chefe
// (ui/boss-hud.ts, Sprint 7) reusa o desenho e a regra do rastro daqui em vez
// de duplicá-los
export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

// Barra com contorno de 1 px, fundo escuro, preenchimento sólido na cor dela
// e o RASTRO DE DANO (ESTILO, seção 9): a região perdida — entre a fração
// atual e a fração do rastro — pintada em ouro claro, por cima do fundo e
// ao lado do preenchimento. Só existe quando a fração atual é menor que a do
// rastro. Arredonda pra baixo pra nunca desenhar meio pixel.
export function drawBar(g: CanvasRenderingContext2D, bar: Bar, fraction: number, trailFraction: number): void {
  const clamped = Math.min(1, Math.max(0, fraction));
  const clampedTrail = Math.min(1, Math.max(0, trailFraction));
  const fillWidth = Math.floor(bar.width * clamped);
  const trailWidth = Math.floor(bar.width * clampedTrail);
  g.fillStyle = cfg.outline;
  g.fillRect(bar.x - 1, bar.y - 1, bar.width + 2, bar.height + 2);
  g.fillStyle = cfg.barBackground;
  g.fillRect(bar.x, bar.y, bar.width, bar.height);
  if (trailWidth > fillWidth) {
    g.fillStyle = cfg.trailColor;
    g.fillRect(bar.x + fillWidth, bar.y, trailWidth - fillWidth, bar.height);
  }
  g.fillStyle = bar.color;
  g.fillRect(bar.x, bar.y, fillWidth, bar.height);
}

// Estado do rastro de dano (ESTILO, seção 9: "a parte perdida fica em ouro
// claro e esvazia depois de 0,5 s"), em FRAÇÕES de barra. Começa cheio: o
// jogador nasce com vida e stamina no máximo
export interface TrailState {
  // fração que o rastro segura (o valor alto de antes da queda)
  value: number;
  // espera desde a última queda, em segundos
  timer: number;
  // fração do passo anterior, pra distinguir QUEDA NOVA (reinicia o
  // cronômetro) de espera em curso (o cronômetro só anda)
  prev: number;
}
const healthTrail: TrailState = { value: 1, timer: 0, prev: 1 };
const staminaTrail: TrailState = { value: 1, timer: 0, prev: 1 };

// O rastro de uma barra, rodando no passo fixo. Leitura literal do ESTILO,
// seção 9:
// - SUBIU (cura, regeneração de stamina, respawn enchendo tudo): o rastro
//   acompanha na hora — ouro nunca fica acima do preenchimento ("ouro acima
//   da barra cheia não existe"), e o rastro nunca fica abaixo do valor atual
// - QUEDA NOVA: o rastro assume o valor MAIS ALTO de antes da queda (se já
//   estava segurando de uma queda anterior, é ele) e o cronômetro recomeça
//   os 0,5 s
// - ESPERA: o rastro fica parado; passados os 0,5 s depois da queda, esvazia
//   DE UMA VEZ, ficando igual ao valor atual — o doc só diz "esvazia depois
//   de 0,5 s", sem animação intermediária, então não inventamos duração extra
export function updateTrail(state: TrailState, current: number, dt: number): void {
  if (current > state.value) {
    state.value = current;
    state.timer = 0;
  } else if (current < state.prev) {
    state.value = Math.max(state.value, state.prev);
    state.timer = 0;
  } else if (state.value > current) {
    state.timer += dt;
    if (state.timer >= cfg.trailDelay) state.value = current;
  }
  state.prev = current;
}

// Roda no passo fixo do main, só nos estados em que o jogo anda ('playing'
// e 'victory'): na transição de sala e na pausa de morte o rastro CONGELA
// junto com o jogo — mesma regra decidida pra caixa de descrição
// (ui/item-description.ts). No respawn a vida/stamina sobem ao máximo e a
// regra da subida acima zera o rastro sozinha
export function updateHud(dt: number, player: Player): void {
  updateTrail(healthTrail, player.health / playerCfg.maxHealth, dt);
  updateTrail(staminaTrail, player.stamina / playerCfg.maxStamina, dt);
}

// Legenda começa visível; a tecla C esconde e mostra
let controlsVisible = true;
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === cfg.controls.toggleKey && !e.repeat) controlsVisible = !controlsVisible;
});

// Duas colunas: teclas alinhadas pela direita, ações pela esquerda, no canto de baixo
function drawControls(g: CanvasRenderingContext2D): void {
  const c = cfg.controls;
  const gap = 4;
  const keyWidth = Math.max(...c.lines.map(([key]) => measurePixelText(key)));
  const labelWidth = Math.max(...c.lines.map(([, label]) => measurePixelText(label)));
  const left = c.rightX - keyWidth - gap - labelWidth;
  const top = c.bottomY - c.lines.length * c.lineHeight;

  g.globalAlpha = c.backdropOpacity;
  g.fillStyle = c.backdrop;
  g.fillRect(left - 3, top - 3, keyWidth + gap + labelWidth + 6, c.lines.length * c.lineHeight + 4);
  g.globalAlpha = 1;

  c.lines.forEach(([key, label], i) => {
    const y = top + i * c.lineHeight;
    drawPixelText(g, key, left + keyWidth, y, c.keyColor, 'right');
    drawPixelText(g, label, left + keyWidth + gap, y, c.labelColor);
  });
}

// Placeholder de ícone de item do HUD (ESTILO, seção 9), até os ícones
// finais chegarem — hoje não existe nenhum em public/assets/. Retângulo
// cheio na cor dele com contorno de 1 px, no mesmo truque das barras: a cor
// do contorno por trás, 1 px maior pra cada lado, e o preenchimento por cima.
// Tudo em coordenadas inteiras vindas do config, então nunca cai meio pixel
function drawIcon(g: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  g.fillStyle = cfg.outline;
  g.fillRect(x - 1, y - 1, width + 2, height + 2);
  g.fillStyle = color;
  g.fillRect(x, y, width, height);
}

// Cicatrizantes (seção 9: "x8 y254, um a cada 8 px", 6x8 cada): UM ícone por
// carga ATUAL. DÚVIDA DO DOC, decidida: o ESTILO não diz se aparecem "vagas
// vazias" até o máximo de 5 — leitura mínima: desenha só as cargas
// existentes; com 0 cargas não desenha nada
function drawHealCharges(g: CanvasRenderingContext2D, charges: number): void {
  const h = cfg.healCharges;
  for (let i = 0; i < charges; i++) {
    drawIcon(g, h.x + i * h.spacing, h.y, h.width, h.height, h.color);
  }
}

// Proteção Leve (seção 9: "Ícone da Proteção Leve (só se tiver)"): o doc é
// explícito — sem o item, NADA aparece. Com ele, o ícone fica em x8 y20,
// logo embaixo das barras
function drawProtection(g: CanvasRenderingContext2D, hasProtection: boolean): void {
  if (!hasProtection) return;
  const p = cfg.protection;
  drawIcon(g, p.x, p.y, p.size, p.size, p.color);
}

// Machadinhas (seção 9: "ícone em x56 y254, número ao lado"): ícone SEMPRE
// visível, com a munição ao lado. DÚVIDA DO DOC, decidida: o doc só
// condiciona a visibilidade do ícone da Proteção ("só se tiver"); deste não
// diz nada — leitura mínima: aparece sempre, mesmo com 0. O número tem o
// topo alinhado com o topo do ícone, 2 px depois dele, e reusa
// controls.keyColor (#e2cab1, texto da paleta) em vez de inventar cor
function drawHatchetAmmo(g: CanvasRenderingContext2D, ammo: number): void {
  const h = cfg.hatchet;
  drawIcon(g, h.x, h.y, h.size, h.size, h.color);
  drawPixelText(g, String(ammo), h.x + h.size + h.numberGap, h.y, cfg.controls.keyColor);
}

export function drawHud(g: CanvasRenderingContext2D, player: Player): void {
  g.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBar(g, cfg.health, player.health / playerCfg.maxHealth, healthTrail.value);
  drawBar(g, cfg.stamina, player.stamina / playerCfg.maxStamina, staminaTrail.value);
  drawHealCharges(g, player.healCharges);
  drawProtection(g, player.hasProtection);
  drawHatchetAmmo(g, player.hatchetAmmo);
  if (controlsVisible) drawControls(g);
}

// Fade da troca de sala (CENA3D, Sala 1: "a tela escurece em 0,3 s"), no
// preto da paleta. Só desenho: a opacidade é calculada no passo fixo
// (main.ts) e lida aqui, mesma separação da tremida de tela. Vai por cima
// de TODO o HUD, então é a última coisa desenhada no canvas 2D
export function drawRoomFade(g: CanvasRenderingContext2D, opacity: number): void {
  if (opacity <= 0) return;
  // o passo fixo pode estourar 1 por arredondamento; o canvas agradece o clamp
  g.globalAlpha = Math.min(1, opacity);
  g.fillStyle = BACKGROUND_COLOR;
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.globalAlpha = 1;
}
