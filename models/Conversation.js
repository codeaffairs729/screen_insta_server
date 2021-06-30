const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ConversationSchema = new Schema({
  conversationId: String,
  participants: Array,
});

const conversationModel = mongoose.model("Conversation", ConversationSchema);
module.exports = conversationModel;
