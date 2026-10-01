const crypto = require("crypto");
const OTP = require("../models/OTP");
const mailSender = require("./mailSender");

const OTP_TTL_MS = 5 * 60 * 1000; // must match the TTL index in models/OTP.js
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

class OtpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

const hashOtp = (email, purpose, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${purpose}:${email}:${code}`).digest("hex");

const buildEmail = (code, purpose) => {
  const minutes = Math.round(OTP_TTL_MS / 60000);
  const action = purpose === "reset" ? "reset your Talkify password" : "finish creating your Talkify account";
  const subject = purpose === "reset" ? "Your Talkify password reset code" : "Your Talkify verification code";

  const text = `Your code to ${action} is ${code}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Talkify</h2>
      <p>Use this code to ${action}:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
      <p>This code expires in ${minutes} minutes.</p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;

  return { subject, html, text };
};

// Creates a new code, stores only its hash and emails it.
const issueOtp = async (email, purpose) => {
  const latest = await OTP.findOne({ email, purpose }).sort({ createdAt: -1 });
  if (latest) {
    const waitMs = latest.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (waitMs > 0) {
      throw new OtpError(429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting a new OTP.`);
    }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

  await OTP.deleteMany({ email, purpose });
  const record = await OTP.create({ email, purpose, otpHash: hashOtp(email, purpose, code) });

  const { subject, html, text } = buildEmail(code, purpose);
  try {
    await mailSender(email, subject, html, text);
  } catch {
    // Don't keep a code the user never received (and don't block a retry with the cooldown)
    await OTP.deleteOne({ _id: record._id }).catch(() => {});
    throw new OtpError(502, "We couldn't send the OTP email right now. Please try again in a moment.");
  }
};

// Returns the matching record or throws an OtpError. Call consumeOtp() after the
// protected action succeeds so a code can only be used once.
const verifyOtp = async (email, purpose, code) => {
  const record = await OTP.findOne({ email, purpose }).sort({ createdAt: -1 });

  if (!record || Date.now() - record.createdAt.getTime() > OTP_TTL_MS) {
    throw new OtpError(400, "OTP expired or not requested. Please request a new one.");
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await OTP.deleteMany({ email, purpose });
    throw new OtpError(429, "Too many wrong attempts. Please request a new OTP.");
  }

  const expected = Buffer.from(record.otpHash, "hex");
  const actual = Buffer.from(hashOtp(email, purpose, String(code ?? "").trim()), "hex");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    record.attempts += 1;
    await record.save();
    const left = MAX_VERIFY_ATTEMPTS - record.attempts;
    throw new OtpError(400, left > 0 ? `Invalid OTP. ${left} attempt(s) left.` : "Invalid OTP. Please request a new one.");
  }

  return record;
};

const consumeOtp = (email, purpose) => OTP.deleteMany({ email, purpose });

module.exports = {
  OtpError,
  normalizeEmail,
  isValidEmail,
  issueOtp,
  verifyOtp,
  consumeOtp,
};
