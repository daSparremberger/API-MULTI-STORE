// src/lib/email-templates.ts
import { sendMail } from './mailer.js';
import { env } from '../env.js';

type UserInfo = {
  name: string;
  email: string;
};

// URL do logo da Forfit - você pode substituir por um link hospedado em seu próprio CDN se preferir.
const forfitLogoUrl = 'https://i.imgur.com/gSHB40E.png';
const forfitRed = '#ae222a';

/**
 * Monta o corpo base do e-mail com o branding da Forfit.
 */
function createEmailBase(content: { title: string; body: string; button: { text: string; url: string; } }): string {
  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
    <style>
      body { margin: 0; padding: 0; background-color: #f4f4f4; }
      table { border-spacing: 0; }
      td { padding: 0; }
      img { border: 0; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #f4f4f4; padding: 40px 0; }
      .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: 'Poppins', sans-serif; color: #4a4a4a; }
      .content { padding: 30px 40px; }
      h2 { font-size: 24px; font-weight: 600; color: #333333; }
      p { margin: 0 0 1em 0; line-height: 1.6; }
      .button { background-color: ${forfitRed}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: 600; display: inline-block; }
      .footer { background-color: #eeeeee; padding: 20px; text-align: center; font-size: 12px; color: #777777; }
    </style>
  </head>
  <body>
    <center class="wrapper">
      <table class="main" width="100%">
        <!-- LOGO -->
        <tr>
          <td style="padding: 20px 0; text-align: center; background-color: #FAFAFA;">
            <a href="https://seusite.com.br" target="_blank"><img src="${forfitLogoUrl}" alt="Forfit Logo" width="120"></a>
          </td>
        </tr>
        <!-- CONTEÚDO DO E-MAIL -->
        <tr>
          <td class="content">
            <h2 style="font-family: 'Poppins', sans-serif;">${content.title}</h2>
            ${content.body}
            <p style="margin-top: 30px; margin-bottom: 30px; text-align: center;">
              <a href="${content.button.url}" target="_blank" class="button">${content.button.text}</a>
            </p>
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td class="footer">
            <p>&copy; ${new Date().getFullYear()} Forfit. Todos os direitos reservados.</p>
            <p>Se tiver alguma dúvida, entre em contato conosco.</p>
          </td>
        </tr>
      </table>
    </center>
  </body>
  </html>
  `;
}

/**
 * Envia o e-mail de verificação inicial após o registro.
 */
export async function sendVerificationEmail(user: UserInfo, token: string) {
  const verifyUrl = `${env.APP_URL}/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

  const emailHtml = createEmailBase({
    title: `Olá, ${user.name}!`,
    body: `<p>Obrigado por se registrar na Forfit! Para ativar sua conta, por favor, confirme seu e-mail clicando no botão abaixo:</p>
           <p>Este link é válido por 24 horas.</p>`,
    button: {
      text: 'Confirmar meu E-mail',
      url: verifyUrl
    }
  });

  await sendMail({
    to: user.email,
    subject: 'Bem-vindo à Forfit! Confirme seu e-mail',
    html: emailHtml,
  });
}

/**
 * Envia o e-mail para redefinição de senha.
 */
export async function sendPasswordResetEmail(user: UserInfo, token: string) {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  const emailHtml = createEmailBase({
    title: 'Redefinição de Senha',
    body: `<p>Olá, ${user.name}. Recebemos uma solicitação para redefinir sua senha. Para criar uma nova senha, clique no botão abaixo:</p>
           <p>Se não foi você quem solicitou, pode ignorar este e-mail com segurança.</p>`,
    button: {
      text: 'Redefinir Senha',
      url: resetUrl,
    }
  });

  await sendMail({
    to: user.email,
    subject: 'Sua redefinição de senha da Forfit',
    html: emailHtml,
  });
}

/**
 * Reenvia o e-mail de verificação quando solicitado.
 */
export async function sendResendVerificationEmail(user: UserInfo, token: string) {
  const verifyUrl = `${env.APP_URL}/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

  const emailHtml = createEmailBase({
    title: 'Novo Link de Verificação',
    body: `<p>Olá, ${user.name}! Aqui está seu novo link para confirmação de e-mail. Por favor, clique no botão abaixo para ativar sua conta:</p>
           <p>Este link é válido por 24 horas.</p>`,
    button: {
      text: 'Confirmar meu E-mail',
      url: verifyUrl,
    }
  });

  await sendMail({
    to: user.email,
    subject: 'Confirme seu e-mail na Forfit',
    html: emailHtml,
  });
}

