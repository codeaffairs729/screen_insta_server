const User = require("../models/User");
const Post = require("../models/Post");
const Followers = require("../models/Followers");
const Following = require("../models/Following");
const ConfirmationToken = require("../models/ConfirmationToken");
const Notification = require("../models/Notification");
const ObjectId = require("mongoose").Types.ObjectId;
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const crypto = require("crypto");
const constants = require("./../constants");
const paymentService = require("./../services/paymentService");
const { retrieveRelatedUsers } = require("../utils/controllerUtils");
const {
  validateEmail,
  validateFullName,
  validateUsername,
  validateBio,
  validateWebsite,
} = require("../utils/validation");
const { post } = require("../routes/post");
const Payment = require("../models/Payment");

module.exports.retrieveUser = async (req, res, next) => {
  const { username } = req.params;
  const requestingUser = res.locals.user;
  try {
    const user = await User.findOne(
      { username },
      "username fullName uid avatar bio bookmarks fullName _id website coverPicture isCreator followPrice"
    );
    if (!user) {
      return res
        .status(404)
        .send({ error: "Could not find a user with that username." });
    }

    //TODO check if requesting user is following this username, if not return empty page
    const posts = await Post.aggregate([
      {
        $facet: {
          data: [
            { $match: { author: ObjectId(user._id) } },
            { $sort: { date: -1 } },
            { $limit: 12 },
            {
              $lookup: {
                from: "postvotes",
                localField: "_id",
                foreignField: "post",
                as: "postvotes",
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
              $unwind: "$postvotes",
            },
            {
              $addFields: { image: "$thumbnail" },
            },
            {
              $project: {
                user: true,
                followers: true,
                following: true,
                comments: {
                  $sum: [{ $size: "$comments" }, { $size: "$commentReplies" }],
                },
                medias: true,
                caption: true,
                postPrice: true,
                author: true,
                postVotes: { $size: "$postvotes.votes" },
              },
            },
          ],
          postCount: [
            { $match: { author: ObjectId(user._id) } },
            { $count: "postCount" },
          ],
        },
      },
      { $unwind: "$postCount" },
      {
        $project: {
          data: true,
          postCount: "$postCount.postCount",
        },
      },
    ]);

    const followersDocument = await Followers.findOne({
      user: ObjectId(user._id),
    });


    let isFollowing = false;
    for (let i = 0; i < followersDocument.followers.length; i++) {
      let follower = followersDocument.followers[i];
      if (follower.user._id.toString() == requestingUser._id.toString()) {
        isFollowing = true;
      }
    }
    if (!isFollowing && user._id.toString() != requestingUser._id.toString()) {
      //the user is not following
      if (posts[0] && posts[0].data) posts[0].data = [];
    }


    const followingDocument = await Following.findOne({
      user: ObjectId(user._id),
    });

    let toReturnPosts = [];
    if (posts[0] && posts[0].data.length > 0) {
      for (let i = 0; i < posts[0].data.length; i++) {
        const post = posts[0].data[i];
        if (post.author._id.toString() === requestingUser._id.toString()) {
          post.display = true;
          toReturnPosts.push(post);
        } else {
          if (post.postPrice && post.postPrice > 0) {
            //fetch payments for post from this user;
            const payments = await Payment.find({
              user: requestingUser._id,
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
      posts[0].data = toReturnPosts;
    }
    return res.send({
      user,
      followers: followersDocument.followers.length,
      following: followingDocument.following.length,
      // Check if the requesting user follows the retrieved user
      isFollowing: requestingUser
        ? !!followersDocument.followers.find(
            (follower) => String(follower.user) === String(requestingUser._id)
          )
        : false,
      posts: posts[0],
    });
  } catch (err) {
    next(err);
  }
};

module.exports.retrievePosts = async (req, res, next) => {
  // Retrieve a user's posts with the post's comments & likes
  const { username, offset = 0 } = req.params;
  try {
    const posts = await Post.aggregate([
      { $sort: { date: -1 } },
      { $skip: Number(offset) },
      { $limit: 12 },
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "user",
        },
      },
      { $match: { "user.username": username } },
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
          from: "postvotes",
          localField: "_id",
          foreignField: "post",
          as: "postVotes",
        },
      },
      { $unwind: "$postVotes" },
      {
        $project: {
          image: true,
          caption: true,
          date: true,
          "user.username": true,
          "user.avatar": true,
          comments: { $size: "$comments" },
          postVotes: { $size: "$postVotes.votes" },
        },
      },
    ]);
    if (posts.length === 0) {
      return res.status(404).send({ error: "Could not find any posts." });
    }
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};

module.exports.bookmarkPost = async (req, res, next) => {
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    const post = await Post.findById(postId);
    if (!post) {
      return res
        .status(404)
        .send({ error: "Could not find a post with that id." });
    }

    const userBookmarkUpdate = await User.updateOne(
      {
        _id: user._id,
        "bookmarks.post": { $ne: postId },
      },
      { $push: { bookmarks: { post: postId } } }
    );
    if (!userBookmarkUpdate.nModified) {
      if (!userBookmarkUpdate.ok) {
        return res.status(500).send({ error: "Could not bookmark the post." });
      }
      // The above query did not modify anything meaning that the user has already bookmarked the post
      // Remove the bookmark instead
      const userRemoveBookmarkUpdate = await User.updateOne(
        { _id: user._id },
        { $pull: { bookmarks: { post: postId } } }
      );
      if (!userRemoveBookmarkUpdate.nModified) {
        return res.status(500).send({ error: "Could not bookmark the post." });
      }
      return res.send({ success: true, operation: "remove" });
    }
    return res.send({ success: true, operation: "add" });
  } catch (err) {
    next(err);
  }
};

module.exports.followUser = async (req, res, next) => {
  const { userId } = req.params;
  const user = res.locals.user;

  try {
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res
        .status(400)
        .send({ error: "Could not find a user with that id." });
    }

    const followerUpdate = await Followers.updateOne(
      { user: userId, "followers.user": { $ne: user._id } },
      { $push: { followers: { user: user._id } } }
    );

    const followingUpdate = await Following.updateOne(
      { user: user._id, "following.user": { $ne: userId } },
      { $push: { following: { user: userId } } }
    );

    if (userToFollow.followPrice > 0) {
      const paid = await paymentService.paySubscription(
        user._id,
        userToFollow._id
      );
      if (!paid) {
        return res
          .status(500)
          .send({ error: "An error occurred with the subscription payment" });
      }
    }

    if (!followerUpdate.nModified || !followingUpdate.nModified) {
      if (!followerUpdate.ok || !followingUpdate.ok) {
        return res
          .status(500)
          .send({ error: "Could not follow user please try again later." });
      }
      // Nothing was modified in the above query meaning that the user is already following
      // Unfollow instead
      const followerUnfollowUpdate = await Followers.updateOne(
        {
          user: userId,
        },
        { $pull: { followers: { user: user._id } } }
      );

      const followingUnfollowUpdate = await Following.updateOne(
        { user: user._id },
        { $pull: { following: { user: userId } } }
      );
      if (!followerUnfollowUpdate.ok || !followingUnfollowUpdate.ok) {
        return res
          .status(500)
          .send({ error: "Could not follow user please try again later." });
      }
      return res.send({ success: true, operation: "unfollow" });
    }

    const notification = new Notification({
      notificationType: "follow",
      sender: user._id,
      receiver: userId,
      date: Date.now(),
    });

    const sender = await User.findById(user._id, "username avatar");
    const isFollowing = await Following.findOne({
      user: userId,
      "following.user": user._id,
    });

    await notification.save();

    res.send({ success: true, operation: "follow" });
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveFollowing = async (req, res, next) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;
  try {
    const users = await retrieveRelatedUsers(user, userId, offset);
    return res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveFollowers = async (req, res, next) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;

  try {
    const users = await retrieveRelatedUsers(user, userId, offset, true);
    return res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.searchUsers = async (req, res, next) => {
  const { username, offset = 0 } = req.params;
  if (!username) {
    return res
      .status(400)
      .send({ error: "Please provide a user to search for." });
  }

  try {
    const users = await User.aggregate([
      {
        $match: {
          username: { $regex: new RegExp(username), $options: "i" },
        },
      },
      {
        $lookup: {
          from: "followers",
          localField: "_id",
          foreignField: "user",
          as: "followers",
        },
      },
      {
        $unwind: "$followers",
      },
      {
        $addFields: {
          followersCount: { $size: "$followers.followers" },
        },
      },
      {
        $sort: { followersCount: -1 },
      },
      {
        $skip: Number(offset),
      },
      {
        $limit: 10,
      },
      {
        $project: {
          _id: true,
          username: true,
          avatar: true,
          fullName: true,
        },
      },
    ]);
    if (users.length === 0) {
      return res
        .status(404)
        .send({ error: "Could not find any users matching the criteria." });
    }
    return res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.confirmUser = async (req, res, next) => {
  const { token } = req.body;
  const user = res.locals.user;

  try {
    const confirmationToken = await ConfirmationToken.findOne({
      token,
      user: user._id,
    });
    if (!confirmationToken) {
      return res
        .status(404)
        .send({ error: "Invalid or expired confirmation link." });
    }
    await ConfirmationToken.deleteOne({ token, user: user._id });
    await User.updateOne({ _id: user._id }, { confirmed: true });
    return res.send();
  } catch (err) {
    next(err);
  }
};

module.exports.changeAvatar = async (req, res, next) => {
  const user = res.locals.user;
  if (!req.file) {
    return res
      .status(400)
      .send({ error: "Please provide the image to upload." });
  }

  cloudinary.config({
    cloud_name: constants.CLOUDINARY_CLOUD_NAME,
    api_key: constants.CLOUDINARY_API_KEY,
    api_secret: constants.CLOUDINARY_API_SECRET,
  });

  try {
    const response = await cloudinary.uploader.upload(req.file.path, {
      gravity: "face",
      crop: "thumb",
    });
    fs.unlinkSync(req.file.path);

    const avatarUpdate = await User.updateOne(
      { _id: user._id },
      { avatar: response.secure_url }
    );

    if (!avatarUpdate.nModified) {
      throw new Error("Could not update user avatar.");
    }

    return res.send({ avatar: response.secure_url });
  } catch (err) {
    console.log("could not upload picture");
    console.log(err);
    next(err);
  }
};

module.exports.changeCoverPicture = async (req, res, next) => {
  const user = res.locals.user;

  if (!req.file) {
    return res
      .status(400)
      .send({ error: "Please provide the image to upload." });
  }

  cloudinary.config({
    cloud_name: constants.CLOUDINARY_CLOUD_NAME,
    api_key: constants.CLOUDINARY_API_KEY,
    api_secret: constants.CLOUDINARY_API_SECRET,
  });

  try {
    const response = await cloudinary.uploader.upload(req.file.path, {});
    fs.unlinkSync(req.file.path);

    const coverPictureUpdate = await User.updateOne(
      { _id: user._id },
      { coverPicture: response.secure_url }
    );

    if (!coverPictureUpdate.nModified) {
      throw new Error("Could not update Cover Picture.");
    }

    return res.send({ coverPicture: response.secure_url });
  } catch (err) {
    next(err);
  }
};

module.exports.removeAvatar = async (req, res, next) => {
  const user = res.locals.user;

  try {
    const avatarUpdate = await User.updateOne(
      { _id: user._id },
      { $unset: { avatar: "" } }
    );
    if (!avatarUpdate.nModified) {
      next(err);
    }
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports.removeCoverPicture = async (req, res, next) => {
  const user = res.locals.user;

  try {
    const coverPictureUpdate = await User.updateOne(
      { _id: user._id },
      { $unset: { coverPicture: "" } }
    );
    if (!coverPictureUpdate.nModified) {
      next(err);
    }
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports.getUserBookmarks = async (req, res, next) => {
  const user = res.locals.user;
  if (!user.bookmarks || user.bookmarks.length == 0) {
    return res.send([]);
  }
  const { offset } = req.params;

  try {
    const followingDocument = await Following.findOne({ user: user._id });
    if (!followingDocument) {
      return res.status(404).send({ error: "Could not find any posts." });
    }
    const bookmarkedPosts = user.bookmarks.map((bookmark) => bookmark.post);
    console.log(bookmarkedPosts);

    // Fields to not include on the user object
    const unwantedUserFields = [
      "author.password",
      "author.private",
      "author.confirmed",
      "author.bookmarks",
      "author.email",
      "author.website",
      "author.bio",
    ];

    const posts = await Post.aggregate([
      {
        $match: {
          $or: [{ _id: { $in: bookmarkedPosts } }],
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

module.exports.updateProfile = async (req, res, next) => {
  const user = res.locals.user;
  console.log("updating current user with values: ");

  console.log(req.body);
  const { fullName, username, website, bio, email, acceptedTerms } = req.body;
  let confirmationToken = undefined;
  let updatedFields = {};
  try {
    const userDocument = await User.findOne({ _id: user._id });

    if (fullName !== undefined) {
      const fullNameError = validateFullName(fullName);
      if (fullNameError) return res.status(400).send({ error: fullNameError });
      userDocument.fullName = fullName;
      updatedFields.fullName = fullName;
    }

    if (username) {
      const usernameError = validateUsername(username);
      if (usernameError) return res.status(400).send({ error: usernameError });
      // Make sure the username to update to is not the current one
      if (username !== user.username) {
        const existingUser = await User.findOne({ username });
        if (existingUser)
          return res.status(400).send({
            error: "This username is already taken, please choose another one.",
          });
        userDocument.username = username;
        updatedFields.username = username;
      }
    }

    if (website !== undefined) {
      let websiteValue = website.toLowerCase();
      const websiteError = validateWebsite(websiteValue);
      if (websiteError) return res.status(400).send({ error: websiteError });
      if (
        !websiteValue.includes("http://") &&
        !websiteValue.includes("https://") &&
        websiteValue !== ""
      ) {
        userDocument.website = "https://" + websiteValue;
        updatedFields.website = "https://" + websiteValue;
      } else {
        userDocument.website = websiteValue;
        updatedFields.website = websiteValue;
      }
    }

    if (bio !== undefined) {
      const bioError = validateBio(bio);
      if (bioError) return res.status(400).send({ error: bioError });
      userDocument.bio = bio;
      updatedFields.bio = bio;
    }

    if (email) {
      const emailError = validateEmail(email);
      if (emailError) return res.status(400).send({ error: emailError });
      // Make sure the email to update to is not the current one
      if (email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser)
          return res.status(400).send({
            error:
              "This email is already registered, please choose another one.",
          });
        confirmationToken = new ConfirmationToken({
          user: user._id,
          token: crypto.randomBytes(20).toString("hex"),
        });
        await confirmationToken.save();
        userDocument.email = email;
        userDocument.confirmed = false;
        updatedFields = { ...updatedFields, email, confirmed: false };
      }
    }
    if (acceptedTerms === true) {
      userDocument.acceptedTerms = true;
    }
    const updatedUser = await userDocument.save();
    res.send(updatedFields);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveSuggestedUsers = async (req, res, next) => {
  const { max } = req.params;
  const user = res.locals.user;
  try {
    const users = await User.aggregate([
      {
        $match: { _id: { $ne: ObjectId(user._id) } },
      },
      {
        $lookup: {
          from: "followers",
          localField: "_id",
          foreignField: "user",
          as: "followers",
        },
      },
      {
        $lookup: {
          from: "posts",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$author", "$$userId"],
                },
              },
            },
            {
              $sort: { date: -1 },
            },
            {
              $limit: 3,
            },
          ],
          as: "posts",
        },
      },
      {
        $unwind: "$followers",
      },
      {
        $project: {
          username: true,
          fullName: true,
          email: true,
          followPrice: true,
          avatar: true,
          isFollowing: { $in: [user._id, "$followers.followers.user"] },
          posts: true,
        },
      },
      {
        $match: { isFollowing: false },
      },
      {
        $sample: { size: max ? Number(max) : 20 },
      },
      {
        $sort: { posts: -1 },
      },
      {
        $unset: ["isFollowing"],
      },
    ]);
    res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.upgradeUserAccount = async (req, res, next) => {
  const user = res.locals.user;
  console.log("upgrading current user");
  console.log(req.body);
  const {
    followPrice,
    country,
    referrerUserHandle,
    bankInformation,
    audioCallPrice,
    videoCallPrice,
    blockedCountries,
  } = req.body;
  try {
    const userDocument = await User.findOne({ _id: user._id });
    userDocument.isCreator = true;
    if (followPrice != null) {
      userDocument.followPrice = followPrice;
    }
    if (country) {
      userDocument.country = country;
    }
    if (referrerUserHandle) {
      userDocument.referrer = referrerUserHandle;
    }
    if (bankInformation) {
      userDocument.bankInformation = bankInformation;
    }
    if (audioCallPrice != null) {
      userDocument.audioCallPrice = audioCallPrice;
    }
    if (videoCallPrice != null) {
      userDocument.videoCallPrice = videoCallPrice;
    }
    if (blockedCountries) {
      userDocument.blockedCountries = blockedCountries;
    }
    const updatedUser = await userDocument.save();
    res.status(200).send(updatedUser);
  } catch (err) {
    next(err);
  }
};

module.exports.sendTipToUser = async (req, res, next) => {
  const user = res.locals.user;
  console.log("sending tip to user");
  console.log(req.body);
  const { tipAmount, userId } = req.body;
  try {
    const userDocument = await User.findOne({ _id: user._id });
    const destinationUser = await User.findOne({ _id: userId });

    res.status(200).send({});
  } catch (err) {
    next(err);
  }
};
