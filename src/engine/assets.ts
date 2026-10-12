// Carregador de imagens do jogo.
// Por que assim: o jogo só pode começar depois que TODOS os assets carregaram.
// Uma textura criada antes da imagem chegar aparece vazia. Então o fluxo é:
//   1. register() / registerOptional() declaram as chaves e caminhos.
//   2. loadAll() devolve uma Promise que só resolve quando tudo terminou.
//   3. getImage() / getOptionalImage() só são chamadas depois disso.
//
// Asset obrigatório que falha derruba o carregamento (erro claro no console).
// Asset opcional que falha vira null: é o caso das texturas finais, que ainda
// não existem e têm uma versão gerada por código no lugar (CENA3D, seção Texturas).

interface Entry {
  path: string;
  optional: boolean;
}

const registry = new Map<string, Entry>();
const cache = new Map<string, HTMLImageElement | null>();

// Caminho relativo à base do Vite (a pasta public/ vira a raiz do servidor)
export function register(key: string, path: string): void {
  registry.set(key, { path, optional: false });
}

// Mesmo que register, mas a falta do arquivo não é erro
export function registerOptional(key: string, path: string): void {
  registry.set(key, { path, optional: true });
}

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar: ${path}`));
    img.src = path;
  });
}

// Carrega tudo em paralelo. Rejeita na primeira falha de asset obrigatório,
// com o caminho na mensagem, pra achar erro de digitação no nome do arquivo.
export function loadAll(): Promise<void> {
  const pending = Array.from(registry.entries(), async ([key, entry]) => {
    try {
      cache.set(key, await loadImage(entry.path));
    } catch (err) {
      if (!entry.optional) {
        throw new Error(`Asset "${key}" não carregou (${entry.path})`, { cause: err });
      }
      cache.set(key, null);
    }
  });
  return Promise.all(pending).then(() => undefined);
}

// Imagem obrigatória já carregada. Erro explícito se a chave não existe (pega bug cedo).
export function getImage(key: string): HTMLImageElement {
  const img = cache.get(key);
  if (!img) {
    throw new Error(`Asset "${key}" não foi carregado (chame loadAll antes)`);
  }
  return img;
}

// Imagem opcional: null se o arquivo não existe
export function getOptionalImage(key: string): HTMLImageElement | null {
  return cache.get(key) ?? null;
}
