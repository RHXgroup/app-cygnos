/* Como a quantidade de uma TROCA é escrita na tela.
 *
 * A nutricionista cadastra a troca de dois jeitos, e às vezes dos dois: em
 * gramas (`quantidade_g`) e em medida caseira ("2 fatias"). A página do link do
 * sistema mostra a medida caseira quando existe, e cai para as gramas -- porque
 * "2 fatias" é o que a pessoa consegue servir, e "56 g" exige balança.
 *
 * Aqui vale a mesma ordem, e por isso a regra mora numa lib pura: ela é a única
 * coisa desta parte que tem DECISÃO, e é onde um zero ou um `null` viram texto
 * errado no papel da paciente.
 *
 * Rode com: node --experimental-strip-types src/lib/rotuloDaTroca.teste.mts */

export type TrocaLida = {
  quantidadeG: number | string | null | undefined
  medidaCaseira: string | null | undefined
}

export function rotuloDaTroca(t: TrocaLida): string | null {
  const caseira = typeof t.medidaCaseira === 'string' ? t.medidaCaseira.trim() : ''
  if (caseira) return caseira

  const bruto =
    typeof t.quantidadeG === 'string' ? Number(t.quantidadeG.replace(',', '.')) : t.quantidadeG
  if (typeof bruto !== 'number' || !Number.isFinite(bruto) || bruto <= 0) return null

  /* Arredondado, como no site: a coluna é `numeric(10,2)` e "268,50 g" não
     ajuda ninguém a servir o prato. E sem casa decimal nenhuma acima de 10;
     abaixo disso, uma casa -- 7,5 g de um suplemento é diferente de 8 g. */
  const numero = bruto >= 10 ? String(Math.round(bruto)) : String(Math.round(bruto * 10) / 10).replace('.', ',')
  return numero + ' g'
}
