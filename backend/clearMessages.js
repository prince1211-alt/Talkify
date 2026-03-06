const mongoose = require("mongoose");
require("dotenv").config();

const Message = require("./models/Message");
const GroupMessage = require("./models/GroupMessage");

const clearMessages = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected to MongoDB");

        const msgRes = await Message.deleteMany({});
        console.log(`Deleted ${msgRes.deletedCount} 1-on-1 messages`);

        const groupMsgRes = await GroupMessage.deleteMany({});
        console.log(`Deleted ${groupMsgRes.deletedCount} group messages`);

        // Let's also drop users without a publicKey since they can't log in safely to encrypted chat
        const User = require("./models/User");
        const userRes = await User.deleteMany({ publicKey: { $exists: false } });
        const userRes2 = await User.deleteMany({ publicKey: "" });
        console.log(`Deleted ${userRes.deletedCount + userRes2.deletedCount} users with no keys`);

        console.log("Cleanup complete!");
        process.exit(0);
    } catch (error) {
        console.error("Error clearing DB:", error);
        process.exit(1);
    }
};

clearMessages();
