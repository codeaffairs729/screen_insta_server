const jwt = require("jwt-simple");
const crypto = require("crypto");
const User = require("../models/User");
const ConfirmationToken = require("../models/ConfirmationToken");
const bcrypt = require("bcrypt");
const axios = require("axios");

const { generateUniqueUsername } = require("../utils/controllerUtils");
const {
  validateEmail,
  validateFullName,
  validateUsername,
  validatePassword,
} = require("../utils/validation");

var admin = require("firebase-admin");

var serviceAccount = require("../betweenus-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://betweenus-3296e.firebaseio.com",
});

module.exports.verifyJwt = (token) => {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await admin.auth().verifyIdToken(token);
      const provider = user.firebase.sign_in_provider;
      resolve(user);
    } catch (err) {
      return reject("Not authorized.");
    }
  });
};

module.exports.requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.status(401).send({ error: "Not authorized." });
  try {
    const user = await this.verifyJwt(authorization);
    const connectedUser = await User.findOne({ uid: user.uid });
    res.locals.user = connectedUser;
    return next();
  } catch (err) {
    return res.status(401).send({ error: err });
  }
};

module.exports.loginAuthentication = async (req, res, next) => {
  const { authorization } = req.headers;
  if (authorization) {
    try {
      const response = await admin.auth().verifyIdToken(authorization);
      const currentUser = await admin.auth().getUser(response.uid);
      if (!response.email_verified) {
        console.log("User email is not verified");
      }
      const { uid, email } = response;
      const username = uid;
      let user = await User.findOne({ uid: uid });
      if (user) {
        return res.send(user);
      } else {
        let user = await User.findOne(
          { $or: [{ email: email }, { username: username }] },
          "email uid username"
        );
        if (user) {
          return res
            .status(400)
            .send({ error: "Email/username already exists" });
        }
        user = new User({ uid, email, username });
        user = await user.save();
        res.send(user);
      }
    } catch (err) {
      console.log(err);
      return res
        .status(401)
        .send({ error: "Error occured while registering the user" });
    }
  } else {
    return res.status(401).send("Unauthorized");
  }
};
