const mongoose = require("mongoose");
require("dotenv").config();

// Blocks query-selector injection such as {"email": {"$gt": ""}} coming from request bodies.
// Code that intentionally uses operators on a field must wrap them in mongoose.trusted().
mongoose.set("sanitizeFilter", true);

exports.connect = () => {
    mongoose.connect(process.env.MONGODB_URL)
    .then(() => console.log("DB Connected Successfully"))
    .catch( (error) => {
        console.log("DB Connection Failed");
        console.error(error);
        process.exit(1);
    } )
};
