const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const mailSender = async (email, title, body) => {
    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is missing from environment variables.");
    }

    try {
        const { data, error } = await resend.emails.send({
            from: "Talkify <onboarding@resend.dev>", // use this until you add a domain
            to: email,
            subject: title,
            html: body,
        });

        if (error) {
            console.error("❌ Email send error:", error);
            throw new Error(error.message);
        }

        console.log("✅ Email sent:", data.id);
        return data;

    } catch (error) {
        console.error("❌ Email send error:", error.message);
        throw error;
    }
};

module.exports = mailSender;