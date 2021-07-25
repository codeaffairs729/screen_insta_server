const User = require("../models/User");
const { retrieveRelatedUsers } = require("../utils/controllerUtils");

module.exports.getConversations = async (req, res, next) => {
  const { offset = 0 } = req.query;
  const user = res.locals.user;
  try {
    //get conversations where user.username is in participants
    //if length < offset : fetch more users without creating conversation

    /*
     * Should return:
     * {conversations: [], users: []}
     */
    const users = await retrieveRelatedUsers(user, user.id, offset, true);
    let conversations = {
      conversations: [
        {
          id: "123",
          participants: ["1", "2"],
        },
      ],
      users
    };
    return res.send(conversations);
  } catch (err) {
    next(err);
  }
};

module.exports.postConversation = async (req, res, next) => {
  const user = res.locals.user;
  try {

  } catch (err) {
    next(err);
  }
};

module.exports.postSendMessage = async (req, res, next) => {
  const user = res.locals.user;
  try {

  } catch (err) {
    next(err);
  }
};
module.exports.addMessageToConversation = async (req, res, next) => {
  //const requestingUser = req.locals.user;
  const message = req.body;

  console.log("received message" + JSON.stringify(message));
  return res.status(200).end();
};
