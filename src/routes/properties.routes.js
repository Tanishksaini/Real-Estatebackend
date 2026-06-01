const express = require("express");
const path = require("path");
const multer = require("multer");
const { z } = require("zod");

const { Property } = require("../models/Property");
const { User } = require("../models/User");
const { Favorite } = require("../models/Favorite");
const { RecentlyViewed } = require("../models/RecentlyViewed");
const { ContactedProperty } = require("../models/ContactedProperty");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../utils/validate");

const propertiesRouter = express.Router();

function toSqft(value, unit) {
  if (typeof value !== "number") return null;
  switch (unit) {
    case "sqft":
      return value;
    case "gaz":
      return value * 9;
    case "sqyard":
      return value * 9;
    case "meter":
      return value * 10.7639;
    default:
      return value;
  }
}

function buildUploadStorage() {
  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.resolve(process.cwd(), uploadDir)),
    filename: (req, file, cb) => {
      const safe = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`);
    }
  });
}

const upload = multer({
  storage: buildUploadStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const listSchema = z.object({
  query: z.object({
    q: z.string().trim().optional(),
    type: z.enum(["plot", "house", "flat", "shop", "commercial", "office"]).optional(),
    city: z.string().trim().optional(),
    localArea: z.string().trim().optional(),
    verifiedOnly: z.string().trim().optional(),
    minPrice: z.string().trim().optional(),
    maxPrice: z.string().trim().optional(),
    minArea: z.string().trim().optional(),
    maxArea: z.string().trim().optional(),
    status: z.enum(["active", "pending", "sold"]).optional(),
    sort: z.enum(["latest", "nearest", "lowestPrice", "highestPrice"]).optional(),
    lat: z.string().trim().optional(),
    lng: z.string().trim().optional(),
    radiusKm: z.string().trim().optional(),
    page: z.string().trim().optional(),
    limit: z.string().trim().optional()
  })
});

propertiesRouter.get("/", validate(listSchema), async (req, res, next) => {
  try {
    const q = req.validated.query.q;
    const type = req.validated.query.type;
    const city = req.validated.query.city;
    const localArea = req.validated.query.localArea;
    const status = req.validated.query.status || "active";
    const verifiedOnly = req.validated.query.verifiedOnly === "true";

    const page = Math.max(1, Number(req.validated.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.validated.query.limit || 20)));
    const skip = (page - 1) * limit;

    const minPrice = req.validated.query.minPrice ? Number(req.validated.query.minPrice) : null;
    const maxPrice = req.validated.query.maxPrice ? Number(req.validated.query.maxPrice) : null;

    const minArea = req.validated.query.minArea ? Number(req.validated.query.minArea) : null;
    const maxArea = req.validated.query.maxArea ? Number(req.validated.query.maxArea) : null;

    const lat = req.validated.query.lat ? Number(req.validated.query.lat) : null;
    const lng = req.validated.query.lng ? Number(req.validated.query.lng) : null;
    const radiusKm = req.validated.query.radiusKm ? Number(req.validated.query.radiusKm) : null;

    const sort = req.validated.query.sort || "latest";

    const match = { status };
    if (type) match.type = type;
    if (city) match["location.city"] = new RegExp(`^${escapeRegExp(city)}`, "i");
    if (localArea) match["location.localArea"] = new RegExp(escapeRegExp(localArea), "i");
    if (verifiedOnly) match["verified.property"] = true;
    if (q) match.$text = { $search: q };
    if (minPrice != null || maxPrice != null) {
      match["price.total"] = {};
      if (minPrice != null && !Number.isNaN(minPrice)) match["price.total"].$gte = minPrice;
      if (maxPrice != null && !Number.isNaN(maxPrice)) match["price.total"].$lte = maxPrice;
    }
    if (minArea != null || maxArea != null) {
      match["area.value"] = {};
      if (minArea != null && !Number.isNaN(minArea)) match["area.value"].$gte = minArea;
      if (maxArea != null && !Number.isNaN(maxArea)) match["area.value"].$lte = maxArea;
    }

    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radiusKm);
    if (sort === "nearest" && !hasGeo) {
      return res.status(400).json({ error: "lat,lng,radiusKm required for nearest sort" });
    }

    const pipeline = [];

    if (hasGeo) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          maxDistance: Math.max(0.1, radiusKm) * 1000,
          spherical: true,
          query: match
        }
      });
      pipeline.push({
        $addFields: {
          distanceKm: { $divide: ["$distanceMeters", 1000] }
        }
      });
    } else {
      pipeline.push({ $match: match });
    }

    if (sort === "latest") pipeline.push({ $sort: { createdAt: -1 } });
    if (sort === "lowestPrice") pipeline.push({ $sort: { "price.total": 1 } });
    if (sort === "highestPrice") pipeline.push({ $sort: { "price.total": -1 } });
    if (sort === "nearest") pipeline.push({ $sort: { distanceMeters: 1 } });

    pipeline.push({ $skip: skip }, { $limit: limit });

    const items = await Property.aggregate(pipeline);
    return res.json({ page, limit, items });
  } catch (err) {
    return next(err);
  }
});

const createSchema = z.object({
  body: z.object({
    type: z.enum(["plot", "house", "flat", "shop", "commercial", "office"]),
    ownershipType: z.enum(["owner", "dealer", "builder"]),
    purpose: z.enum(["sell"]).optional(),
    title: z.string().trim().min(3),
    description: z.string().trim().optional(),
    location: z
      .object({
        state: z.string().trim().optional(),
        city: z.string().trim().min(1),
        localArea: z.string().trim().optional(),
        landmark: z.string().trim().optional(),
        pinCode: z.string().trim().optional()
      })
      .optional(),
    geo: z
      .object({
        lat: z.number(),
        lng: z.number()
      })
      .optional(),
    area: z
      .object({
        value: z.number().min(0).optional(),
        unit: z.enum(["gaz", "sqft", "sqyard", "meter"]).optional()
      })
      .optional(),
    price: z.object({
      total: z.number().min(0),
      negotiable: z.boolean().optional()
    }),
    specs: z.record(z.any()).optional(),
    amenities: z.array(z.string().trim()).optional()
  })
});

propertiesRouter.post("/", requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const b = req.validated.body;

    const areaValue = b.area?.value;
    const areaUnit = b.area?.unit || "sqft";
    const sqft = toSqft(areaValue, areaUnit);

    const pricePerSqFt =
      sqft && sqft > 0 ? Math.round((b.price.total / sqft) * 100) / 100 : undefined;

    const doc = await Property.create({
      owner: req.user.sub,
      type: b.type,
      ownershipType: b.ownershipType,
      purpose: b.purpose || "sell",
      title: b.title,
      description: b.description,
      location: b.location,
      geo: b.geo ? { type: "Point", coordinates: [b.geo.lng, b.geo.lat] } : undefined,
      area: b.area ? { value: b.area.value, unit: areaUnit } : undefined,
      price: { total: b.price.total, negotiable: !!b.price.negotiable, pricePerSqFt },
      specs: b.specs || {},
      amenities: b.amenities || [],
      status: "pending"
    });

    return res.status(201).json({ property: doc });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/:id", async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id).populate("owner", "name email phone profilePhotoUrl isSellerVerified");
    if (!prop) return res.status(404).json({ error: "Property not found" });

    await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.views": 1 } });

    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (token) {
      const jwt = require("jsonwebtoken");
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        await RecentlyViewed.updateOne(
          { user: payload.sub, property: prop._id },
          { $set: { lastViewedAt: new Date() }, $setOnInsert: { user: payload.sub, property: prop._id } },
          { upsert: true }
        );
      } catch {
        // ignore optional auth failures for public endpoint
      }
    }

    return res.json({ property: prop });
  } catch (err) {
    return next(err);
  }
});

const updateSchema = z.object({
  body: z
    .object({
      status: z.enum(["active", "pending", "sold"]).optional(),
      title: z.string().trim().min(3).optional(),
      description: z.string().trim().optional(),
      location: z
        .object({
          state: z.string().trim().optional(),
          city: z.string().trim().optional(),
          localArea: z.string().trim().optional(),
          landmark: z.string().trim().optional(),
          pinCode: z.string().trim().optional()
        })
        .optional(),
      geo: z
        .object({
          lat: z.number(),
          lng: z.number()
        })
        .optional(),
      area: z
        .object({
          value: z.number().min(0).optional(),
          unit: z.enum(["gaz", "sqft", "sqyard", "meter"]).optional()
        })
        .optional(),
      price: z
        .object({
          total: z.number().min(0).optional(),
          negotiable: z.boolean().optional()
        })
        .optional(),
      specs: z.record(z.any()).optional(),
      amenities: z.array(z.string().trim()).optional()
    })
    .strict()
});

propertiesRouter.patch("/:id", requireAuth, validate(updateSchema), async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (String(prop.owner) !== String(req.user.sub)) return res.status(403).json({ error: "Not allowed" });

    const b = req.validated.body;

    if (b.geo) prop.geo = { type: "Point", coordinates: [b.geo.lng, b.geo.lat] };
    if (b.location) prop.location = { ...(prop.location || {}), ...b.location };
    if (b.title != null) prop.title = b.title;
    if (b.description != null) prop.description = b.description;
    if (b.status != null) prop.status = b.status;
    if (b.area) prop.area = { ...(prop.area || {}), ...b.area };
    if (b.specs) prop.specs = b.specs;
    if (b.amenities) prop.amenities = b.amenities;

    if (b.price) {
      prop.price = { ...(prop.price || {}), ...b.price };
    }

    const sqft = toSqft(prop.area?.value, prop.area?.unit);
    if (prop.price?.total != null && sqft && sqft > 0) {
      prop.price.pricePerSqFt = Math.round((prop.price.total / sqft) * 100) / 100;
    }

    await prop.save();
    return res.json({ property: prop });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (String(prop.owner) !== String(req.user.sub)) return res.status(403).json({ error: "Not allowed" });

    await Promise.all([
      Favorite.deleteMany({ property: prop._id }),
      RecentlyViewed.deleteMany({ property: prop._id }),
      ContactedProperty.deleteMany({ property: prop._id })
    ]);
    await Property.deleteOne({ _id: prop._id });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.post(
  "/:id/media",
  requireAuth,
  upload.fields([
    { name: "photos", maxCount: 20 },
    { name: "videos", maxCount: 3 },
    { name: "registry", maxCount: 1 },
    { name: "saleDeed", maxCount: 1 },
    { name: "taxReceipt", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const prop = await Property.findById(req.params.id);
      if (!prop) return res.status(404).json({ error: "Property not found" });
      if (String(prop.owner) !== String(req.user.sub)) return res.status(403).json({ error: "Not allowed" });

      const files = req.files || {};
      const photos = (files.photos || []).map((f) => `/uploads/${f.filename}`);
      const videos = (files.videos || []).map((f) => `/uploads/${f.filename}`);

      prop.media = prop.media || { photos: [], videos: [] };
      prop.media.photos = [...(prop.media.photos || []), ...photos];
      prop.media.videos = [...(prop.media.videos || []), ...videos];

      if (files.registry?.[0]) prop.documents.registry = `/uploads/${files.registry[0].filename}`;
      if (files.saleDeed?.[0]) prop.documents.saleDeed = `/uploads/${files.saleDeed[0].filename}`;
      if (files.taxReceipt?.[0]) prop.documents.taxReceipt = `/uploads/${files.taxReceipt[0].filename}`;

      if (prop.documents.registry || prop.documents.saleDeed || prop.documents.taxReceipt) {
        prop.verified.property = true;
      }

      await prop.save();
      return res.json({ property: prop });
    } catch (err) {
      return next(err);
    }
  }
);

propertiesRouter.post("/:id/mark-sold", requireAuth, async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (String(prop.owner) !== String(req.user.sub)) return res.status(403).json({ error: "Not allowed" });

    prop.status = "sold";
    await prop.save();
    return res.json({ property: prop });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.post("/:id/favorite", requireAuth, async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const existing = await Favorite.findOne({ user: req.user.sub, property: prop._id });
    if (existing) {
      await Favorite.deleteOne({ _id: existing._id });
      await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.favorites": -1 } });
      return res.json({ favorited: false });
    }

    await Favorite.create({ user: req.user.sub, property: prop._id });
    await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.favorites": 1 } });
    return res.json({ favorited: true });
  } catch (err) {
    if (err && err.code === 11000) return res.json({ favorited: true });
    return next(err);
  }
});

const contactSchema = z.object({
  body: z.object({
    method: z.enum(["call", "whatsapp", "email"]).optional()
  })
});

propertiesRouter.post("/:id/contact", requireAuth, validate(contactSchema), async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const method = req.validated.body.method || "call";
    await ContactedProperty.updateOne(
      { user: req.user.sub, property: prop._id, method },
      { $setOnInsert: { user: req.user.sub, property: prop._id, method } },
      { upsert: true }
    );
    await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.calls": 1 } });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.post("/:id/share", async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.shares": 1 } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/:id/similar", async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const items = await Property.find({
      _id: { $ne: prop._id },
      status: "active",
      type: prop.type,
      "location.city": prop.location?.city
    })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/:id/seller", async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });

    const seller = await User.findById(prop.owner);
    if (!seller) return res.status(404).json({ error: "Seller not found" });

    return res.json({ seller: seller.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { propertiesRouter };

