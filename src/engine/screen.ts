import * as THREE from 'three';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from '../game/config';

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
function resize(): void {
  const fit = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  frame.style.width = `${Math.floor(GAME_WIDTH * scale)}px`;
  frame.style.height = `${Math.floor(GAME_HEIGHT * scale)}px`;
}

window.addEventListener('resize', resize);
resize();
