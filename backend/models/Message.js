const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      trim: true,
      default: "",
    },

    encryptedKeyForSender: {
      type: String,
      default: "",
    },

    encryptedKeyForReceiver: {
      type: String,
      default: "",
    },

    iv: { // initialisation vector -- Yeh ek random value hoti hai jo AES encryption ke start me use hoti hai
    //  taaki same plaintext encrypt hone par bhi har baar different ciphertext mile
      type: String,
      default: "",
    },

    image: {
      type: String, // Cloudinary URL
    },

    seen: {
      type: Boolean,
      default: false,
    },

    deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  }
);

module.exports = mongoose.model("Message", messageSchema);