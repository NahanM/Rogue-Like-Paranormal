// Loop de jogo com passo fixo de 60 atualizações por segundo.
// Por que passo fixo: a lógica do jogo (física, combate) precisa ser
// determinística e independente do FPS da tela. O desenho, em vez,
// acontece uma vez por frame, na cadência do navegador.

const STEP = 1 / 60; // segundos por atualização lógica

export function start(update: (dt: number) => void, draw: () => void): void {
  let last = performance.now();
  let accumulator = 0;

  function frame(now: number): void {
    // Evita "espiral da morte": se a aba ficar em segundo plano e voltar,
    // o delta gigante faria o jogo pular vários segundos de uma vez.
    const delta = Math.min((now - last) / 1000, 0.25);
    last = now;
    accumulator += delta;

    // Roda quantas atualizações de 1/60s couberem no tempo acumulado
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }

    draw();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
