const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const mongoose = require("mongoose");
const compression = require("compression");
const path = require("path");
const jwt = require("jwt-simple");
const constants = require("./constants");
const apiRouter = require("./routes");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 9000;

if (process.env.NODE_ENV !== "production") {
  const morgan = require("morgan");
  app.use(morgan("dev"));
  require("dotenv").config();
}

app.use(helmet());
app.use(helmet.hidePoweredBy());
app.use(cors());
app.use(bodyParser.json());
app.set("trust proxy", 1);
app.use("/api", apiRouter);

if (process.env.NODE_ENV === "production") {
  app.use(compression());
  app.use(express.static(path.join(__dirname, "client/build")));

  app.get("*", function (req, res) {
    res.sendFile(path.join(__dirname, "client/build", "index.html"));
  });
}

(async function () {
  let mongo_uri = constants.MONGO_DEV_URI;
  if (process.env.NODE_ENV == "production") {
    mongo_uri = constants.MONGO_URI;
  } else {
    console.log("Connecting to dev mong URI");
  }
  try {
    await mongoose.connect(mongo_uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });
    console.log("Connected to database");
  } catch (err) {
    throw new Error(err);
  }
})();

app.use((err, req, res, next) => {
  console.log(err.message);
  if (!err.statusCode) {
    err.statusCode = 500;
  }
  if (err.name === "MulterError") {
    if (err.message === "File too large") {
      return res
        .status(400)
        .send({ error: "Your file exceeds the limit of 10MB." });
    }
  }
  res.status(err.statusCode).send({
    error:
      err.statusCode >= 500
        ? "An unexpected error ocurred, please try again later."
        : err.message,
  });
});

const expressServer = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
