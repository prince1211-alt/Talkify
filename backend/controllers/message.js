const User = require("../models/User.js");
const Message = require("../models/Message.js"); // ⚠ check spelling
const cloudinary = require("../config/cloudinary.js");
const { getReceiverSocketId, io } = require("../config/socketio.js");

// ============================
// 🔹 GET USERS (Sidebar)
// ============================
exports.getUsersForSidebar = async (req, res) => {
  try {
    const myId = req.user._id || req.user.id;

    const users = await User.find({ _id: { $ne: myId } })
      .select("-password");

    res.json(users);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};


// ============================
// 🔹 GET CHAT MESSAGES
// ============================
exports.getMessages = async (req, res) => {
  try {
    const myId = req.user._id || req.user.id;
    const otherUserId = req.params.id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId }
      ]
    });

    res.json(messages);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};


// ============================
// 🔹 SEND MESSAGE
// ============================
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id || req.user.id;
    const receiverId = req.params.id;
    const { text, image } = req.body;

    let imageUrl = "";

    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const message = await Message.create({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    // Emit to both sender and receiver (all their tabs)
    io.to(senderId).to(receiverId).emit("newMessage", message);

    res.status(201).json(message);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};