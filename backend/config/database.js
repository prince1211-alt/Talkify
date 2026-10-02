const mongoose = require("mongoose");
require("dotenv").config();

// Blocks query-selector injection such as {"email": {"$gt": ""}} coming from request bodies.
// Code that intentionally uses operators on a field must wrap them in mongoose.trusted().
mongoose.set("sanitizeFilter", true);

exports.connect = () => {
    mongoose.connect(process.env.MONGODB_URL)
    .then(async () => {
        console.log("DB Connected Successfully");
        // Accounts used to have a unique "uniqueId" username. Drop its old index,
        // otherwise every new user (who has no uniqueId) would collide on null.
        await mongoose.connection.collection("users").dropIndex("uniqueId_1").catch(() => {});
    })
    .catch( (error) => {
        console.log("DB Connection Failed");
        console.error(error);
        process.exit(1);
    } )
};
