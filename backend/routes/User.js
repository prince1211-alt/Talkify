const express = require("express")
const router = express.Router();

const {
    signup,
    login,
    sendotp
} = require("../controllers/user");

router.post("/signUp", signup)
router.post("/login",login)
router.post("/sendotp",sendotp)

// Forgot / Reset password
router.post("/forgot-password", require("../controllers/user").forgotPassword)
router.post("/reset-password", require("../controllers/user").resetPassword)

module.exports = router ; 