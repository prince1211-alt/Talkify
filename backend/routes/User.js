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

module.exports = router ; 