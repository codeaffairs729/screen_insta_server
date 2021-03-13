const { post } = require("../routes/post");
const Payment = require("./../models/Payment");

module.exports.checkPostPayment = async (postId, userId) => {
  const payment = await Payment.findOne({
    post: postId,
    user: userId,
    postType: "POST",
  });
  if (payment) {
    return true;
  }
  return false;
};

module.exports.payPost = async (postId, userId) => {
  const payment = new Payment({
    post: postId,
    user: userId,
    postType: "POST",
    paymentIdentifier: "TEST_PAYMENT",
  });
  try {
    await payment.save();
    return true;
  } catch (err) {
    return false;
  }
};

module.exports.paySubscription = async (userId, creatorId) => {
  const payment = new Payment({
    profile: creatorId,
    user: userId,
    paymentIdentifier: "TEST_SUBSCRIPTION",
  });
  try {
    await payment.save();
    return true;
  } catch (err) {
    return false;
  }
};
