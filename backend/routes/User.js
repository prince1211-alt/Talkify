const express = require("express")
const router = express.Router();
const { auth } = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");

const {
    signup,
    login,
    logout,
    getMe,
    sendotp,
    addContact,
    updateKeys,
    forgotPassword,
    resetPassword,
} = require("../controllers/user");

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Brute-force protection (per IP + account for login)
const loginLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 10,
    message: "Too many login attempts. Please try again in a few minutes.",
    keyGenerator: (req) => `${req.ip}:${String(req.body?.uniqueId || "").toLowerCase()}`,
});
const otpLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 10,
    message: "Too many OTP requests. Please try again later.",
});
const verifyLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 20,
    message: "Too many attempts. Please try again later.",
});

router.post("/signup", verifyLimiter, signup)
router.post("/login", loginLimiter, login)
router.post("/logout", logout)
router.get("/me", auth, getMe)
router.post("/sendotp", otpLimiter, sendotp)
router.post("/add-contact", auth, addContact)
router.put("/keys", auth, verifyLimiter, updateKeys)

// Forgot / Reset password
router.post("/forgot-password", otpLimiter, forgotPassword)
router.post("/reset-password", verifyLimiter, resetPassword)

module.exports = router;
