const express = require('express');
const postRouter = express.Router();
const multer = require('multer');
const upload = multer({
  dest: "temp/",
  limits: { fileSize: 10 * 1024 * 1024 },
}).array("medias", 10);
const rateLimit = require('express-rate-limit');

const { requireAuth } = require('../controllers/authController');
const {
  createPost,
  retrievePost,
  votePost,
  deletePost,
  retrievePostFeed,
  retrieveSuggestedPosts,
  retrieveHashtagPosts,
  payPost,
  reportPost,
} = require("../controllers/postController");
const filters = require('../utils/filters');

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

postRouter.post('/', postLimiter, requireAuth, upload, createPost);
postRouter.post('/:postId/vote', requireAuth, votePost);
postRouter.post("/pay", requireAuth, payPost);
postRouter.get('/suggested/:offset', requireAuth, retrieveSuggestedPosts);
postRouter.get('/filters', (req, res) => {
  res.send({ filters });
});
postRouter.get("/:postId", requireAuth, retrievePost);
postRouter.get('/feed/:offset', requireAuth, retrievePostFeed);
postRouter.get('/hashtag/:hashtag/:offset', requireAuth, retrieveHashtagPosts);

postRouter.delete('/:postId', requireAuth, deletePost);
postRouter.get("/report/:postId", requireAuth, reportPost);

module.exports = postRouter;
