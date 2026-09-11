/* O app de teste instala AO LADO do da loja.
 *
 * O Cygnos do celular dele veio da Play Store, assinado pela chave do Google
 * (Play App Signing). O build de desenvolvimento é assinado por outra chave, e
 * o Android não deixa um app substituir outro de assinatura diferente: o
 * arquivo baixava inteiro e ficava parado no fim, sem mensagem nenhuma. Para
 * instalar, só desinstalando o da loja -- e isso apaga o que mora só no
 * aparelho.
 *
 * Com outro identificador, são dois apps: "Cygnos" (loja) e "Cygnos Dev"
 * (teste). A variante vem de APP_VARIANT, que só o perfil `development` do
 * eas.json define. Sem ela -- `expo start`, preview, produção -- a configuração
 * é o app.json, sem mudar nada. */
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config
  return {
    ...config,
    name: 'Cygnos Dev',
    android: { ...config.android, package: 'com.cygnosnutri.app.dev' },
    ios: { ...config.ios, bundleIdentifier: 'com.cygnosnutri.app.dev' },
  }
}
