import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR, bossEffects } from '../game/config';

// A tela do jogo são dois canvas de 480x270 empilhados (ESTILO, seção 1):
//   embaixo, o WebGL do three.js com a cena 3D
//   em cima, um canvas 2D transparente com o HUD
// Os dois ficam dentro de uma moldura que é ampliada por múltiplo inteiro.

const frame = document.createElement('div');
frame.id = 'screen';
document.body.appendChild(frame);

const glCanvas = document.createElement('canvas');
frame.appendChild(glCanvas);

// antialias desligado e pixel ratio 1: a cena é renderizada em 480x270 de verdade,
// e quem amplia é o CSS com image-rendering: pixelated (sem borrão)
export const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false });
renderer.setPixelRatio(1);
// false: não mexe no tamanho em CSS, quem cuida disso é o resize() daqui
renderer.setSize(GAME_WIDTH, GAME_HEIGHT, false);
renderer.setClearColor(BACKGROUND_COLOR);

const hudCanvas = document.createElement('canvas');
hudCanvas.width = GAME_WIDTH;
hudCanvas.height = GAME_HEIGHT;
frame.appendChild(hudCanvas);

const hudContext = hudCanvas.getContext('2d');
if (!hudContext) throw new Error('Canvas 2D indisponível pro HUD');
hudContext.imageSmoothingEnabled = false;
export const hud: CanvasRenderingContext2D = hudContext;

// Escala inteira (2x, 3x, ...) que cabe na janela; a sobra fica na cor do fundo.
// Exceção da ESTILO: em tela menor que 480x270, encolhe sem ser inteiro, pra caber.
let frameScale = 1; // guardada pra tremida converter pixel de jogo em pixel da janela
function resize(): void {
  const fit = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  frameScale = scale;
  frame.style.width = `${Math.floor(GAME_WIDTH * scale)}px`;
  frame.style.height = `${Math.floor(GAME_HEIGHT * scale)}px`;
}

window.addEventListener('resize', resize);
resize();

// --- Tremida de tela (ESTILO, seção 2) ---
// Os casos do jogo inteiro (números no config.ts, death.shake): golpe do
// chefe que acerta, chefe caindo do pulo, estouro do Devastador e morte
// do chefe. Implementação mínima: um deslocamento aleatório
// em pixels da tela de 480x270, re-sorteado a cada passo fixo, com a
// amplitude caindo em linha reta até zero. A moldura inteira anda junta
// (3D e HUD), e como a ampliação é inteira, um pixel de jogo cai num
// número exato de pixels da janela: nada borra. Quem chama é o main.ts:
// startScreenShake no evento, updateScreenShake no passo fixo e
// applyScreenShake no desenho
let shakeTimeLeft = 0;
let shakeDuration = 0;
let shakeAmplitude = 0;
let shakeOffsetX = 0;
let shakeOffsetY = 0;

// A mais forte prevalece: a morte do chefe (3 px) nunca é engolida por uma
// tremida de golpe (2 px) que já estiver no meio
export function startScreenShake(amplitudePx: number, durationSec: number): void {
  // ESTILO, seção 7: "Com prefers-reduced-motion: sem tremida". A checagem
  // aqui, na porta de entrada, conserta de uma vez TODAS as tremidas —
  // as antigas (golpe do chefe e morte) ignoravam a preferência. É
  // consultada a cada chamada porque a preferência pode ser ligada com o
  // jogo aberto (o main faz igual com o reducedMotion da câmera)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (shakeTimeLeft > 0 && amplitudePx < shakeAmplitude) return;
  shakeAmplitude = amplitudePx;
  shakeDuration = durationSec;
  shakeTimeLeft = durationSec;
}

// Passo fixo (lógica no update, como o resto do jogo)
export function updateScreenShake(dt: number): void {
  if (shakeTimeLeft <= 0) {
    shakeTimeLeft = 0;
    shakeAmplitude = 0;
    shakeOffsetX = 0;
    shakeOffsetY = 0;
    return;
  }
  shakeTimeLeft -= dt;
  const amp = Math.max(0, shakeTimeLeft / shakeDuration) * shakeAmplitude;
  // arredondado: a tremida anda em pixels inteiros da tela de jogo
  shakeOffsetX = Math.round((Math.random() * 2 - 1) * amp);
  shakeOffsetY = Math.round((Math.random() * 2 - 1) * amp);
}

// Quadro desenhado: a moldura anda; a sobra fica no fundo do body, que já é
// o BACKGROUND_COLOR da paleta (style.css), então a borda não "rasga"
export function applyScreenShake(): void {
  if (shakeOffsetX === 0 && shakeOffsetY === 0) {
    frame.style.transform = '';
    return;
  }
  frame.style.transform = `translate(${shakeOffsetX * frameScale}px, ${shakeOffsetY * frameScale}px)`;
}

// --- Piscada de tela do estouro do Devastador (ESTILO, seção 7) ---
// "tela inteira pisca #f5effd com 40% de opacidade por 2 frames". Mesmo
// esquema da tremida logo acima, e os números no bossEffects.flash do
// config: quem liga é o main.ts, no mesmo passo em que lê o
// devastatorBurstTrigger; o tempo derrete no passo fixo; o desenho pinta
// um retângulo no canvas do HUD. Como esse canvas fica POR CIMA do do
// WebGL e o retângulo cobre os 480x270 inteiros, a piscada tinge a cena
// 3D e o HUD de uma vez — "tela inteira" de verdade
let flashTimeLeft = 0;

// ESTILO, seção 7: "Com prefers-reduced-motion: sem tremida e sem a
// piscada da tela. O resto fica" — a checagem na porta de entrada, igual
// à da tremida acima, consultada a cada chamada porque a preferência
// pode ser ligada com o jogo aberto
export function startScreenFlash(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  flashTimeLeft = bossEffects.flash.duration;
}

// Passo fixo (lógica no update, como o resto do jogo). O dt é sempre o
// STEP do loop, então os 2/60 s derretem em exatamente 2 passos de jogo
export function updateScreenFlash(dt: number): void {
  if (flashTimeLeft > 0) flashTimeLeft = Math.max(0, flashTimeLeft - dt);
}

// Quadro desenhado: chamado por ÚLTIMO no draw() do main, depois do fade
// de sala — cobre tudo. Fora da piscada não desenha nada
export function drawScreenFlash(g: CanvasRenderingContext2D): void {
  if (flashTimeLeft <= 0) return;
  g.globalAlpha = bossEffects.flash.opacity;
  g.fillStyle = bossEffects.flash.color;
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.globalAlpha = 1;
}
