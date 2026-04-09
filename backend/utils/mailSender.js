const nodemailer = require("nodemailer");
const dns = require("dns");

// Force Node.js to resolve hostnames to IPv4 FIRST
dns.setDefaultResultOrder("ipv4first");

const mailSender = async (email, title, body) => {
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
        console.error("❌ Mail env vars missing!");
        throw new Error("Email configuration is missing.");
    }

    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            },
            connectionTimeout: 10000,
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