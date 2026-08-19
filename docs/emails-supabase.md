# Templates de e-mail do Supabase

Cole em **Authentication > Emails > Templates**, no painel do projeto.

O que faz o fluxo do app funcionar é a variável `{{ .Token }}`, que é o código
de 6 dígitos. Sem ela o e-mail sai só com link, e a tela de recuperação do app
fica pedindo um código que nunca chegou.

Nenhum dos dois usa imagem externa. Logo hospedada em e-mail é bloqueada por
padrão no Gmail e no Outlook, e o cabeçalho apareceria como um quadrado vazio.

## Reset Password

**Assunto**: `Seu código para redefinir a senha`

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1f17">
  <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5b6b4a">Cygnos</p>
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1f17">Redefinir sua senha</h1>

  <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#414a38">
    Use o código abaixo no aplicativo para criar uma senha nova. Ele vale por 15 minutos.
  </p>

  <div style="margin:0 0 24px;padding:20px;border-radius:14px;background:#f2f7ea;text-align:center">
    <span style="font-size:34px;font-weight:700;letter-spacing:10px;color:#1a1f17">{{ .Token }}</span>
  </div>

  <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#414a38">
    Se não foi você que pediu, ignore esta mensagem. Sua senha continua a mesma e ninguém
    consegue trocá-la sem este código.
  </p>

  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e9dc;font-size:12.5px;line-height:19px;color:#7a856c">
    Nunca peça nem compartilhe este código com outra pessoa. A equipe do Cygnos não pede
    código por telefone, WhatsApp ou e-mail.
  </p>
</div>
```

## Confirm signup

**Assunto**: `Confirme seu e-mail no Cygnos`

Mantém o link e acrescenta o código. O link resolve para quem abre o e-mail no
computador, e o código resolve para quem está com o app aberto no celular.

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1f17">
  <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5b6b4a">Cygnos</p>
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1f17">Confirme seu e-mail</h1>

  <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#414a38">
    Falta só confirmar este endereço para a sua conta ficar pronta.
  </p>

  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#1f9d57;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">
      Confirmar meu e-mail
    </a>
  </p>

  <p style="margin:0 0 10px;font-size:14px;line-height:22px;color:#414a38">
    Ou informe este código no aplicativo:
  </p>

  <div style="margin:0 0 24px;padding:16px;border-radius:14px;background:#f2f7ea;text-align:center">
    <span style="font-size:30px;font-weight:700;letter-spacing:9px;color:#1a1f17">{{ .Token }}</span>
  </div>

  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e9dc;font-size:12.5px;line-height:19px;color:#7a856c">
    Se você não criou uma conta no Cygnos, ignore esta mensagem.
  </p>
</div>
```

## Password changed

Fica em **Templates > Security**, e vem desligado. Ligue.

É a rede de proteção do fluxo de recuperação: alguém que consiga trocar a senha
de uma conta não consegue impedir este aviso de chegar. Sem ele, a pessoa só
descobre a invasão quando não entra mais.

**Assunto**: `Sua senha do Cygnos foi alterada`

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1f17">
  <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5b6b4a">Cygnos</p>
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1f17">Sua senha foi alterada</h1>

  <p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#414a38">
    A senha da conta <strong>{{ .Email }}</strong> acaba de ser trocada. As outras sessões
    foram desconectadas.
  </p>

  <p style="margin:0 0 8px;font-size:15px;line-height:23px;color:#414a38">
    Se foi você, não precisa fazer nada.
  </p>

  <div style="margin:16px 0 0;padding:16px;border-radius:14px;background:#fdf1f1;border:1px solid #f6d4d4">
    <p style="margin:0;font-size:14px;line-height:22px;color:#8a2b2b">
      <strong>Se não foi você</strong>, alguém tem acesso ao seu e-mail ou à sua conta. Peça uma
      nova recuperação de senha pelo aplicativo agora e avise a sua nutricionista.
    </p>
  </div>
</div>
```

## Configuração que os templates assumem

| Onde | Ajuste |
| --- | --- |
| Authentication > Providers > Email | Email OTP Expiration em `900` (15 minutos, que é o que o texto do e-mail promete) |
| Authentication > Rate Limits | E-mails por hora em `30` |
| Project Settings > Authentication > SMTP | Custom SMTP ligado no Resend, remetente `nao-responda@cygnos-nutri.com` |

Se você mudar a validade do OTP, mude junto a frase "vale por 15 minutos" do
template e o texto da tela em `src/screens/RecuperarSenhaScreen.tsx`. São três
lugares dizendo o mesmo número, e os três precisam concordar.
