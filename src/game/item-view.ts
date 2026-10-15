import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { canvasTexture, pixel } from '../engine/textures';
import { items as cfg } from './config';
import type { Item, ItemKind } from './items';

// Desenho dos itens no chão da sala 1 (ESTILO, seções 3, 4 e 8; Sprint 6).
// Só visual: posição, balanço e visibilidade são lidos do ESTADO do item a
// cada quadro; a lógica (pegar, efeitos no jogador, reset) mora no items.ts
// e no main.ts — mesma separação do enemy-view.ts

// PLACEHOLDERS gerados por código: os sprites de machadinha, proteção e
// cicatrizante no chão são prioridade P1 no docs/ASSETS.md e ainda não
// chegaram. Texturas de 8x8 px (= o tamanho do item na tela, ESTILO seção
// 3), só com cores da paleta (seção 5), montadas por fileiras de texto
// legível — o mesmo formato dos quadros de fogo do procedural-textures.ts.
// Quando os sprites reais existirem, entram no lugar e estas tabelas somem
// (mesmo destino das texturas provisórias do kit)
const ITEM_TEXTURE_ROWS: Record<ItemKind, string[]> = {
  // Machadinha deitada na diagonal: cabo de couro claro e lâmina clara
  // (rampa do casaco do personagem: #5c4033 / #b89f91, ESTILO 5)
  machadinha: [
    '....bbb.',
    '...bbbbb',
    '...hbbb.',
    '..hh.bb.',
    '..h.....',
    '.h......',
    '.h......',
    'h.......',
  ],
  // Proteção Leve: escudo de pedra escura #4c3d4c com o fuste central mais
  // claro #826e6a. Lê "armadura" sem tocar em nenhuma cor de destaque
  // travada (ESTILO 5)
  protecao: [
    '..pppp..',
    '.ppddpp.',
    'pppddppp',
    'pppddppp',
    'pppddppp',
    '.ppddpp.',
    '..pppp..',
    '...pp...',
  ],
  // Cicatrizante: frasco claro #e2cab1 com a cruz de remédio #b03a48 (o
  // vermelho da barra de vida, ESTILO 5)
  cicatrizante: [
    '...cc...',
    '...cc...',
    '.cccccc.',
    '.cccccc.',
    '.c.rr.c.',
    '.crrrrc.',
    '.c.rr.c.',
    '.cccccc.',
  ],
};
const ITEM_TEXTURE_COLORS: Record<ItemKind, Record<string, string>> = {
  machadinha: { h: '#5c4033', b: '#b89f91' },
  protecao: { p: '#4c3d4c', d: '#826e6a' },
  cicatrizante: { c: '#e2cab1', r: '#b03a48' },
};

// Canvas 8x8 → textura com as regras de pixel do jogo (NearestFilter, sRGB
// e sem mipmap — engine/textures.ts). Sem repetição: é sprite, não ladrilho
// (mesmo `false` das chamas do braseiro)
function itemTexture(kind: ItemKind): THREE.CanvasTexture {
  const rows = ITEM_TEXTURE_ROWS[kind];
  const colors = ITEM_TEXTURE_COLORS[kind];
  return canvasTexture(
    8,
    8,
    (g) => {
      rows.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          const color = colors[line[x]];
          if (color) pixel(g, x, y, color);
        }
      });
    },
    false,
  );
}

interface ItemVisual {
  item: Item;
  sprite: THREE.Mesh;
}

export class ItemsView {
  readonly object = new THREE.Group();
  private readonly visuals: ItemVisual[] = [];

  constructor(items: Item[]) {
    // Uma textura por tipo, dividida pelos itens iguais (as 3 machadinhas
    // dividem a mesma) — padrão do enemy-view
    const textures: Record<ItemKind, THREE.Texture> = {
      machadinha: itemTexture('machadinha'),
      protecao: itemTexture('protecao'),
      cicatrizante: itemTexture('cicatrizante'),
    };

    for (const item of items) {
      // Billboard em pé (ESTILO, seção 4): plano 1x1 com a origem no pé,
      // Lambert com alphaTest 0.5 e DoubleSide PRA RECEBER A LUZ da cena, e
      // a altura multiplicada por BILLBOARD_STRETCH (engine/billboard.ts)
      // pra renderizar os 8 px certos na tela. SEM sombra deitada no chão:
      // DÚVIDA DO DOC, decidida — o ESTILO define sombra pra personagens e
      // chefe (seção 4) e se cala sobre itens. Não inventamos: o balanço de
      // 1 px por si só já separa o item do chão, e uma elipse minúscula de
      // 0,45 un competiria com as sombras dos bichos
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.translate(0, 0.5, 0);
      const material = new THREE.MeshLambertMaterial({
        map: textures[item.kind],
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      });
      const sprite = new THREE.Mesh(geometry, material);
      sprite.scale.set(cfg.size, cfg.size * BILLBOARD_STRETCH, 1);
      sprite.position.set(item.x, 0, item.z);
      this.object.add(sprite);
      this.visuals.push({ item, sprite });
    }
  }

  // Passo fixo: só avança o cronômetro do balanço. É efeito puramente
  // visual guardado no PRÓPRIO item (o bobTime mora lá por decisão da
  // tarefa, como o walkTime do Player); o pickup não depende dele. Morto
  // continua contando: a onda é contínua e um revivido retomando do meio é
  // indistinguível de um novo (mesma decisão da opacidade no enemy-view).
  // Mesmo desenho do EnemiesView: update no passo fixo, sync no quadro
  update(dt: number): void {
    for (const visual of this.visuals) visual.item.bobTime += dt;
  }

  // Uma vez por quadro desenhado: item morto se esconde, vivo flutua
  sync(): void {
    for (const visual of this.visuals) {
      const item = visual.item;
      visual.sprite.visible = item.alive;
      if (!item.alive) continue;

      // Balanço (ESTILO, seção 8: "sobe e desce 1 px a cada 0,5 s"): seno
      // mapeado pra [0, 1 px], assim o item flutua sem nunca afundar no
      // chão. A fase vem do bobTime sorteado na criação, então cada item
      // flutua no seu compasso. O deslocamento é multiplicado por
      // BILLBOARD_STRETCH, como o balanço do andar do jogador: o billboard
      // em pé encolhe o vertical na tela e o estiramento corrige
      const phase = (item.bobTime / cfg.bobPeriod) * Math.PI * 2;
      const bob = (Math.sin(phase) * 0.5 + 0.5) * cfg.bobHeight * BILLBOARD_STRETCH;
      visual.sprite.position.set(item.x, bob, item.z);
    }
  }
}
