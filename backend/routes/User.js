const express = require("express")
const router = express.Router();
const { auth } = require("../middleware/auth");

const {
    signup,
    login,
    sendotp,
    addContact
} = require("../controllers/user");

router.post("/signup", signup)
router.post("signUp",signup)

router.post("/login", login)
router.post("/sendotp", sendotp)
router.post("/add-contact", auth, addContact)

// Forgot / Reset password
router.post("/forgot-password", require("../controllers/user").forgotPassword)
router.post("/reset-password", require("../controllers/user").resetPassword)

module.exports = router; 