const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },

    uniqueId: {
      type: String,
      required: true,
      unique: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6
    },

    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline"
    },

    profilePic: {
      type: String,
      default: ""
    },

    publicKey: {
      type: String,
      default: ""
    },

    encryptedPrivateKey: {
      type: String,
      default: ""
    },

    contacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);