import AsyncStorage from '@react-native-async-storage/async-storage'
/* `segundaDa` mora em `datas.ts`, que não importa nada e por isso pode ser
   usada pelas libs puras -- inclusive a da agenda dela. */
import { segundaDa } from './datas.ts'
/* Reexportado porque o chamador antigo pode continuar importando daqui. */
export { segundaDa }

/* Se o cartão da semana já foi visto nesta semana.
 *
 * ── Por que isto é uma marca, e não um contador ───────────────────────────
 * O cartão precisa aparecer UMA vez por semana e sumir depois de lido. Um
 * cartão que reaparece todo dia vira o banner que a pessoa aprende a fechar sem
 * ler — e aí ele deixou de funcionar justamente na semana em que tinha algo bom
 * a dizer.
 *
 * A marca é a SEGUNDA-FEIRA da semana em que ele foi fechado. Guardar a data do
 * fechamento e contar sete dias faria a semana escorregar: fechou na quarta,
 * volta na quarta seguinte, depois na quinta. Ancorado na segunda, ele volta
 * sempre no mesmo lugar da semana.
 *
 * ── Fica no aparelho ──────────────────────────────────────────────────────
 * É preferência de leitura, não dado de saúde: quem trocar de telefone vê o
 * cartão uma vez a mais, e isso não é problema nenhum. */

export const RASCUNHO_SEMANA = 'cygnos:semana-vista'

export async function semanaJaVista(hoje: string): Promise<boolean> {
  try {
    const marca = await AsyncStorage.getItem(RASCUNHO_SEMANA)
    return marca === segundaDa(hoje)
  } catch {
    /* Sem conseguir ler, o cartão aparece. Mostrar de novo é bem menos ruim do
       que esconder para sempre. */
    return false
  }
}

export async function marcarSemanaVista(hoje: string): Promise<void> {
  try {
    await AsyncStorage.setItem(RASCUNHO_SEMANA, segundaDa(hoje))
  } catch {
    /* Idem: no pior caso ele aparece amanhã de novo. */
  }
}
