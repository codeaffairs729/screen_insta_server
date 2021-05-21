const express = require("express");
const userRouter = express.Router();
const multer = require("multer");

const {
  retrieveUser,
  retrievePosts,
  bookmarkPost,
  followUser,
  retrieveFollowing,
  retrieveFollowers,
  searchUsers,
  confirmUser,
  changeAvatar,
  changeCoverPicture,
  removeAvatar,
  removeCoverPicture,
  updateProfile,
  retrieveSuggestedUsers,
  upgradeUserAccount,
  getUserBookmarks,
} = require("../controllers/userController");
const {
  requireAuth,
  requireAuthNoMailVerification,
} = require("../controllers/authController");

userRouter.get("/bookmarks", requireAuth, getUserBookmarks);
userRouter.get("/suggested/:max?", requireAuth, retrieveSuggestedUsers);
userRouter.get("/:username", requireAuth, retrieveUser);
userRouter.get("/:username/posts/:offset", retrievePosts);
userRouter.get("/:userId/:offset/following", requireAuth, retrieveFollowing);
userRouter.get("/:userId/:offset/followers", requireAuth, retrieveFollowers);
userRouter.get("/:username/:offset/search", searchUsers);

userRouter.put("/confirm", requireAuth, confirmUser);
userRouter.put(
  "/avatar",
  requireAuthNoMailVerification,
  multer({
    dest: "temp/",
    limits: { fileSize: 12000000 },
  }).single("image"),
  changeAvatar
);

userRouter.put(
  "/coverPicture",
  requireAuth,
  multer({
    dest: "temp/",
    limits: { fileSize: 12000000 },
  }).single("image"),
  changeCoverPicture
);

userRouter.put("/", requireAuth, updateProfile);

userRouter.delete("/avatar", requireAuth, removeAvatar);
userRouter.delete("/coverPicture", requireAuth, removeCoverPicture);

userRouter.post("/:postId/bookmark", requireAuth, bookmarkPost);
userRouter.post("/:userId/follow", requireAuth, followUser);

userRouter.post("/upgrade", requireAuth, upgradeUserAccount);

module.exports = userRouter;
