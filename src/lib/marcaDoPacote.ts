/* GERADO por scripts/marca.mjs. Não edite à mão — a próxima marca sobrescreve.
 *
 * O carimbo que o app desenha em cima de tudo enquanto está em desenvolvimento,
 * para uma foto de tela dizer QUAL pacote está rodando. Ver o cabeçalho do
 * script para o motivo.
 *
 * ── O `__DEV__` aqui, e não só lá no App ──────────────────────────────────
 * Quem desenha o carimbo já está dentro de `__DEV__`, então ele NUNCA aparece
 * em produção. Só que isso tira o DESENHO, e não a constante: conferido num
 * pacote de produção de verdade (`expo export`), o texto do carimbo continuava
 * dentro do arquivo — morto e invisível, mas presente.
 *
 * Com o ternário, o minificador resolve `__DEV__ ? 'abc' : ''` para `''` e o
 * texto some do pacote. É pouca coisa em bytes; o que vale é a promessa ficar
 * verdadeira. Um "não vai para produção" que é quase verdade é o tipo de frase
 * que ninguém confere de novo. */
export const MARCA_DO_PACOTE = __DEV__ ? 'e917da5 16:00' : ''
