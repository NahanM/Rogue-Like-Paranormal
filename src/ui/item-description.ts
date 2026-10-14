import { hud as cfg } from '../game/config';
import { drawPixelText, measurePixelText } from '../engine/pixel-text';
import type { ItemKind } from '../game/items';

// Caixa de descrição de item (ESTILO, seção 9; COMBATE.md, "Itens": "Na
// primeira vez que o jogador pega cada um, aparece a descrição do jogo
// original"). Módulo com estado próprio, como o hud.ts: o main só enfileira
// (queueItemDescription, a partir da fila pickupEvents) e chama update/draw.

// Textos do LORE.md, seção "Itens", EXATAMENTE como estão (a regra do doc
// permite só corrigir acentos, e aqui não há o que corrigir)
const DESCRIPTIONS: Record<ItemKind, { name: string; text: string }> = {
  cicatrizante: {
    name: 'Cicatrizante',
    text: 'Um spray contendo um remédio com potente efeito cicatrizante.',
  },
  machadinha: {
    name: 'Machadinha',
    text: 'Ferramenta comum em fazendas e canteiros de obra, usada para cortar madeira — mas serve bem como arma de arremesso.',
  },
  protecao: {
    name: 'Proteção Leve',
    text: 'Uma jaqueta de couro pesada, ou um colete à prova de balas — do tipo usado por seguranças e policiais.',
  },
};

// "Na primeira vez que o jogador pega cada um" (COMBATE.md). DÚVIDA DO DOC,
// decidida: a memória é da SESSÃO — morrer na sala 1 NÃO reabre descrição
// já vista (os itens voltam ao chão, mas a caixa é informação, não
// recompensa: reabrir a cada morte só interromperia). Só recarregar a
// página zera este conjunto
const shown = new Set<ItemKind>();
// fila dos tipos pegos ainda não exibidos (pegar dois tipos no mesmo passo
// empilha os dois: uma caixa de cada vez)
const queue: ItemKind[] = [];
// a caixa aberta agora; null = fechada
let current: ItemKind | null = null;
let visibleTime = 0;

// Fecha a caixa atual e abre a próxima da fila, se houver
function advance(): void {
  const next = queue.shift();
  current = next ?? null;
  visibleTime = 0;
  if (next !== undefined) shown.add(next);
}

// Enfileira a descrição do tipo pego. Já MOSTRADA ou já NA FILA: ignora —
// cada tipo aparece uma vez só por sessão
export function queueItemDescription(kind: ItemKind): void {
  if (shown.has(kind) || queue.includes(kind)) return;
  queue.push(kind);
  // nada na tela: abre já (não espera o próximo passo)
  if (current === null) advance();
}

// O cronômetro de 4 s ("some depois de 4 s", ESTILO §9) roda no passo fixo
// do main, só nos estados 'playing' e 'victory'. DÚVIDA DO DOC, decidida:
// durante a transição de sala e a pausa de morte o relógio CONGELA junto
// com o jogo — os 4 s contam como tempo de tela visível, e não valeria o
// fade cobrir a caixa enquanto ela esgota o tempo escondida
export function updateItemDescription(dt: number): void {
  if (current === null) return;
  visibleTime += dt;
  if (visibleTime >= cfg.itemDescription.duration) advance();
}

// "ou quando o jogador aperta qualquer tecla" (ESTILO §9). DÚVIDA DO DOC,
// decidida: o ESTILO não diz se o jogo pausa nem se a tecla age — o jogo
// NÃO pausa (é souls-like) e a tecla AGE normalmente além de fechar a caixa
// (fechar com J também ataca): sem preventDefault e sem parar a propagação
window.addEventListener('keydown', () => {
  if (current !== null) advance();
});

// Quebra o texto por palavra até caber na largura interna da caixa
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (measurePixelText(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Desenho no canvas 2D do HUD, uma vez por quadro. O main chama DEPOIS do
// drawHud e ANTES do drawRoomFade: a caixa fica por cima das barras, mas o
// fade da troca de sala cobre tudo (escurecer por cima da caixa lê como o
// mundo se fechando, não como a caixa vazando)
export function drawItemDescription(g: CanvasRenderingContext2D): void {
  if (current === null) return;
  const c = cfg.itemDescription;
  const entry = DESCRIPTIONS[current];

  // contorno de 1 px pintado como moldura (mesmo truque das barras do HUD:
  // retângulo da cor do contorno por trás, fundo translúcido por cima)
  g.fillStyle = c.outline;
  g.fillRect(c.x - 1, c.y - 1, c.width + 2, c.height + 2);
  g.globalAlpha = c.backgroundOpacity;
  g.fillStyle = c.background;
  g.fillRect(c.x, c.y, c.width, c.height);
  g.globalAlpha = 1;

  // nome em ouro na linha de cima; descrição em bege embaixo, com quebra
  // por palavra na largura interna. Tudo pelo drawPixelText (Silkscreen 8
  // px sem suavização — ESTILO §§1 e 9)
  let y = c.y + c.padding;
  drawPixelText(g, entry.name, c.x + c.padding, y, c.nameColor);
  y += c.lineHeight;
  for (const line of wrapText(entry.text, c.width - c.padding * 2)) {
    drawPixelText(g, line, c.x + c.padding, y, c.textColor);
    y += c.lineHeight;
  }
}
