import * as THREE from 'three';
import { BILLBOARD_STRETCH } from '../engine/billboard';
import { canvasTexture, pixel } from '../engine/textures';
import { items as cfg } from './config';
import type { Hatchet } from './hatchet';

// Desenho das machadinhas em voo (Sprint 6, Tarefa 2; ESTILO seções 3, 4 e
// 8). Só visual: posição, quadro do giro e existência são lidos do estado
// do projétil — a lógica (voo, colisão, morte) mora no hatchet.ts e o
// acerto nos inimigos no main.ts

// PLACEHOLDER gerado por código: o sprite "machadinha em voo" é P1 no
// docs/ASSETS.md e ainda não chegou. 4 quadros de 8x8 na paleta da
// machadinha do chão (item-view.ts: cabo #5c4033, lâmina #b89f91). O ESTILO,
// seção 8, manda "4 frames de giro DESENHADOS" — o objeto nunca é girado no
// código (seção 3), então cada quadro é a machadinha desenhada num ângulo,
// gerado girando o desenho base de 90° em 90°. Quando o sprite real
// existir, entra no lugar
const HATCHET_BASE: string[] = [
  '....bbb.',
  '...bbbbb',
  '...hbbb.',
  '..hh.bb.',
  '..h.....',
  '.h......',
  '.h......',
  'h.......',
];
const HATCHET_COLORS: Record<string, string> = { h: '#5c4033', b: '#b89f91' };

// Gira a grade de texto 90° no sentido horário (não é o objeto girando: é
// o DESENHO do próximo quadro)
function rotateCw90(rows: string[]): string[] {
  const size = rows.length;
  const out: string[] = [];
  for (let y = 0; y < size; y++) {
    let line = '';
    for (let x = 0; x < size; x++) line += rows[size - 1 - x][y];
    out.push(line);
  }
  return out;
}

// Um visual por machadinha viva: billboard com o material próprio (o quadro
// do giro é trocado no map dele) e o cronômetro do giro
interface HatchetVisual {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  spinTime: number;
}

export class HatchetsView {
  readonly object = new THREE.Group();
  // os 4 quadros do giro, gerados uma vez (base + 3 giros de 90°)
  private readonly frames: THREE.Texture[] = [];
  private readonly visuals = new Map<Hatchet, HatchetVisual>();

  constructor() {
    let rows = HATCHET_BASE;
    for (let frame = 0; frame < 4; frame++) {
      const drawn = rows;
      // canvas 8x8 com as regras de pixel do jogo (NearestFilter, sRGB, sem
      // mipmap — engine/textures.ts); sem repetição: é sprite, não ladrilho
      this.frames.push(
        canvasTexture(
          8,
          8,
          (g) => {
            drawn.forEach((line, y) => {
              for (let x = 0; x < line.length; x++) {
                const color = HATCHET_COLORS[line[x]];
                if (color) pixel(g, x, y, color);
              }
            });
          },
          false,
        ),
      );
      rows = rotateCw90(rows);
    }
  }

  // Passo fixo: só avança os cronômetros do giro (10 fps, ESTILO seção 8).
  // Morta não continua girando: a remoção da lista é decidida pelo main, e
  // o sync deixa de ver o projétil no mesmo quadro
  update(dt: number): void {
    for (const visual of this.visuals.values()) visual.spinTime += dt;
  }

  // Uma vez por quadro desenhado. A reconciliação mora aqui (em vez do
  // update) pra machadinha morta sumir no MESMO quadro em que o main limpa
  // a lista — se ficasse no update, um projétil morrendo no passo da
  // troca de sala/morte do jogador piscaria um quadro na sala nova
  sync(hatchets: Hatchet[]): void {
    // some com os visuais cujo projétil saiu da lista (morreu)
    for (const [hatchet, visual] of this.visuals) {
      if (hatchets.includes(hatchet)) continue;
      this.object.remove(visual.mesh);
      visual.mesh.geometry.dispose();
      visual.material.dispose();
      this.visuals.delete(hatchet);
    }
    for (const hatchet of hatchets) {
      let visual = this.visuals.get(hatchet);
      if (!visual) {
        // Billboard em pé (ESTILO, seção 4): plano 1x1 com a origem na
        // base, Lambert com alphaTest 0.5 e DoubleSide pra receber a luz da
        // cena, altura esticada por BILLBOARD_STRETCH. SEM sombra deitada:
        // os itens parados já não têm (decisão da Tarefa 1) — e o voo é a
        // 0,6 un do chão, alto demais pra imprimir sombra lendo direito
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.translate(0, 0.5, 0);
        const material = new THREE.MeshLambertMaterial({
          map: this.frames[0],
          alphaTest: 0.5,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(cfg.size, cfg.size * BILLBOARD_STRETCH, 1);
        this.object.add(mesh);
        visual = { mesh, material, spinTime: 0 };
        this.visuals.set(hatchet, visual);
      }
      // o pé do quadro flutua à altura de voo (DÚVIDA DO DOC decidida no
      // config) e o giro são 4 SPRITES trocados a 10 fps — nunca o objeto
      // girado (ESTILO, seção 3)
      visual.mesh.position.set(hatchet.x, cfg.hatchet.flyHeight, hatchet.z);
      visual.material.map = this.frames[Math.floor(visual.spinTime * cfg.hatchet.spinFps) % this.frames.length];
    }
  }
}
