const cloudinary = require("cloudinary").v2;
const linkify = require("linkifyjs");
require("linkifyjs/plugins/hashtag")(linkify);
const Post = require("../models/Post");
const PostVote = require("../models/PostVote");
const Following = require("../models/Following");
const Followers = require("../models/Followers");
const Notification = require("../models/Notification");
const socketHandler = require("../handlers/socketHandler");
const fs = require("fs");
const ObjectId = require("mongoose").Types.ObjectId;
const constants = require("./../constants");
const paymentService = require("./../services/paymentService");
const Payment = require("../models/Payment");

const {
  retrieveComments,
  formatCloudinaryUrl,
  populatePostsPipeline,
} = require("../utils/controllerUtils");
const filters = require("../utils/filters");

module.exports.payPost = async (req, res, next) => {
  const user = res.locals.user;
  const { postId } = req.body;
  try {
    let post = await Post.findOne({ _id: postId });
    if (post && post.postPrice) {
      const result = paymentService.payPost(post._id, user._id);
      if (result) {
        return res.status(200).send(post.medias);
      } else {
        return res.status(500).end();
      }
    }
  } catch (err) {
    next(err);
  }
};

module.exports.createPost = async (req, res, next) => {
  const user = res.locals.user;
  const { caption, filter: filterName, postPrice } = req.body;
  let post = undefined;
  const filterObject = filters.find((filter) => filter.name === filterName);
  const hashtags = [];
  linkify.find(caption).forEach((result) => {
    if (result.type === "hashtag") {
      hashtags.push(result.value.substring(1));
    }
  });

  if (!req.files) {
    return res
      .status(400)
      .send({ error: "Please provide the image to upload." });
  }
  console.log("Found " + req.files.length + " files to upload");

  cloudinary.config({
    cloud_name: constants.CLOUDINARY_CLOUD_NAME,
    api_key: constants.CLOUDINARY_API_KEY,
    api_secret: constants.CLOUDINARY_API_SECRET,
  });

  try {
    let mediaUrls = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      let options = {};
      if (file.mimetype == "video/mp4") {
        options = { resource_type: "video" };
      }
      const response = await cloudinary.uploader.upload(file.path, options);
      const thumbnailUrl = formatCloudinaryUrl(
        response.secure_url,
        {
          width: 400,
          height: 400,
        },
        true
      );
      mediaUrls.push(response.secure_url);
      fs.unlinkSync(file.path);
    }

    post = new Post({
      medias: mediaUrls,
      caption,
      author: user._id,
      hashtags,
      postPrice,
    });
    const postVote = new PostVote({
      post: post._id,
    });
    await post.save();
    await postVote.save();
    res.status(201).send({
      ...post.toObject(),
      postVotes: [],
      comments: [],
      author: { avatar: user.avatar, username: user.username },
    });
  } catch (err) {
    next(err);
  }
};

module.exports.deletePost = async (req, res, next) => {
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    const post = await Post.findOne({ _id: postId, author: user._id });
    if (!post) {
      return res.status(404).send({
        error: "Could not find a post with that id associated with the user.",
      });
    }
    // This uses pre hooks to delete everything associated with this post i.e comments
    const postDelete = await Post.deleteOne({
      _id: postId,
    });
    if (!postDelete.deletedCount) {
      return res.status(500).send({ error: "Could not delete the post." });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }

  try {
    const followersDocument = await Followers.find({ user: user._id });
    const followers = followersDocument[0].followers;
  } catch (err) {
    console.log(err);
  }
};

module.exports.retrievePost = async (req, res, next) => {
  const user = res.locals.user;
  const { postId } = req.params;
  const requestingUser = res.locals.user;
  try {
    // Retrieve the post and the post's votes

    const post = await Post.aggregate([
      { $match: { _id: ObjectId(postId) } },
      {
        $lookup: {
          from: "postvotes",
          localField: "_id",
          foreignField: "post",
          as: "postVotes",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "author",
        },
      },
      { $unwind: "$author" },
      { $unwind: "$postVotes" },
      {
        $unset: ["author.password", "author.email", "author.bio"],
      },
      {
        $addFields: { postVotes: "$postVotes.votes" },
      },
    ]);
    if (post.length === 0) {
      return res
        .status(404)
        .send({ error: "Could not find a post with that id." });
    }
    let toReturnPost = null;

    if (post[0].author._id.toString() === user._id.toString()) {
      toReturnPost = { ...post[0] };
    } else {
      const toCheckPost = post[0];
      if (toCheckPost.author._id.toString() === requestingUser._id.toString()) {
        toCheckPost.display = true;
      } else {
        if (toCheckPost.postPrice > 0) {
          //fetch payments for post from this user;
          const payments = await Payment.find({
            user: requestingUser._id,
            post: toCheckPost._id,
          });
          if (payments.length > 0) {
            toCheckPost.display = true;
          } else {
            delete toCheckPost.medias;
            toCheckPost.display = false;
          }
        } else if (toCheckPost.postPrice == 0) {
          toCheckPost.display = true;
        } else {
          console.log("Could not determine if we should display post or not");
        }
      }
      toReturnPost = toCheckPost; 
    }

    // Retrieve the comments associated with the post aswell as the comment's replies and votes
    const comments = await retrieveComments(postId, 0);

    return res.send({ ...toReturnPost, commentData: comments });
  } catch (err) {
    next(err);
  }
};

