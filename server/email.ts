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
  const from = process.env.SMTP_FROM || "BigBossCoffee <no-reply@bigbosscoffee.local>";
  const subject = "Votre code de réinitialisation BigBossCoffee";
  const text = `Votre code de vérification est : ${code}\n\nCe code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#d97706;">BigBossCoffee</h2>
      <p>Voici votre code de vérification pour réinitialiser votre mot de passe :</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #111;">${code}</p>
      <p style="color:#666; font-size: 13px;">Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
    </div>`;

  const t = getTransporter();
  if (!t) {
    // No SMTP configured in this environment — never expose the code via the API response;
    // this is the only safe place it can surface for local development/testing.
    console.log(`[email:dev-fallback] No SMTP configured — password reset code for ${to}: ${code} (expires in 10 min)`);
    return;
  }
  await t.sendMail({ from, to, subject, text, html });
}
