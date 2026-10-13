import { camera } from '../game/config';

// Billboards em pé (protagonista, inimigos, chefe, itens).
//
// Por que em pé: a câmera olha de cima, a 51°. Um plano virado de frente pra ela
// fica deitado pra trás, e a cabeça de um boneco de 1,8 ia parar uns 1,4 atrás do pé.
// Parado na frente de um pilar ou encostado no muro do fundo, metade do corpo
// entrava na pedra e sumia, como se atravessasse a parede.
//
// Em pé, o sprite é uma "parede fina" no lugar do pé. O que está atrás do pé fica
// atrás dele, o que está na frente tapa ele, e nada corta o boneco no meio.
// Como a câmera nunca gira, um plano sem rotação nenhuma já fica de frente pra ela.
//
// O preço: visto de cima, um plano em pé parece mais baixo (achatado na altura).
// Então ele é esticado na altura pelo inverso disso, e na tela continua com o
// tamanho certo: 1 texel = 1 pixel.

// Quanto um segmento em pé encolhe na tela: cosseno do ângulo da câmera,
// tirado do próprio deslocamento dela (0, 21, 17), pra acompanhar se ele mudar
const tilt = camera.offset.z / Math.hypot(camera.offset.y, camera.offset.z);

// Multiplica toda altura de billboard (e todo deslocamento vertical dele, como o balanço do andar)
export const BILLBOARD_STRETCH = 1 / tilt;
