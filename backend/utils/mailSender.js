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

        console.log("Email sent:", info.messageId);
        return info;

    } catch (error) {
        console.error("Email error:", error);
        throw error;   // important
    }
};

module.exports = mailSender;