module.exports.votePost = async (req, res, next) => {
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    // Update the vote array if the user has not already liked the post
    const postLikeUpdate = await PostVote.updateOne(
      { post: postId, "votes.author": { $ne: user._id } },
      {
        $push: { votes: { author: user._id } },
      }
    );
    if (!postLikeUpdate.nModified) {
      if (!postLikeUpdate.ok) {
        return res.status(500).send({ error: "Could not vote on the post." });
      }
      // Nothing was modified in the previous query meaning that the user has already liked the post
      // Remove the user's like
      const postDislikeUpdate = await PostVote.updateOne(
        { post: postId },
        { $pull: { votes: { author: user._id } } }
      );

      if (!postDislikeUpdate.nModified) {
        return res.status(500).send({ error: "Could not vote on the post." });
      }
    } else {
      // Sending a like notification
      const post = await Post.findById(postId);
      if (String(post.author) !== String(user._id)) {
        // Create thumbnail link
        const image = formatCloudinaryUrl(
          post.medias[0],
          {
            height: 50,
            width: 50,
          },
          true
        );
        const notification = new Notification({
          sender: user._id,
          receiver: post.author,
          notificationType: "like",
          date: Date.now(),
          notificationData: {
            postId,
            image,
            filter: post.filter,
          },
        });

        await notification.save();
      }
    }
    return res.send({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports.retrievePostFeed = async (req, res, next) => {
  const user = res.locals.user;
  const { offset } = req.params;

  try {
    const followingDocument = await Following.findOne({ user: user._id });
    if (!followingDocument) {
      return res.status(404).send({ error: "Could not find any posts." });
    }
    const following = followingDocument.following.map(
      (following) => following.user
    );

    // Fields to not include on the user object
    const unwantedUserFields = [
      "author.password",
      "author.private",
      "author.confirmed",
      "author.bookmarks",
      "author.email",
      "author.website",
      "author.bio",
      "author.githubId",
    ];

    const posts = await Post.aggregate([
      {
        $match: {
          $or: [{ author: { $in: following } }, { author: ObjectId(user._id) }],
        },
      },
      { $sort: { date: -1 } },
      { $skip: Number(offset) },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "author",
        },
      },
      {
        $lookup: {
          from: "postvotes",
          localField: "_id",
          foreignField: "post",
          as: "postVotes",
        },
      },
      {
        $lookup: {
          from: "comments",
          let: { postId: "$_id" },
          pipeline: [
            {
              // Finding comments related to the postId
              $match: {
                $expr: {
                  $eq: ["$post", "$$postId"],
                },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 3 },
            // Populating the author field
            {
              $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "author",
              },
            },
            {
              $lookup: {
                from: "commentvotes",
                localField: "_id",
                foreignField: "comment",
                as: "commentVotes",
              },
            },
            {
              $unwind: "$author",
            },
            {
              $unwind: {
                path: "$commentVotes",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unset: unwantedUserFields,
            },
            {
              $addFields: {
                commentVotes: "$commentVotes.votes",
              },
            },
          ],
          as: "comments",
        },
      },
      {
        $lookup: {
          from: "comments",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$post", "$$postId"],
                },
              },
            },
            {
              $group: { _id: null, count: { $sum: 1 } },
            },
            {
              $project: {
                _id: false,
              },
            },
          ],
          as: "commentCount",
        },
      },
      {
        $unwind: {
          path: "$commentCount",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: "$postVotes",
      },
      {
        $unwind: "$author",
      },
      {
        $addFields: {
          postVotes: "$postVotes.votes",
          commentData: {
            comments: "$comments",
            commentCount: "$commentCount.count",
          },
        },
      },
      {
        $unset: [...unwantedUserFields, "comments", "commentCount", "payments"],
      },
    ]);
    //check if post is paid
    let toReturnPosts = [];
    if (posts && posts.length > 0) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        if (post.author._id.toString() === user._id.toString()) {
          post.display = true;
          toReturnPosts.push(post);
        } else {
          if (post.postPrice > 0) {
            //fetch payments for post from this user;
            const payments = await Payment.find({
              user: user._id,
              post: post._id,
            });
            if (payments.length > 0) {
              post.display = true;
            } else {
              delete post.medias;
              post.display = false;
            }
            toReturnPosts.push(post);
          } else if (post.postPrice == 0) {
            post.display = true;
            toReturnPosts.push(post);
          } else {
            console.log("Could not determine if we should display post or not");
          }
        }
      }
    }
    return res.send(toReturnPosts);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveSuggestedPosts = async (req, res, next) => {
  const { offset = 0 } = req.params;

  try {
    const posts = await Post.aggregate([
      {
        $sort: { date: -1 },
      },
      {
        $skip: Number(offset),
      },
      {
        $limit: 20,
      },
      {
        $sample: { size: 20 },
      },
      ...populatePostsPipeline,
    ]);
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveHashtagPosts = async (req, res, next) => {
  const { hashtag, offset } = req.params;

  try {
    const posts = await Post.aggregate([
      {
        $facet: {
          posts: [
            {
              $match: { hashtags: hashtag },
            },
            {
              $skip: Number(offset),
            },
            {
              $limit: 20,
            },
            ...populatePostsPipeline,
          ],
          postCount: [
            {
              $match: { hashtags: hashtag },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
      {
        $unwind: "$postCount",
      },
      {
        $addFields: {
          postCount: "$postCount.count",
        },
      },
    ]);

    return res.send(posts[0]);
  } catch (err) {
    next(err);
  }
};
