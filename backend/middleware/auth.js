const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verifies a JWT and makes sure the user still exists and has not changed
// their password after the token was issued. Returns the user or null.
const verifyAccessToken = async (token, select = "_id fullName passwordChangedAt") => {
	if (!token) return null;

	let decoded;
	try {
		decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
	} catch {
		return null;
	}

	const user = await User.findById(decoded.id).select(select);
	if (!user) return null;

	// Tokens issued before a password reset are no longer valid (1s clock tolerance)
	if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
		return null;
	}

	return { user, decoded };
};

const getRequestToken = (req) => {
	const header = req.get("Authorization") || "";
	if (header.startsWith("Bearer ")) {
		const token = header.slice(7).trim();
		if (token) return token;
	}
	return req.cookies?.token || null;
};

exports.auth = async (req, res, next) => {
	try {
		const token = getRequestToken(req);
		if (!token) {
			return res.status(401).json({ success: false, message: "Token Missing" });
		}

		const result = await verifyAccessToken(token);
		if (!result) {
			return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
		}

		req.user = {
			id: String(result.user._id),
			_id: result.user._id,
			email: result.decoded.email,
		};
		next();
	} catch (error) {
		// A database error is not an auth failure — don't force the client to log out
		console.error("auth middleware error:", error);
		return res.status(500).json({
			success: false,
			message: "Something went wrong while validating the session",
		});
	}
};

exports.verifyAccessToken = verifyAccessToken;
