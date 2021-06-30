const express = require("express");
const chatRouter = express.Router();

const { getConversations } = require("../controllers/chatController");

chatRouter.get("/conversations", getConversations);

module.exports = chatRouter;
