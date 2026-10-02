const mongoose = require("mongoose");
const User = require("../models/User.js");
const Message = require("../models/Message.js");
const { uploadBufferToCloudinary } = require("../config/multer.js");
const { io } = require("../config/socketio.js");

const MAX_CIPHERTEXT_LENGTH = 100000;

const str = (value) => (typeof value === "string" ? value : "");
const isValidId = (id) => mongoose.isObjectIdOrHexString(id);
const publicProfile = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  profilePic: user.profilePic,
  status: user.status,
});

// ============================
// GET USERS (Sidebar)
// ============================
exports.getUsersForSidebar = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).populate({
      path: "contacts",
      select: "fullName email profilePic status publicKey",
    });
    if (!me) return res.status(404).json({ message: "User not found" });

    res.json(me.contacts.filter(Boolean));
  } catch (err) {
    console.error("getUsersForSidebar error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ============================
// GET CHAT MESSAGES
// ============================
exports.getMessages = async (req, res) => {
  try {
    const myId = req.user.id;
    const otherUserId = req.params.id;
    if (!isValidId(otherUserId)) return res.status(400).json({ message: "Invalid user id" });

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId }
      ]
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ============================
// SEND MESSAGE (text and/or image, both encrypted on the client)
// ============================
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const receiverId = req.params.id;
    const body = req.body || {};

    const text = str(body.text);
    const iv = str(body.iv);
    const imageIv = str(body.imageIv);
    const encryptedKeyForSender = str(body.encryptedKeyForSender);
    const encryptedKeyForReceiver = str(body.encryptedKeyForReceiver);

    if (!isValidId(receiverId)) return res.status(400).json({ message: "Invalid receiver" });
    if (receiverId === senderId) return res.status(400).json({ message: "You cannot message yourself" });
    if (!text && !req.file) return res.status(400).json({ message: "Message is empty" });
    if (text.length > MAX_CIPHERTEXT_LENGTH) return res.status(413).json({ message: "Message is too long" });

    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select("fullName email profilePic status contacts"),
      User.findById(receiverId).select("fullName email profilePic status contacts"),
    ]);
    if (!sender || !receiver) return res.status(404).json({ message: "User not found" });

    const imageUrl = req.file ? await uploadBufferToCloudinary(req.file, { encrypted: Boolean(imageIv) }) : "";

    const message = await Message.create({
      senderId,
      receiverId,
      text,
      encryptedKeyForSender,
      encryptedKeyForReceiver,
      iv,
      image: imageUrl,
      imageIv: imageUrl ? imageIv : "",
    });

    // Auto-add each user to the other's contacts so both see the chat in their sidebar
    const senderHadReceiver = sender.contacts.some((id) => String(id) === receiverId);
    const receiverHadSender = receiver.contacts.some((id) => String(id) === senderId);

    await Promise.all([
      senderHadReceiver ? null : User.updateOne({ _id: senderId }, { $addToSet: { contacts: receiver._id } }),
      receiverHadSender ? null : User.updateOne({ _id: receiverId }, { $addToSet: { contacts: sender._id } }),
    ]);

    if (!receiverHadSender) io.to(receiverId).emit("contactAdded", { user: publicProfile(sender) });
    if (!senderHadReceiver) io.to(senderId).emit("contactAdded", { user: publicProfile(receiver) });

    // Emit to both sender and receiver (all their tabs)
    io.to(senderId).to(receiverId).emit("newMessage", message);

    res.status(201).json(message);
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================
// GET USER PUBLIC KEY
// ============================
exports.getPublicKey = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!isValidId(userId)) return res.status(400).json({ message: "Invalid user id" });

    const user = await User.findById(userId).select("publicKey");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ publicKey: user.publicKey });
  } catch (err) {
    console.error("getPublicKey error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================
// ENCRYPTED MEDIA FALLBACK
// ============================
// Encrypted images are fetched by the browser and decrypted locally. If the browser can't
// fetch them from Cloudinary directly (CORS / network), it gets the same ciphertext through here.
// Only raw files of this app's own Cloudinary account are allowed (no open proxy).
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

exports.getEncryptedMedia = async (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    let url;
    try {
      url = new URL(str(req.query.url));
    } catch {
      return res.status(400).json({ message: "Invalid media url" });
    }

    const allowed =
      cloudName &&
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/raw/upload/`);
    if (!allowed) return res.status(400).json({ message: "Invalid media url" });

    const upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) return res.status(502).json({ message: "Could not load media" });
    if (Number(upstream.headers.get("content-length")) > MAX_MEDIA_BYTES) {
      return res.status(413).json({ message: "Media too large" });
    }

    const data = Buffer.from(await upstream.arrayBuffer());
    res.set("Content-Type", "application/octet-stream");
    res.set("Cache-Control", "private, max-age=86400");
    return res.send(data);
  } catch (err) {
    console.error("getEncryptedMedia error:", err.message);
    return res.status(502).json({ message: "Could not load media" });
  }
};

// ============================
// DELETE MESSAGE (soft — content is wiped, a "deleted" placeholder stays)
// ============================
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user.id;
    if (!isValidId(messageId)) return res.status(400).json({ message: "Invalid message id" });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const isSender = message.senderId.toString() === userId;
    const isReceiver = message.receiverId.toString() === userId;
    if (!isSender && !isReceiver) {
      return res.status(403).json({ message: "Not authorized to delete this message" });
    }

    message.deleted = true;
    message.text = "";
    message.iv = "";
    message.image = "";
    message.imageIv = "";
    message.encryptedKeyForSender = "";
    message.encryptedKeyForReceiver = "";
    await message.save();

    // Notify both parties
    io.to(message.senderId.toString()).to(message.receiverId.toString()).emit("messageDeleted", {
      messageId: message._id,
      chatType: "private",
      senderId: message.senderId,
      receiverId: message.receiverId,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("deleteMessage error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// ============================
//  MARK MESSAGES AS READ
// ============================
exports.markMessagesRead = async (req, res) => {
  try {
    const myId = req.user.id;
    const otherUserId = req.params.id;
    if (!isValidId(otherUserId)) return res.status(400).json({ message: "Invalid user id" });

    await Message.updateMany(
      { senderId: otherUserId, receiverId: myId, seen: false },
      { $set: { seen: true } }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("markMessagesRead error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
