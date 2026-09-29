import nodemailer from "nodemailer";

/**
 * Minimal email-sending capability for the password-reset flow. Audited first: this project
 * had NO email infrastructure anywhere (no nodemailer/SendGrid/SMTP config, confirmed by
 * grepping the whole server directory) — this is the one new piece genuinely required by the
 * "send a verification code by email" requirement, not a parallel auth system.
 *
 * Reads standard SMTP_* env vars. If they are not configured (e.g. this local/dev
 * environment, which has no real mail credentials), falls back to logging the email to the
 * server console only — never to the HTTP response, never to the frontend. The moment real
 * SMTP credentials are set, this same code path sends a real email with no further changes.
 */

// Distinct from a generic Error so the /api/auth/forgot-password handler can tell "the
// send genuinely failed" apart from an unrelated bug — and log the former loudly server-
// side — while still returning the SAME generic client-facing message either way (this
// preserves the existing account-enumeration protection; only the SERVER-SIDE log
// differs, never the response the caller sees).
export class EmailDeliveryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_PORT === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  
const from =
  process.env.SMTP_FROM ||
  "BigBossCoffee <no-reply@bigbosscoffee.local>";

const subject = "Votre code de vérification | BigBossCoffee";

const text = `
Bonjour,

Vous avez demandé à réinitialiser votre mot de passe BigBossCoffee.

Votre code de vérification : ${code}

Ce code est valable pendant 10 minutes.

Pour votre sécurité, ne partagez jamais ce code avec qui que ce soit.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.
Aucune modification ne sera apportée à votre compte.

BigBossCoffee
Votre partenaire pour le business du café.

Cet e-mail a été envoyé automatiquement. Merci de ne pas y répondre.
`;

const safeCode = String(code).replace(/[&<>"']/g, (char) => {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return entities[char];
});

const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Votre code de vérification - BigBossCoffee</title>
</head>
<body style="
  margin: 0;
  padding: 0;
  background-color: #f3f4f6;
  font-family: Arial, Helvetica, sans-serif;
  color: #1f2937;
