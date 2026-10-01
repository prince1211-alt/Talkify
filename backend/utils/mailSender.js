const nodemailer = require("nodemailer");

// Email delivery with three possible providers, picked from environment variables:
//
//   1. BREVO_API_KEY   -> Brevo HTTPS API (recommended for Render / Railway / etc.
//                         Many hosts block outgoing SMTP ports, HTTPS on 443 always works.)
//   2. RESEND_API_KEY  -> Resend HTTPS API (MAIL_FROM must use a domain verified in Resend;
//                         "onboarding@resend.dev" can only send to your own Resend account email.)
//   3. SMTP            -> SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
//                         (legacy names MAIL_HOST/MAIL_USER/MAIL_PASS and BREVO_USER/BREVO_PASS also work)
//
// MAIL_FROM must be a sender address your provider has verified.
// Note: Brevo's SMTP login (xxxx@smtp-brevo.com) is NOT a valid sender address.
// Set MAIL_PROVIDER=brevo|resend|smtp to force a provider.

const SEND_TIMEOUT_MS = 15000;

const getSender = () => ({
  email: (process.env.MAIL_FROM || process.env.SMTP_USER || process.env.MAIL_USER || "").trim(),
  name: (process.env.MAIL_FROM_NAME || "Talkify").trim(),
});

const getSmtpConfig = () => {
  const user = process.env.SMTP_USER || process.env.MAIL_USER || process.env.BREVO_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS || process.env.BREVO_PASS;
  const host =
    process.env.SMTP_HOST ||
    process.env.MAIL_HOST ||
    (process.env.BREVO_USER ? "smtp-relay.brevo.com" : "");
  if (!host || !user || !pass) return null;
  return { host, user, pass, port: Number(process.env.SMTP_PORT) || 587 };
};

const detectProvider = () => {
  const forced = (process.env.MAIL_PROVIDER || "").trim().toLowerCase();
  if (forced) return forced;
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  if (getSmtpConfig()) return "smtp";
  return null;
};

const readJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

const sendWithBrevo = async ({ to, subject, html, text }) => {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set");
  const sender = getSender();
  if (!sender.email) throw new Error("MAIL_FROM is not set (use a sender email verified in Brevo)");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(`Brevo API ${res.status}: ${body.message || body.code || "request failed"}`);
  }
  return { provider: "brevo", id: body.messageId };
};

const sendWithResend = async ({ to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const sender = getSender();
  if (!sender.email) throw new Error("MAIL_FROM is not set (use an address on a domain verified in Resend)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.email}>`,
      to: [to],
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(`Resend API ${res.status}: ${body.message || body.name || "request failed"}`);
  }
  return { provider: "resend", id: body.id };
};

let smtpTransport = null;
const sendWithSmtp = async ({ to, subject, html, text }) => {
  const config = getSmtpConfig();
  if (!config) throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS must be set");
  const sender = getSender();

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }

  const info = await smtpTransport.sendMail({
    from: `"${sender.name}" <${sender.email || config.user}>`,
    to,
    subject,
    html,
    text,
  });
  return { provider: "smtp", id: info.messageId };
};

const PROVIDERS = { brevo: sendWithBrevo, resend: sendWithResend, smtp: sendWithSmtp };

const mailSender = async (email, title, html, text = "") => {
  const provider = detectProvider();

  if (!provider) {
    // Local development without email credentials: print the message instead of failing
    if ((process.env.NODE_ENV || "").toLowerCase() !== "production") {
      console.warn(`[mail:dev] No email provider configured. Email to ${email} — "${title}":\n${text}`);
      return { provider: "console", id: null };
    }
    throw new Error("No email provider configured. Set BREVO_API_KEY, RESEND_API_KEY or SMTP_* variables.");
  }

  const send = PROVIDERS[provider];
  if (!send) throw new Error(`Unknown MAIL_PROVIDER "${provider}"`);

  try {
    const result = await send({ to: email, subject: title, html, text });
    console.log(`✅ Email sent via ${result.provider}:`, result.id || "");
    return result;
  } catch (error) {
    console.error(`❌ Email send error (${provider}):`, error.message);
    throw error;
  }
};

const describeMailProvider = () => {
  const provider = detectProvider();
  if (!provider) return "none (OTP emails are printed to the console in development)";
  const sender = getSender();
  return `${provider}${sender.email ? ` from ${sender.email}` : " (MAIL_FROM missing!)"}`;
};

module.exports = mailSender;
module.exports.describeMailProvider = describeMailProvider;
