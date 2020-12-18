const express = require("express");
const authRouter = express.Router();

const {
  loginAuthentication,
  requireAuth,
  changePassword,
} = require("../controllers/authController");

authRouter.post("/login", loginAuthentication);

authRouter.put("/password", requireAuth, changePassword);

module.exports = authRouter;
