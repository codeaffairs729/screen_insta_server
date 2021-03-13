const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  user: {
    type: Schema.ObjectId,
    ref: "User",
  },
  paymentIdentifier: {
    type: String,
    required: true,
  },
  paymentType: {
    type: String,
  },
  post: {
    type: Schema.ObjectId,
    ref: "Post",
  },
  profile: {
    type: Schema.ObjectId,
    ref: "User",
  },
});

const paymentModel = mongoose.model("Payment", PaymentSchema);
module.exports = paymentModel;
