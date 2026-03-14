const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            }
        });

        const info = await transporter.sendMail({
            from: `"Talkify" <${process.env.MAIL_USER}>`,
            to: email,
            subject: title,
            html: body,
        });

        return info;

    } catch (error) {
        console.error("Email error:", error.message);
        throw error;
    }
};

module.exports = mailSender;