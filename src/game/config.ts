// Configurações de ajuste do jogo.
// Toda coordenada/tamanho aqui é em pixels da tela interna de 480x270.

// Resolução interna fixa (ESTILO, seção 1)
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

// Cor mais escura da paleta: usada nas bordas da janela e como cor de fundo
export const BACKGROUND_COLOR = '#050409';

// Contador de FPS do modo debug (HUD interna, coordenadas em 480x270).
// Cor de texto da paleta (#e2cab1, ESTILO seção 5 - texto de UI).
export const DEBUG_FPS_X = 4;
export const DEBUG_FPS_Y = 8;
export const DEBUG_TEXT_COLOR = '#e2cab1';

// Assets do jogo (caminhos relativos à pasta public/)
export const ARENA_PLACEHOLDER_PATH = 'assets/arena_placeholder.png';

// Protagonista placeholder (retângulo até chegar o sprite, Sprint 7).
// Cor e tamanho da paleta: #b89f91 é o tom médio do casaco (ESTILO seção 5).
export const player = {
  width: 16, // largura do corpo em px
  height: 32, // altura do corpo em px (ESTILO seção 3)
  speed: 70, // pixels por segundo
  startX: 240, // centro da arena
  startY: 200, // ponto de partida razoável abaixo do centro
  // Sombra conforme ESTILO seção 4: elipse 14x5, #050409 a 50%
  shadowWidth: 14,
  shadowHeight: 5,
  shadowOpacity: 0.5,
  shadowColor: '#050409',
  color: '#b89f91',
};

// Colisão da arena: as posições dos pilares ficam em arena.json;
// aqui ficam só os raios (número de ajuste), na mesma ordem do JSON.
// Raio ~12 cobre a base visual dos pilares de tocha e das meio-colunas.
export const arena = {
  pillarRadii: [12, 12, 14, 14],
};

// Overlay de debug da colisão (F1): cores da paleta com opacidade baixa,
// pra enxergar a arena por baixo. #7f78a1 e #b03a48 (ESTILO seção 5).
export const debugCollision = {
  floorColor: '#7f78a1',
  floorOpacity: 0.3,
  pillarColor: '#b03a48',
  pillarOpacity: 0.3,
  footColor: '#e2cab1', // ponto do pé, mesma cor do texto de debug
};
