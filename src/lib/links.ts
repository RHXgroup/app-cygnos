import { Linking } from 'react-native'

/* Os endereços públicos que o app abre no navegador.
 *
 * Ficam num lugar só porque não são só links de rodapé: a ficha do app na Play
 * Store aponta para os mesmos endereços, e a revisão do Google confere se o que
 * está na loja bate com o que está dentro do app. Espalhar a string por três
 * telas é o caminho para um deles ficar para trás numa troca de domínio.
 *
 * `/app/...` e não as páginas da raiz de propósito: `/privacidade` e `/termos`
 * falam do sistema web, usado pela nutricionista. Estas falam do aplicativo, do
 * ponto de vista de quem o instalou. */
const SITE = 'https://cygnos-nutri.com'

export const LINKS = {
  privacidade: `${SITE}/app/privacidade`,
  termos: `${SITE}/app/termos`,
  /* Exigida pela Play Store: o paciente precisa conseguir pedir a exclusão sem
     ter o app instalado. Dentro do app o caminho é a ExcluirContaScreen, que
     apaga na hora — esta página é para quem desinstalou ou perdeu o acesso. */
  excluirConta: `${SITE}/app/excluir-conta`,
} as const

/* Falhar em silêncio é de propósito. `openURL` só rejeita quando não há
   navegador para atender o endereço, situação em que não existe recuperação
   nenhuma a oferecer — e deixar o erro subir derrubaria a tela por causa de um
   toque num link de rodapé. */
export function abrirLink(url: string) {
  Linking.openURL(url).catch(() => {})
}
