const express = require("express");
const router = express.Router();

const { auth } = require("../middleware/auth");
const { getIceServers } = require("../controllers/webrtc");

router.get("/ice-servers", auth, getIceServers);

module.exports = router;
