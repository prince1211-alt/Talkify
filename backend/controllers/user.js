const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const cloudinary = require("../config/cloudinary")

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const MAX_KEY_LENGTH = 10000
const CASE_INSENSITIVE = { locale: "en", strength: 2 }

// Only accept plain strings from the request body (blocks {"$gt": ""} style injection)
const str = (value) => (typeof value === "string" ? value : "")

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "")

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254

const findUserByEmail = (email) => User.findOne({ email }).collation(CASE_INSENSITIVE)

const isProduction = () => (process.env.NODE_ENV || "").toLowerCase() === "production"

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? "none" : "lax",
  maxAge: TOKEN_TTL_MS,
})

const signToken = (user) =>
  jwt.sign({ email: user.email, id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "24h",
    algorithm: "HS256",
  })

// Never send the password hash to the client
const toPublicUser = (user) => {
  const obj = user.toObject()
  delete obj.password
  delete obj.passwordChangedAt
  delete obj.__v
  return obj
}

const isValidKeyString = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_LENGTH

exports.signup = async (req, res) => {
  try {
    const body = req.body || {}
    const fullName = str(body.fullName).trim()
    const email = normalizeEmail(body.email)
    const password = str(body.password)
    const publicKey = str(body.publicKey)
    const encryptedPrivateKey = str(body.encryptedPrivateKey)

    if (!fullName || !email || !password || !publicKey || !encryptedPrivateKey) {
      return res.status(400).json({ success: false, message: "All fields are required" })
    }
    if (fullName.length > 60) {
      return res.status(400).json({ success: false, message: "Name must be 60 characters or less" })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" })
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" })
    }
    if (!isValidKeyString(publicKey) || !isValidKeyString(encryptedPrivateKey)) {
      return res.status(400).json({ success: false, message: "Invalid encryption keys" })
    }

    if (await findUserByEmail(email)) {
      return res.status(400).json({ success: false, message: "An account with this email already exists. Please sign in." })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
      publicKey,
      encryptedPrivateKey,
    })

    const token = signToken(user)
    return res.cookie("token", token, cookieOptions()).status(200).json({
      success: true,
      token,
      user: { ...toPublicUser(user), token },
      message: "User registered successfully",
    })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: "An account with this email already exists. Please sign in." })
    }
    console.error("signup error:", error)
    return res.status(500).json({ success: false, message: "User cannot be registered. Please try again." })
  }
}

exports.login = async (req, res) => {
  try {
    const body = req.body || {}
    const email = normalizeEmail(body.email)
    const password = str(body.password)

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please fill up all the required fields" })
    }

    const user = await findUserByEmail(email)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User is not registered with us. Please sign up to continue.",
      })
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Password is incorrect" })
    }

    const token = signToken(user)
    return res.cookie("token", token, cookieOptions()).status(200).json({
      success: true,
      token,
      user: { ...toPublicUser(user), token },
      message: "User Login Success",
    })
  } catch (error) {
    console.error("login error:", error)
    return res.status(500).json({ success: false, message: "Login failure. Please try again." })
  }
}

exports.logout = async (req, res) => {
  // Express 5 ignores maxAge/expires in clearCookie, so the same options can be reused
  res.clearCookie("token", cookieOptions())
  return res.json({ success: true, message: "Logged out" })
}

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -encryptedPrivateKey -passwordChangedAt -__v")
    if (!user) return res.status(404).json({ success: false, message: "User not found" })
    return res.json({ success: true, user })
  } catch (error) {
    console.error("getMe error:", error)
    return res.status(500).json({ success: false, message: "Server error" })
  }
}

// Re-wraps the private key (stronger KDF) or rotates the whole key pair.
// Requires the current password so a stolen token can't destroy someone's keys.
exports.updateKeys = async (req, res) => {
  try {
    const body = req.body || {}
    const password = str(body.password)
    const encryptedPrivateKey = body.encryptedPrivateKey
    const publicKey = body.publicKey

    if (!password || !isValidKeyString(encryptedPrivateKey)) {
      return res.status(400).json({ success: false, message: "Password and encrypted key are required" })
    }
    if (publicKey !== undefined && !isValidKeyString(publicKey)) {
      return res.status(400).json({ success: false, message: "Invalid public key" })
    }

    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ success: false, message: "User not found" })

    if (!(await bcrypt.compare(password, user.password))) {
      // 403, not 401: the session itself is fine
      return res.status(403).json({ success: false, message: "Password is incorrect" })
    }

    user.encryptedPrivateKey = encryptedPrivateKey
    if (publicKey) user.publicKey = publicKey
    await user.save()

    return res.json({
      success: true,
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
    })
  } catch (error) {
    console.error("updateKeys error:", error)
    return res.status(500).json({ success: false, message: "Server error" })
  }
}

exports.updateProfile = async (req, res) => {
  try {
    const profilePic = str((req.body || {}).profilePic)
    const userId = req.user.id

    if (!profilePic.startsWith("data:image/")) {
      return res.status(400).json({ message: "Profile pic is required" })
    }

    const uploadResponse = await cloudinary.uploader.upload(profilePic)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    ).select("-password -passwordChangedAt -__v")

    res.status(200).json(updatedUser)
  } catch (error) {
    console.log("error in update profile:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}


// ============================
// 🔹 ADD CONTACT
// ============================
exports.addContact = async (req, res) => {
  try {
    const email = normalizeEmail((req.body || {}).email)
    const myId = req.user.id

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" })
    }

    const targetUser = await findUserByEmail(email).select("fullName email profilePic status publicKey")
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    if (targetUser._id.toString() === myId) {
      return res.status(400).json({ success: false, message: "You cannot add yourself" })
    }

    const me = await User.findById(myId)
    if (!me) {
      return res.status(404).json({ success: false, message: "Current user not found. Please log in again." })
    }

    if (me.contacts.includes(targetUser._id)) {
      return res.status(400).json({ success: false, message: "User is already in your contacts" })
    }

    me.contacts.push(targetUser._id)
    await me.save()

    return res.status(200).json({ success: true, message: "Contact added successfully", targetUser })
  } catch (err) {
    console.error("addContact error:", err)
    return res.status(500).json({ success: false, message: "Server error" })
  }
}
