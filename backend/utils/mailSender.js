const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
    if (!process.env.BREVO_USER || !process.env.BREVO_PASS) {
        throw new Error("BREVO_USER or BREVO_PASS missing from environment variables.");
    }

    try {
        const transporter = nodemailer.createTransport({
            host: "smtp-relay.brevo.com",
            port: 587,
            secure: false,
            auth: {
                user: process.env.BREVO_USER,   // your Brevo account email
                pass: process.env.BREVO_PASS,   // Brevo SMTP key (not your password)
            },
        });

        const info = await transporter.sendMail({
            from: `"Talkify" <${process.env.BREVO_USER}>`,
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