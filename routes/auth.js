const express = require("express");
const authRouter = express.Router();

const { loginAuthentication } = require("../controllers/authController");

authRouter.post("/login", loginAuthentication);

module.exports = authRouter;