">

  <!-- Preheader -->
  <div style="
    display: none;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    color: transparent;
  ">
    Votre code de vérification BigBossCoffee est prêt.
    Il est valable pendant 10 minutes.
  </div>

  <table role="presentation" width="100%" cellspacing="0"
    cellpadding="0" border="0"
    style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 12px;">

        <table role="presentation" width="100%" cellspacing="0"
          cellpadding="0" border="0"
          style="
            max-width: 520px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
          ">

          <!-- Brand header -->
          <tr>
            <td align="center" style="
              background-color: #d97706;
              padding: 28px 24px;
            ">
              <div style="
                color: #ffffff;
                font-size: 27px;
                line-height: 34px;
                font-weight: 700;
                letter-spacing: -0.5px;
              ">
                BigBossCoffee
              </div>
              <div style="
                color: #fff7ed;
                font-size: 10px;
                letter-spacing: 2px;
                margin-top: 7px;
              ">
                THE COFFEE BUSINESS PLATFORM
              </div>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding: 36px 28px 24px;">

              <h1 style="
                margin: 0 0 20px;
                color: #111827;
                font-size: 23px;
                line-height: 1.4;
                font-weight: 700;
                text-align: center;
              ">
                Réinitialisation du mot de passe
              </h1>

              <p style="
                margin: 0 0 14px;
                font-size: 15px;
                line-height: 1.8;
                color: #4b5563;
              ">
                Bonjour,
              </p>

              <p style="
                margin: 0 0 26px;
                font-size: 15px;
                line-height: 1.8;
                color: #4b5563;
              ">
                Vous avez demandé à réinitialiser votre mot de passe
                BigBossCoffee. Utilisez le code ci-dessous pour continuer.
              </p>

              <!-- Verification code -->
              <table role="presentation" width="100%" cellspacing="0"
                cellpadding="0" border="0">
                <tr>
                  <td align="center" style="
                    background-color: #fffaf2;
                    border: 1px solid #fed7aa;
                    border-radius: 10px;
                    padding: 24px 12px;
                  ">
                    <div style="
                      color: #92400e;
                      font-size: 11px;
                      font-weight: 700;
                      letter-spacing: 1.5px;
                      margin-bottom: 14px;
                    ">
                      VOTRE CODE DE VÉRIFICATION
                    </div>

                    <div style="
                      color: #b45309;
                      font-family: Arial, Helvetica, sans-serif;
                      font-size: 34px;
                      font-weight: 700;
                      line-height: 1.4;
                      letter-spacing: 7px;
                      overflow-wrap: anywhere;
                    ">
                      ${safeCode}
                    </div>

                    <div style="
                      margin-top: 14px;
                      color: #92400e;
                      font-size: 13px;
                    ">
                      Valable pendant 1 minute
                    </div>
                  </td>
                </tr>
              </table>

              <p style="
                margin: 24px 0;
                font-size: 14px;
                line-height: 1.8;
                color: #4b5563;
              ">
                Saisissez ce code dans la page de réinitialisation
                pour sécuriser votre compte et définir un nouveau mot de passe.
              </p>

              <!-- Security notice -->
              <table role="presentation" width="100%" cellspacing="0"
                cellpadding="0" border="0">
                <tr>
                  <td valign="top" width="32" style="padding-top: 2px;">
                    <div style="
                      width: 26px;
                      height: 26px;
                      line-height: 26px;
                      text-align: center;
                      background-color: #f3f4f6;
                      border-radius: 50%;
                      color: #4b5563;
                      font-size: 14px;
                      font-weight: 700;
                    ">!</div>
                  </td>
                  <td style="
                    font-size: 13px;
                    line-height: 1.8;
                    color: #6b7280;
                  ">
                    <strong style="color: #374151;">
                      Important pour votre sécurité
                    </strong>
                    <br>
                    Ne partagez jamais ce code.
                    BigBossCoffee ne vous demandera jamais de nous le communiquer.
                  </td>
                </tr>
              </table>

              <div style="
                height: 1px;
                background-color: #e5e7eb;
                margin: 28px 0 20px;
              "></div>

              <p style="
                margin: 0;
                font-size: 13px;
                line-height: 1.8;
                color: #6b7280;
              ">
                Vous n'êtes pas à l'origine de cette demande ?
                Ignorez simplement cet e-mail.
                Votre mot de passe actuel restera inchangé.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
              padding: 24px 20px;
            ">
              <div style="
                color: #374151;
                font-size: 14px;
                font-weight: 700;
                margin-bottom: 8px;
              ">
                BigBossCoffee
              </div>

              <div style="
                color: #9ca3af;
                font-size: 12px;
                line-height: 1.8;
              ">
                Votre partenaire pour le business du café.
                <br>
                © 2026 BigBossCoffee. Tous droits réservés.
                <br>
                Cet e-mail a été envoyé automatiquement.
                Merci de ne pas y répondre.
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

  const t = getTransporter();
  if (!t) {
    // No SMTP configured in this environment — never expose the code via the API response;
    // this is the only safe place it can surface for local development/testing.
    console.log(`[email:dev-fallback] No SMTP configured — password reset code for ${to}: ${code} (expires in 10 min)`);
    return;
  }
  try {
    await t.sendMail({ from, to, subject, text, html });
  } catch (err: any) {
    // Root cause of "user never receives the reset email": this call previously had no
    // try/catch, so a real SMTP failure (bad credentials, connection refused, provider
    // rejection, timeout, etc.) propagated up to the route handler's generic catch-all,
    // which logged nothing and returned the exact same "email sent" message as success —
    // a real failure was indistinguishable from a real success. Log clearly here (error
    // code/message and destination only — never the SMTP password) and surface it as a
    // distinct error type so the caller can react appropriately.
    console.error(`[email:send-failed] Failed to send password reset email to ${to}:`, err?.code ?? err?.message ?? err);
    throw new EmailDeliveryError("Failed to send password reset email", err);
  }
}
