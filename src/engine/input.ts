// Entrada de teclado: estado das teclas e eixo de movimento.
// Escutamos no window (em vez do canvas) pra garantir que o foco não
// atrapalhe: o jogo não aceita cliques, tudo é pelo teclado.

const keysDown = new Set<string>();

// Teclas de movimento: WASD + setas. Usamos e.code (posição física da
// tecla, não a letra impressa) pra que layouts ABNT/EMU/etc funcionem igual.
// Setas e espaço rolam a página ou apertam botão por padrão; no jogo elas são controle
const BLOCKED_DEFAULTS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (BLOCKED_DEFAULTS.has(e.code)) e.preventDefault();
  keysDown.add(e.code);
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  keysDown.delete(e.code);
});

// Janela perdeu o foco (ex.: Alt+Tab): limpa tudo pra não "travar" o
// personagem andando pra sempre, já que o keyup pode ser perdido fora da aba.
window.addEventListener('blur', () => {
  keysDown.clear();
});

// x: direita positiva. y: pra baixo na tela positivo, que no mundo 3D é o z
// (z maior = mais perto da câmera = mais embaixo na tela, CENA3D)
export interface Axis {
  x: number;
  y: number;
}

// Retorna o vetor de movimento do jogador: 8 direções, já NORMALIZADO —
// na diagonal o comprimento do vetor seria sqrt(2) ~1.41, então dividimos
// pelo comprimento pra diagonal andar na mesma velocidade da reta.
export function getMoveAxis(): Axis {
  let x = 0;
  let y = 0;

  if (keysDown.has('ArrowLeft') || keysDown.has('KeyA')) x -= 1;
  if (keysDown.has('ArrowRight') || keysDown.has('KeyD')) x += 1;
  if (keysDown.has('ArrowUp') || keysDown.has('KeyW')) y -= 1;
  if (keysDown.has('ArrowDown') || keysDown.has('KeyS')) y += 1;

  const len = Math.hypot(x, y);
  if (len > 0) {
    x /= len;
    y /= len;
  }

  return { x, y };
}
