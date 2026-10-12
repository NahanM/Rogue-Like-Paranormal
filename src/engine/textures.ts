import * as THREE from 'three';
import { TEXTURE_TEXELS_PER_TILE, TEXTURE_TILE_UNITS } from '../game/config';

// Regras de pixel das texturas (ESTILO, seção 1):
// filtro Nearest nos dois sentidos, sem mipmap e com cor em sRGB.
// Sem o colorSpace, o three r155+ trata a imagem como linear e tudo fica lavado.
function pixelate<T extends THREE.Texture>(texture: T, repeat: boolean): T {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

// Textura desenhada por código num canvas pequeno
export function canvasTexture(
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D) => void,
  repeat = true,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponível pra gerar textura');
  g.imageSmoothingEnabled = false;
  draw(g);
  return pixelate(new THREE.CanvasTexture(canvas), repeat);
}

// Textura a partir de uma imagem já carregada (sprites e texturas finais)
export function imageTexture(image: HTMLImageElement, repeat = false): THREE.Texture {
  return pixelate(new THREE.Texture(image), repeat);
}

// Quantas unidades do mundo uma repetição da textura cobre.
// Uma textura de 32 px cobre 1,71; uma de 16 px cobre 0,855. Assim 1 texel ≈ 1 px na tela
// qualquer que seja o tamanho do arquivo que chegar.
export function tileUnits(texture: THREE.Texture): number {
  const image = texture.image as { width?: number } | null;
  const width = image?.width ?? TEXTURE_TEXELS_PER_TILE;
  return (width / TEXTURE_TEXELS_PER_TILE) * TEXTURE_TILE_UNITS;
}

// Pinta 1 pixel
export function pixel(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(x, y, 1, 1);
}

// Retângulo que dá a volta nas bordas, pra textura repetível não ter costura:
// o pedaço que passa da direita reaparece na esquerda (e o de baixo, em cima).
export function wrappedRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const size = g.canvas.width;
  const sizeY = g.canvas.height;
  g.fillStyle = color;
  for (const ox of [-size, 0, size]) {
    for (const oy of [-sizeY, 0, sizeY]) {
      g.fillRect(x + ox, y + oy, w, h);
    }
  }
}

// Pixel com a mesma volta nas bordas
export function wrappedPixel(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const w = g.canvas.width;
  const h = g.canvas.height;
  pixel(g, ((x % w) + w) % w, ((y % h) + h) % h, color);
}
