const mongoose = require("mongoose");

// Emails are sent by utils/otp.js, not from a save hook, so a failed email
// never leaves a usable code behind and the controller can report the error.
const OTPSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		index: true,
	},
	purpose: {
		type: String,
		enum: ["signup", "reset"],
		required: true,
	},
	// HMAC of the code — the plain code is never stored
	otpHash: {
		type: String,
		required: true,
	},
	attempts: {
		type: Number,
		default: 0,
	},
	createdAt: {
		type: Date,
		default: Date.now,
		expires: 60 * 5,
	},
});

const OTP = mongoose.model("OTP", OTPSchema);
module.exports = OTP;
