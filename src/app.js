require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { errorHandler, notFound } = require("./middleware/errors");
const { authRouter } = require("./routes/auth.routes");
const { usersRouter } = require("./routes/users.routes");
const { propertiesRouter } = require("./routes/properties.routes");
const { profileRouter } = require("./routes/profile.routes");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120
  })
);

// Parse JSON string fields in form-data
app.use((req, res, next) => {
  if (req.body) {
    const jsonFields = ["location", "geo", "area", "price", "specs", "amenities"];
    jsonFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === "string") {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          // Keep as string if JSON parse fails
        }
      }
    });
  }
  next();
});

const uploadDir = process.env.UPLOAD_DIR || "uploads";
app.use("/uploads", express.static(path.resolve(process.cwd(), uploadDir)));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/users", usersRouter);
app.use("/api/properties", propertiesRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = { app };

