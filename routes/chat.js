const express = require("express");
const chatRouter = express.Router();

const {
  getConversations,
  addMessageToConversation,
} = require("../controllers/chatController");

chatRouter.get("/conversations", getConversations);
chatRouter.post("/newMessage", addMessageToConversation);

module.exports = chatRouter;
