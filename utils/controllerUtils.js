const Comment = require("../models/Comment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const ObjectId = require("mongoose").Types.ObjectId;
const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const linkify = require("linkifyjs");
require("linkifyjs/plugins/mention")(linkify);
const fs = require("fs");
const Followers = require("../models/Followers");
const Following = require("../models/Following");

const socketHandler = require("../handlers/socketHandler");

/**
 * Retrieves a post's comments with a specified offset
 * @function retrieveComments
 * @param {string} postId The id of the post to retrieve comments from
 * @param {number} offset The amount of comments to skip
 * @returns {array} Array of comments
 */
module.exports.retrieveComments = async (postId, offset, exclude = 0) => {
  try {
    const commentsAggregation = await Comment.aggregate([
      {
        $facet: {
          comments: [
            { $match: { post: ObjectId(postId) } },
            // Sort the newest comments to the top
            { $sort: { date: -1 } },
            // Skip the comments we do not want
            // This is desireable in the even that a comment has been created
            // and stored locally, we'd not want duplicate comments
            { $skip: Number(exclude) },
            // Re-sort the comments to an ascending order
            { $sort: { date: 1 } },
            { $skip: Number(offset) },
            { $limit: 10 },
            {
              $lookup: {
                from: "commentreplies",
                localField: "_id",
                foreignField: "parentComment",
                as: "commentReplies",
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
            { $unwind: "$commentVotes" },
            {
              $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "author",
              },
            },
            { $unwind: "$author" },
            {
              $addFields: {
                commentReplies: { $size: "$commentReplies" },
                commentVotes: "$commentVotes.votes",
              },
            },
            {
              $unset: [
                "author.password",
                "author.email",
                "author.private",
                "author.bio",
                "author.bookmarks",
              ],
            },
          ],
          commentCount: [
            {
              $match: { post: ObjectId(postId) },
            },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
      {
        $unwind: "$commentCount",
      },
      {
        $addFields: {
          commentCount: "$commentCount.count",
        },
      },
    ]);
    return commentsAggregation[0];
  } catch (err) {
    throw new Error(err);
  }
};

/**
 * Formats a cloudinary thumbnail url with a specified size
 * @function formatCloudinaryUrl
 * @param {string} url The url to format
 * @param {size} number Desired size of the image
 * @return {string} Formatted url
 */
module.exports.formatCloudinaryUrl = (url, size, thumb) => {

  if (!url)
    return null;
  const splitUrl = url.split("upload/");
  splitUrl[0] += `upload/${size.y && size.z ? `x_${size.x},y_${size.y},` : ""
    }w_${size.width},h_${size.height}${thumb && ",c_thumb"}/`;
  const formattedUrl = splitUrl[0] + splitUrl[1];
  //remove thumbnail image by returning the original image
  return url;
};

/**
 * Sends a notification when a user has commented on your post
 * @function sendCommentNotification
 * @param {object} req The request object
 * @param {object} sender User who triggered the notification
 * @param {string} receiver Id of the user to receive the notification
 * @param {string} image Image of the post that was commented on
 * @param {string} filter The filter applied to the image
 * @param {string} message The message sent by the user
 * @param {string} postId The id of the post that was commented on
 */
module.exports.sendCommentNotification = async (
  req,
  sender,
  receiver,
  image,
  filter,
  message,
  postId
) => {
  try {
    if (String(sender._id) !== String(receiver)) {
      const notification = new Notification({
        sender: sender._id,
        receiver,
        notificationType: "comment",
        date: Date.now(),
        notificationData: {
          postId,
          image,
          message,
          filter,
        },
      });
      await notification.save();
    }
  } catch (err) {
    throw new Error(err.message);
  }
};

/**
 * Sends a notification to the user when the user is mentioned
 * @function sendMentionNotification
 * @param {object} req The request object
 * @param {string} message The message sent by the user
 * @param {string} image Image of the post that was commented on
 * @param {object} post The post that was commented on
 * @param {object} user User who commented on the post
 */
module.exports.sendMentionNotification = (req, message, image, post, user) => {
  const mentionedUsers = new Set();
  // Looping through every mention and sending a notification when necessary
  linkify.find(message).forEach(async (item) => {
    // Making sure a mention notification is not sent to the sender or the poster
    if (
      item.type === "mention" &&
      item.value !== `@${user.username}` &&
      item.value !== `@${post.author.username}` &&
      // Making sure a mentioned user only gets one notification regardless
      // of how many times they are mentioned in one comment
      !mentionedUsers.has(item.value)
    ) {
      mentionedUsers.add(item.value);
      // Finding the receiving user's id
      const receiverDocument = await User.findOne({
        username: item.value.split("@")[1],
      });
      if (receiverDocument) {
        const notification = new Notification({
          sender: user._id,
          receiver: receiverDocument._id,
          notificationType: "mention",
          date: Date.now(),
          notificationData: {
            postId: post._id,
            image,
            message,
            filter: post.filter,
          },
        });
        await notification.save();
      }
    }
  });
};

/**
 * Generates a unique username based on the base username
 * @function generateUniqueUsername
 * @param {string} baseUsername The first part of the username to add a random number to
 * @returns {string} Unique username
 */
module.exports.generateUniqueUsername = async (baseUsername) => {
  let uniqueUsername = undefined;
  try {
    while (!uniqueUsername) {
      const username = baseUsername + Math.floor(Math.random(1000) * 9999 + 1);
      const user = await User.findOne({ username });
      if (!user) {
        uniqueUsername = username;
      }
    }
    return uniqueUsername;
  } catch (err) {
    throw new Error(err.message);
  }
};

module.exports.populatePostsPipeline = [
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
      from: "comments",
      localField: "_id",
      foreignField: "post",
      as: "comments",
    },
  },
  {
    $lookup: {
      from: "commentreplies",
      localField: "comments._id",
      foreignField: "parentComment",
      as: "commentReplies",
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
    $unwind: "$postVotes",
  },
  {
    $unwind: "$author",
  },
  {
    $addFields: {
      comments: { $size: "$comments" },
      commentReplies: { $size: "$commentReplies" },
      postVotes: { $size: "$postVotes.votes" },
    },
  },
  {
    $addFields: { comments: { $add: ["$comments", "$commentReplies"] } },
  },
  {
    $unset: [
      "commentReplies",
      "author.private",
      "author.confirmed",
      "author.githubId",
      "author.bookmarks",
      "author.password",
    ],
  },
];

/**
* Retrieves either who a specific user follows or who is following the user.
* Also retrieves whether the requesting user is following the returned users
* @function retrieveRelatedUsers
* @param {object} user The user object passed on from other middlewares
* @param {string} userId Id of the user to be used in the query
* @param {number} offset The offset for how many documents to skip
* @param {boolean} followers Whether to query who is following the user or who the user follows default is the latter
* @returns {array} Array of users
*/
module.exports.retrieveRelatedUsers = async (user, userId, offset, followers = true) => {
  const pipeline = [
    {
      $match: { user: ObjectId(userId) },
    },
    {
      $lookup: {
        from: "users",
        let: followers
          ? { userId: "$followers.user" }
          : { userId: "$following.user" },
        pipeline: [
          {
            $match: {
              // Using the $in operator instead of the $eq
              // operator because we can't coerce the types
              $expr: { $in: ["$_id", "$$userId"] },
            },
          },
          {
            $skip: Number(offset),
          },
          {
            $limit: 10,
          },
        ],
        as: "users",
      },
    },
    {
      $lookup: {
        from: "followers",
        localField: "users._id",
        foreignField: "user",
        as: "userFollowers",
      },
    },
    {
      $project: {
        "users._id": true,
        "users.username": true,
        "users.avatar": true,
        "users.fullName": true,
        userFollowers: true,
      },
    },
  ];

  const aggregation = followers
    ? await Followers.aggregate(pipeline)
    : await Following.aggregate(pipeline);

  // Make a set to store the IDs of the followed users
  const followedUsers = new Set();
  // Loop through every follower and add the id to the set if the user's id is in the array
  aggregation[0].userFollowers.forEach((followingUser) => {
    if (
      !!followingUser.followers.find(
        (follower) => String(follower.user) === String(user._id)
      )
    ) {
      followedUsers.add(String(followingUser.user));
    }
  });
  // Add the isFollowing key to the following object with a value
  // depending on the outcome of the loop above
  aggregation[0].users.forEach((followingUser) => {
    followingUser.isFollowing = followedUsers.has(String(followingUser._id));
  });

  return aggregation[0].users;
};