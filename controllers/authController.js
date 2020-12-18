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
      console.log("verifying user from firebase");
      const user = await admin.auth().verifyIdToken(token);
      console.log(user);
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
    // Allow other middlewares to access the authenticated user details.
    res.locals.user = user;
    return next();
  } catch (err) {
    return res.status(401).send({ error: err });
  }
};

module.exports.optionalAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (authorization) {
    try {
      const user = await this.verifyJwt(authorization);
      // Allow other middlewares to access the authenticated user details.
      res.locals.user = user;
    } catch (err) {
      return res.status(401).send({ error: err });
    }
  }
  return next();
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
      const username = currentUser.displayName;
      console.log("User authenticated: " + uid + " : " + email);
      let user = await User.findOne(
        { uid: uid },
        "email username avatar bookmarks bio fullName confirmed website"
      );
      if (user) {
        return res.send(user);
      } else {
        let user = await User.findOne(
          { $or: [{ email: email }, { username: username }] },
          "email uid username"
        );
        console.log("finding user by email result: ");
        console.log(user);
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

module.exports.changePassword = async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const user = res.locals.user;
  let currentPassword = undefined;

  try {
    const userDocument = await User.findById(user._id);
    currentPassword = userDocument.password;

    const result = await bcrypt.compare(oldPassword, currentPassword);
    if (!result) {
      return res.status("401").send({
        error: "Your old password was entered incorrectly, please try again.",
      });
    }

    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError)
      return res.status(400).send({ error: newPasswordError });

    userDocument.password = newPassword;
    await userDocument.save();
    return res.send();
  } catch (err) {
    return next(err);
  }
};
