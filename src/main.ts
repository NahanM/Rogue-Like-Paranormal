import './style.css';
import { canvas, ctx } from './engine/canvas';
import { start } from './engine/loop';
import { register, loadAll, getImage } from './engine/assets';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BACKGROUND_COLOR,
  ARENA_PLACEHOLDER_PATH,
  DEBUG_FPS_X,
  DEBUG_FPS_Y,
  DEBUG_TEXT_COLOR,
} from './game/config';
import { Player } from './game/player';
import { drawDebugCollision } from './game/arena';

const player = new Player();

// --- Modo debug (F1) ---
// preventDefault evita que o F1 abra a ajuda do navegador.
let debugMode = false;

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F1') {
    e.preventDefault();
    debugMode = !debugMode;
  }
});

// --- Medição de FPS ---
// Média simples dos frames desenhados no último segundo: o loop chama
// draw() uma vez por frame do navegador, então é só contar e resetar.
let fpsCount = 0;
let fpsValue = 0;
let fpsLastSecond = -1;

// Atualização no passo fixo de 60 Hz: só o jogador por enquanto.
// A colisão com a arena (arena.json) já está aplicada dentro do update do player.
function update(dt: number): void {
  player.update(dt);
}

function draw(): void {
  // Fundo: arena cobrindo o canvas inteiro em 480x270.
  // Math.round nas posições conforme ESTILO seção 1 (desenho sempre inteiro,
  // mesmo que a origem seja 0, mantemos o hábito pra todas as chamadas),
  // e imageSmoothingEnabled já está desligado no canvas (sem borrão).
  ctx.drawImage(
    getImage('arena'),
    Math.round(0),
    Math.round(0),
    GAME_WIDTH,
    GAME_HEIGHT
  );

  // Jogador por cima do fundo da arena (ordem da ESTILO seção 4; a sombra
  // é desenhada dentro do draw do player, antes do corpo).
  player.draw(ctx);

  // FPS do segundo anterior (média simples de frames desenhados por segundo)
  updateFpsCounter();

  if (debugMode) {
    // Overlay de colisão ANTES do texto, pro FPS ficar legível por cima.
    // Passamos o pé do player porque o player ainda não expõe um método de debug.
    drawDebugCollision(ctx, player.x, player.y);
    // Fonte monoespaçada do sistema por ora: a fonte pixel-art definitiva
    // (ESTILO seção 9) entra numa sprint futura. Texto de debug não é parte
    // do jogo final, então a regra "fonte do sistema proibida" não se aplica aqui.
    ctx.fillStyle = DEBUG_TEXT_COLOR;
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`${fpsValue} FPS`, DEBUG_FPS_X, DEBUG_FPS_Y);
  }
}

// Conta frames desenhados no segundo atual; ao virar o segundo,
// fecha a média simples e recomeça a contagem.
function updateFpsCounter(): void {
  const second = Math.floor(performance.now() / 1000);
  if (second !== fpsLastSecond) {
    fpsValue = fpsCount;
    fpsCount = 0;
    fpsLastSecond = second;
  }
  fpsCount++;
}

// --- Inicialização ---
// O jogo só entra no loop depois que TODAS as imagens carregaram:
// desenhar antes disso mostraria um quadro vazio/quebrado.
// Se algum asset faltar, mostramos o erro no console e não iniciamos.
register('arena', ARENA_PLACEHOLDER_PATH);

loadAll()
  .then(() => {
    void canvas; // canvas já anexado à página no engine/canvas
    start(update, draw);
  })
  .catch((err: Error) => {
    console.error('Não foi possível iniciar o jogo:', err.message);
    // Desenha aviso na tela pra quem abrir sem servidor ver algo além de tela escura
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  });
