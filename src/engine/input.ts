// Entrada do jogo: estado das teclas (movimento), eixo de movimento e
// ações de aperto único (rolar, atacar, curar).
// Escutamos no window (em vez do canvas) pra garantir que o foco não
// atrapalhe. O botão esquerdo do mouse também é entrada: ataque (COMBATE.md,
// Controles).

const keysDown = new Set<string>();

// Ações de aperto único (borda de descida), na nomenclatura do jogo.
export type Action = 'roll' | 'attack' | 'heal' | 'throw';

// Apertos acumulados entre um passo fixo e outro. O teclado é assíncrono e o
// jogo anda a 60 Hz: sem este conjunto, um aperto entre dois passos se perderia.
// Cada aperto entra aqui UMA vez e é consumido uma única vez (consumeAction).
const pendingActions = new Set<Action>();

// Tecla física -> ação. O ataque também tem entrada pelo mouse, num listener
// separado mais abaixo. F (arremessar machadinha, COMBATE.md Controles) NÃO
// entra no BLOCKED_DEFAULTS: não rola página nem abre nada por padrão
const ACTION_KEYS: Partial<Record<string, Action>> = {
  Space: 'roll',
  KeyJ: 'attack',
  KeyR: 'heal',
  KeyF: 'throw',
};

// Teclas de movimento: WASD + setas. Usamos e.code (posição física da
// tecla, não a letra impressa) pra que layouts ABNT/EMU/etc funcionem igual.
// Setas e espaço rolam a página ou apertam botão por padrão; no jogo elas são controle
const BLOCKED_DEFAULTS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (BLOCKED_DEFAULTS.has(e.code)) e.preventDefault();
  keysDown.add(e.code);
  // e.repeat é a auto-repetição do sistema ao segurar a tecla: ignoramos,
  // porque segurar Espaço não é rolar em cadeia — é um aperto só
  if (!e.repeat) {
    const action = ACTION_KEYS[e.code];
    if (action !== undefined) pendingActions.add(action);
  }
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  keysDown.delete(e.code);
});

// Botão esquerdo do mouse = ataque (COMBATE.md, Controles). Sem preventDefault:
// nada mais na página depende de clique.
window.addEventListener('mousedown', (e: MouseEvent) => {
  if (e.button === 0) pendingActions.add('attack');
});

// Janela perdeu o foco (ex.: Alt+Tab): limpa tudo pra não "travar" o
// personagem andando pra sempre, já que o keyup pode ser perdido fora da aba.
// Os apertos pendentes também morrem aqui: voltar pra aba não pode disparar
// uma ação apertada quem sabe quando.
window.addEventListener('blur', () => {
  keysDown.clear();
  pendingActions.clear();
});

// Devolve true uma única vez por aperto: o primeiro passo fixo que perguntar
// pela ação a consome do conjunto. Apertos entre passos não se perdem, mas
// também não disparam a ação duas vezes.
export function consumeAction(action: Action): boolean {
  if (!pendingActions.has(action)) return false;
  pendingActions.delete(action);
  return true;
}

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
