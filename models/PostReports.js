const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PostReportSchema = new Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  user: {
    type: Schema.ObjectId,
    ref: "User",
  },
  post: {
    type: Schema.ObjectId,
    ref: "Post",
  },
});

const postReportsModel = mongoose.model("PostReports", PostReportSchema);
module.exports = postReportsModel;
