// Carregador de imagens do jogo.
// Por que assim: o jogo só pode começar a desenhar depois que TODOS os
// assets carregaram. Um sprite desenhado antes de carregar apareceria
// vazio ou quebraria o drawImage. Então o fluxo é:
//   1. register() declara as chaves e caminhos.
//   2. loadAll() retorna uma Promise que só resolve quando tudo carregou.
//   3. getImage() só é chamada depois disso (chamar antes joga erro).

const registry = new Map<string, string>();
const cache = new Map<string, HTMLImageElement>();

// Declara um asset pra carregar depois. Caminho relativo à base do Vite
// (a pasta public/ vira a raiz do servidor).
export function register(key: string, path: string): void {
  registry.set(key, path);
}

// Carrega todas as imagens registradas em paralelo.
// Rejeita na primeira falha, com o caminho que faltou na mensagem,
// pra facilitar achar erro de digitação no nome do arquivo.
export function loadAll(): Promise<void> {
  const pending = Array.from(registry.entries(), ([key, path]) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        cache.set(key, img);
        resolve();
      };
      img.onerror = () => {
        reject(new Error(`Falha ao carregar asset "${key}" em: ${path}`));
      };
      img.src = path;
    });
  });

  return Promise.all(pending).then(() => undefined);
}

// Retorna a imagem já carregada. Erro explícito se alguém pedir
// uma chave que não foi registrada/carregada (pega bug mais cedo).
export function getImage(key: string): HTMLImageElement {
  const img = cache.get(key);
  if (!img) {
    throw new Error(`Asset "${key}" não foi carregado (chame loadAll antes)`);
  }
  return img;
}
