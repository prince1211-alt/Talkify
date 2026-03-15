const User = require("../models/User.js");
const Message = require("../models/Message.js");
const cloudinary = require("../config/cloudinary.js");
const { getReceiverSocketId, io } = require("../config/socketio.js");

// Helper: upload buffer (from multer) to Cloudinary using data URI
const uploadBufferToCloudinary = async (file) => {
  if (!file) return "";
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const upload = await cloudinary.uploader.upload(dataUri);
  return upload.secure_url || "";
};

// GET USERS (Sidebar)
exports.getUsersForSidebar = async (req, res) => {
  try {
    const myId = req.user._id || req.user.id;

    const me = await User.findById(myId).populate({
      path: "contacts",
      select: "-password"
    });

    res.json(me.contacts);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};


// GET CHAT MESSAGES
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


// SEND MESSAGE
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id || req.user.id;
    const receiverId = req.params.id;
    const { text, encryptedKeyForSender, encryptedKeyForReceiver, iv } = req.body;

    let imageUrl = "";

    // multipart upload via multer (req.file) or fallback to body.image (base64)
    if (req.file) {
      imageUrl = await uploadBufferToCloudinary(req.file);
    } else if (req.body.image) {
      const upload = await cloudinary.uploader.upload(req.body.image);
      imageUrl = upload.secure_url;
    }

    const message = await Message.create({
      senderId,
      receiverId,
      text,
      encryptedKeyForSender,
      encryptedKeyForReceiver,
      iv,
      image: imageUrl,
    });

    // Auto-add each user to the other's contacts (if not already there)
    // This lets the receiver see the sender in their sidebar without manually adding them
    const [sender, receiver] = await Promise.all([
      User.findById(senderId),
      User.findById(receiverId),
    ]);

    let senderUpdated = false;
    let receiverUpdated = false;

    if (sender && !sender.contacts.includes(receiverId)) {
      sender.contacts.push(receiverId);
      await sender.save();
      senderUpdated = true;
    }

    if (receiver && !receiver.contacts.includes(senderId)) {
      receiver.contacts.push(senderId);
      await receiver.save();
      receiverUpdated = true;
    }

    // If receiver's contacts were updated, notify them via socket so sidebar refreshes
    if (receiverUpdated) {
      io.to(receiverId.toString()).emit("contactAdded", {
        user: {
          _id: sender._id,
          fullName: sender.fullName,
          uniqueId: sender.uniqueId,
          profilePic: sender.profilePic,
          status: sender.status,
        }
      });
    }

    // Also notify sender if they didn't have receiver in contacts
    if (senderUpdated) {
      io.to(senderId.toString()).emit("contactAdded", {
        user: {
          _id: receiver._id,
          fullName: receiver.fullName,
          uniqueId: receiver.uniqueId,
          profilePic: receiver.profilePic,
          status: receiver.status,
        }
      });
    }

    // Emit to both sender and receiver (all their tabs)
    io.to(senderId).to(receiverId).emit("newMessage", message);

    res.status(201).json(message);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// GET USER PUBLIC KEY
exports.getPublicKey = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select("publicKey");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ publicKey: user.publicKey });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE MESSAGE (soft)
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id || req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    // Allow sender, receiver, or admin (if isAdmin flag exists on user)
    const isSender = message.senderId.toString() === userId.toString();
    const isReceiver = message.receiverId.toString() === userId.toString();
    if (!isSender && !isReceiver && !req.user.isAdmin) {
      return res.status(403).json({ message: "Not authorized to delete this message" });
    }

    message.deleted = true;
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


//  MARK MESSAGES AS READ   not in use right now
exports.markMessagesRead = async (req, res) => {
  try {
    const myId = req.user._id || req.user.id;
    const otherUserId = req.params.id;

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