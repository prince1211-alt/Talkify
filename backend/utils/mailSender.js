const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
    // Warn early if env vars are missing — helps debug on Render
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
        console.error("❌ Mail env vars missing! MAIL_HOST:", process.env.MAIL_HOST, "MAIL_USER:", process.env.MAIL_USER);
        throw new Error("Email configuration is missing. Please set MAIL_HOST, MAIL_USER, MAIL_PASS in environment variables.");
    }

    try {
        // Use port 587 + STARTTLS — port 465 (SSL) is blocked by many cloud hosts like Render
        const transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: 587,
            secure: false, // STARTTLS (upgrades connection after connect)
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            },
            connectionTimeout: 10000, // 10 second timeout to fail fast
            greetingTimeout: 10000,
            socketTimeout: 15000,
        });

        const info = await transporter.sendMail({
            from: `"Talkify" <${process.env.MAIL_USER}>`,
            to: email,
            subject: title,
            html: body,
        });

        console.log("✅ Email sent:", info.messageId);
        return info;

    } catch (error) {
        console.error("❌ Email send error:", error.message);
        throw error;
    }
};

module.exports = mailSender;