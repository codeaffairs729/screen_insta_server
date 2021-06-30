const User = require("../models/User");

module.exports.getConversations = async (req, res, next) => {
  const requestingUser = res.locals.user;
  try {
    //get conversations where user.username is in participants
    //if length < offset : fetch more users without creating conversation

    /*
     * Should return:
     * {conversations: [], users: []}
     */
    let conversations = {
      conversations: [
        {
          id: "123",
          participants: ["1", "2"],
        },
      ],
      users: [
        {
          name: "creator_user",
          username: "creator_user",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "akram",
          username: "akram",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Said",
          username: "Said",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Pierre",
          username: "Pierre",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Anas",
          username: "Anas",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Mehdi",
          username: "Mehdi",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Hassan",
          username: "Hassan",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Simo",
          username: "Simo",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
        {
          name: "Bachir",
          username: "Bachir",
          avatar:
            "https://image.freepik.com/vecteurs-libre/homme-affaires-caractere-avatar-isole_24877-60111.jpg",
        },
      ],
    };
    return res.send(conversations);
  } catch (err) {
    next(err);
  }
};
