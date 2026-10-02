const express = require("express")
const router = express.Router();
const { auth } = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");

const {
    signup,
    login,
    logout,
    getMe,
    addContact,
    updateKeys,
} = require("../controllers/user");

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Brute-force protection (per IP + account for login)
const loginLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 10,
    message: "Too many login attempts. Please try again in a few minutes.",
    keyGenerator: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
});
const signupLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 10,
    message: "Too many signup attempts. Please try again later.",
});
const verifyLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 20,
    message: "Too many attempts. Please try again later.",
});

router.post("/signup", signupLimiter, signup)
router.post("/login", loginLimiter, login)
router.post("/logout", logout)
router.get("/me", auth, getMe)
router.post("/add-contact", auth, addContact)
router.put("/keys", auth, verifyLimiter, updateKeys)

module.exports = router;
