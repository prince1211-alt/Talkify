const mongoose = require("mongoose");
require("dotenv").config();

const Message = require("./models/Message");
const GroupMessage = require("./models/GroupMessage");

const clearMessages = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const msgRes = await Message.deleteMany({});
        const groupMsgRes = await GroupMessage.deleteMany({});
        const User = require("./models/User");
        const userRes = await User.deleteMany({ publicKey: { $exists: false } });
        const userRes2 = await User.deleteMany({ publicKey: "" });
        process.exit(0);
    } catch (error) {
        console.error("Error clearing DB:", error);
        process.exit(1);
    }
};

clearMessages();
