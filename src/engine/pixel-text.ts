import { font } from '../game/config';

// Texto pixelado pro HUD (ESTILO, seções 1 e 9).
// O canvas suaviza a borda das letras mesmo com fonte pixel. Aqui cada texto é
// desenhado uma vez num canvas pequeno e cada pixel vira "cheio" ou "vazio"
// (sem meio-termo). O resultado fica guardado, então desenhar de novo é barato.

let family = 'monospace';

// Carrega a fonte antes do jogo começar. Sem ela, o texto sai em monospace
// e o jogo segue (a fonte é só visual, não vale travar tudo por ela)
export async function loadPixelFont(): Promise<void> {
  try {
    const face = new FontFace(font.family, `url(${font.path})`);
    await face.load();
    document.fonts.add(face);
    family = font.family;
  } catch (err) {
    console.warn('A fonte do HUD não carregou, usando monospace:', err);
  }
}

// folga em cima (acento do É) e embaixo (perna do Ç)
const PAD = 2;
const cache = new Map<string, HTMLCanvasElement>();

function cssFont(): string {
  return `${font.size}px ${family}`;
}

function renderText(text: string, color: string): HTMLCanvasElement {
  const key = `${color}|${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponível pro texto do HUD');
  g.font = cssFont();
  canvas.width = Math.max(1, Math.ceil(g.measureText(text).width));
  canvas.height = font.size + PAD * 2;
  // mudar o tamanho do canvas apaga a configuração, então configura de novo
  g.font = cssFont();
  g.textBaseline = 'top';
  g.fillStyle = color;
  g.fillText(text, 0, PAD);

  // limiar: pixel com mais da metade de tinta fica inteiro, o resto some
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 128 ? 255 : 0;
  g.putImageData(image, 0, 0);

  cache.set(key, canvas);
  return canvas;
}

// Largura do texto em pixels da tela de 480x270
export function measurePixelText(text: string): number {
  return renderText(text, '#000').width;
}

// Desenha com o topo da linha em y. align 'right' alinha o fim do texto em x.
// Devolve a largura, pra montar linhas com mais de uma cor.
export function drawPixelText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: 'left' | 'right' = 'left',
): number {
  const image = renderText(text, color);
  const left = align === 'right' ? x - image.width : x;
  g.drawImage(image, Math.round(left), Math.round(y) - PAD);
  return image.width;
}
