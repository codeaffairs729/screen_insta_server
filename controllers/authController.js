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

module.exports.requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.status(401).send({ error: "Not authorized." });
  try {
    const user = await admin.auth().verifyIdToken(authorization);

    if (user.firebase.sign_in_provider === "password") {
      const tempUser = await admin.auth().getUserByEmail(user.email);
      console.log("email verified  " + tempUser.emailVerified);
      if (!tempUser.emailVerified) {
        return res
          .status(401)
          .send({ error: "Please verify your email address" });
      }
    }
    const connectedUser = await User.findOne({ uid: user.uid });
    res.locals.user = connectedUser;
    return next();
  } catch (err) {
    return res.status(401).send({ error: err });
  }
};

module.exports.requireAuthNoMailVerification = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.status(401).send({ error: "Not authorized." });
  try {
    const user = await admin.auth().verifyIdToken(token);
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
      const provider = response.firebase.sign_in_provider;
      const { uid, email } = response;
      let username = uid;
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
        if (provider === "password") {
          username = currentUser.displayName
            ? currentUser.displayName
            : username;
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
