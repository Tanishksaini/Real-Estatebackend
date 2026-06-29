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

// Parse JSON string fields in form-data (MUST be before routes and validation)
app.use((req, res, next) => {
  if (req.body) {
    const jsonFields = ["location", "geo", "area", "price", "specs"];
    const arrayFields = ["amenities"];
    
    // Parse objects
    jsonFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === "string") {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          console.error(`Failed to parse ${field}:`, req.body[field]);
        }
      }
    });
    
    // Parse arrays
    arrayFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === "string") {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          console.error(`Failed to parse ${field}:`, req.body[field]);
        }
      }
    });

    // Normalize coordinates to req.body.geo if not already present
    if (!req.body.geo) {
      const latVal = req.body.lat ?? req.body.latitude;
      const lngVal = req.body.lng ?? req.body.longitude ?? req.body.lag ?? req.body.lon ?? req.body.long;
      
      if (latVal !== undefined && lngVal !== undefined) {
        const lat = Number(latVal);
        const lng = Number(lngVal);
        if (!isNaN(lat) && !isNaN(lng)) {
          req.body.geo = { lat, lng };
        }
      }
    }

    // Clean up top-level coordinate keys to avoid Zod validation errors on strict schemas
    const keysToDelete = ["lat", "lng", "latitude", "longitude", "lag", "lon", "long"];
    keysToDelete.forEach(k => {
      delete req.body[k];
    });
  }
  next();
});

app.use(morgan("dev"));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120
  })
);

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

