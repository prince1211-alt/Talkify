const mongoose = require("mongoose");
const mailSender = require("../utils/mailSender");
//const emailTemplate = require("../mail/templates/emailVerificationTemplate");
const OTPSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
	},
	otp: {
		type: String,
		required: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
		expires: 60 * 5,
	},
});

async function sendVerificationEmail(email, otp) {

	try {
		const mailResponse = await mailSender(
			email,
			"Talkify Verification Email",
			`<h1>Welcome to Talkify!</h1><p>Your OTP for registration is: <b>${otp}</b></p>`
		);
	} catch (error) {
		console.log("Error occurred while sending email: ", error);
		throw error;
	}
}

OTPSchema.pre("save", async function () {
	// Only send an email when a new document is created
	if (this.isNew) {
		await sendVerificationEmail(this.email, this.otp);
	}
});

const OTP = mongoose.model("OTP", OTPSchema);
module.exports = OTP;