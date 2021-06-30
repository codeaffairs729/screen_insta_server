const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  messageId: String,
  message: String,
  sender: String,
  conversationId: String,
});

const messageModel = mongoose.model("Message", MessageSchema);
module.exports = messageModel;
