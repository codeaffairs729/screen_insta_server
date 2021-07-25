const express = require("express");
const chatRouter = express.Router();
const { requireAuth } = require("../controllers/authController");
const { getConversations, postSendMessage, postConversation } = require("../controllers/chatController");


chatRouter.get("/conversations", requireAuth, getConversations);

chatRouter.post("/createconversation", requireAuth, postConversation);
chatRouter.post("/sendmessage", requireAuth, postSendMessage);

chatRouter.post("/newMessage", addMessageToConversation);

module.exports = chatRouter;
