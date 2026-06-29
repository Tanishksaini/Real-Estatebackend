const express = require("express");
const path = require("path");
const multer = require("multer");
const { z } = require("zod");

const { Property } = require("../models/Property");
const { User } = require("../models/User");
const { Favorite } = require("../models/Favorite");
const { RecentlyViewed } = require("../models/RecentlyViewed");
const { ContactedProperty } = require("../models/ContactedProperty");
const { Enquiry } = require("../models/Enquiry");
const { Notification } = require("../models/Notification");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../utils/validate");
const { formatProperty, formatPropertyList } = require("../utils/propertyResponse");
const { uploadToCloudinary } = require("../utils/cloudinary");

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
// properties_routes.js mein — top pe add karo (upload ke baad)
function parseFormDataFields(req, res, next) {
  const jsonFields = ["location", "geo", "area", "price", "specs"];
  const arrayFields = ["amenities"];

  jsonFields.forEach(field => {
    if (req.body[field] && typeof req.body[field] === "string") {
      try { req.body[field] = JSON.parse(req.body[field]); }
      catch (e) { console.error(`Failed to parse ${field}:`, req.body[field]); }
    }
  });

  arrayFields.forEach(field => {
    if (req.body[field] && typeof req.body[field] === "string") {
      try { req.body[field] = JSON.parse(req.body[field]); }
      catch (e) { console.error(`Failed to parse ${field}:`, req.body[field]); }
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

  next();
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
    featured: z.string().trim().optional(),
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
    const featuredOnly = req.validated.query.featured === "true";

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
    if (featuredOnly) match.featured = true;
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
    return res.json({ page, limit, items: formatPropertyList(items) });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/nearest", validate(listSchema), async (req, res, next) => {
  try {
    const lat = req.validated.query.lat ? Number(req.validated.query.lat) : null;
    const lng = req.validated.query.lng ? Number(req.validated.query.lng) : null;
    const radiusKm = req.validated.query.radiusKm ? Number(req.validated.query.radiusKm) : 10;
    const limit = Math.min(50, Math.max(1, Number(req.validated.query.limit || 20)));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lat and lng are required for nearest endpoint" });
    }

    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          maxDistance: Math.max(0.1, radiusKm) * 1000,
          spherical: true,
          query: { status: "active" }
        }
      },
      {
        $addFields: {
          distanceKm: { $divide: ["$distanceMeters", 1000] }
        }
      },
      { $sort: { distanceMeters: 1 } },
      { $limit: limit }
    ];

    const items = await Property.aggregate(pipeline);
    return res.json({ page: 1, limit, items: formatPropertyList(items) });
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

propertiesRouter.post(
  "/",
  requireAuth,
  upload.any(),
  parseFormDataFields,
  validate(createSchema),
  async (req, res, next) => {
    try {
      const b = req.validated.body;

      const areaValue = b.area?.value;
      const areaUnit = b.area?.unit || "sqft";
      const sqft = toSqft(areaValue, areaUnit);

      const pricePerSqFt =
        sqft && sqft > 0 ? Math.round((b.price.total / sqft) * 100) / 100 : undefined;

      const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      const videoExtensions = [".mp4", ".avi", ".mov", ".mkv", ".webm"];

      const uploadedFiles = req.files || [];
      const photoFiles = uploadedFiles
        .filter(f => imageExtensions.some(ext => f.originalname.toLowerCase().endsWith(ext)));
      const videoFiles = uploadedFiles
        .filter(f => videoExtensions.some(ext => f.originalname.toLowerCase().endsWith(ext)));

      if (photoFiles.length === 0) {
        const fs = require("fs");
        uploadedFiles.forEach(f => {
          try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
        });
        return res.status(400).json({ error: "At least 1 photo is required" });
      }

      const uploadedPhotos = await Promise.all(
        photoFiles.map(f => uploadToCloudinary(f.path, "properties/photos", "image"))
      );
      const uploadedVideos = await Promise.all(
        videoFiles.map(f => uploadToCloudinary(f.path, "properties/videos", "video"))
      );

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
        media: {
          photos: uploadedPhotos,
          videos: uploadedVideos
        },
        status: "active"
      });

      return res.status(201).json({ property: formatProperty(doc) });
    } catch (err) {
      return next(err);
    }
  }
);

propertiesRouter.get("/my-listings", requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const items = await Property.find({ owner: req.user.sub })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments({ owner: req.user.sub });

    return res.json({ 
      page, 
      limit, 
      total,
      items: formatPropertyList(items) 
    });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/:id", async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id).populate(
      "owner",
      "name email phone profilePhotoUrl isSellerVerified"
    );
    if (!prop) return res.status(404).json({ error: "Property not found" });

    prop.analytics = prop.analytics || {};
    prop.analytics.views = (prop.analytics.views || 0) + 1;
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

    return res.json({ property: formatProperty(prop) });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/:id/analytics", requireAuth, async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (String(prop.owner) !== String(req.user.sub)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const analytics = prop.analytics || {};
    return res.json({
      propertyId: String(prop._id),
      viewCount: analytics.views ?? 0,
      enquiryCount: analytics.enquiries ?? 0,
      favoriteCount: analytics.favorites ?? 0,
      callCount: analytics.calls ?? 0,
      shareCount: analytics.shares ?? 0,
      analytics: {
        views: analytics.views ?? 0,
        enquiries: analytics.enquiries ?? 0,
        favorites: analytics.favorites ?? 0,
        calls: analytics.calls ?? 0,
        shares: analytics.shares ?? 0
      }
    });
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
    return res.json({ property: formatProperty(prop) });
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
      ContactedProperty.deleteMany({ property: prop._id }),
      Enquiry.deleteMany({ property: prop._id })
    ]);
    await Property.deleteOne({ _id: prop._id });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

const handleMediaUpload = async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    const files = req.files || {};
    
    const allUploadedFiles = [
      ...(files.photos || []),
      ...(files.videos || []),
      ...(files.registry ? [files.registry[0]] : []),
      ...(files.saleDeed ? [files.saleDeed[0]] : []),
      ...(files.taxReceipt ? [files.taxReceipt[0]] : [])
    ];

    if (!prop) {
      const fs = require("fs");
      allUploadedFiles.forEach(f => {
        try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
      });
      return res.status(404).json({ error: "Property not found" });
    }

    if (String(prop.owner) !== String(req.user.sub)) {
      const fs = require("fs");
      allUploadedFiles.forEach(f => {
        try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
      });
      return res.status(403).json({ error: "Not allowed" });
    }

    const photosPromises = (files.photos || []).map((f) => uploadToCloudinary(f.path, "properties/photos", "image"));
    const videosPromises = (files.videos || []).map((f) => uploadToCloudinary(f.path, "properties/videos", "video"));

    const [photos, videos] = await Promise.all([
      Promise.all(photosPromises),
      Promise.all(videosPromises)
    ]);

    prop.media = prop.media || { photos: [], videos: [] };
    prop.media.photos = [...(prop.media.photos || []), ...photos];
    prop.media.videos = [...(prop.media.videos || []), ...videos];

    if (files.registry?.[0]) {
      prop.documents.registry = await uploadToCloudinary(files.registry[0].path, "properties/documents", "auto");
    }
    if (files.saleDeed?.[0]) {
      prop.documents.saleDeed = await uploadToCloudinary(files.saleDeed[0].path, "properties/documents", "auto");
    }
    if (files.taxReceipt?.[0]) {
      prop.documents.taxReceipt = await uploadToCloudinary(files.taxReceipt[0].path, "properties/documents", "auto");
    }

    if (prop.documents.registry || prop.documents.saleDeed || prop.documents.taxReceipt) {
      prop.verified.property = true;
    }

    await prop.save();
    return res.json({ property: formatProperty(prop) });
  } catch (err) {
    const fs = require("fs");
    const files = req.files || {};
    const allUploadedFiles = [
      ...(files.photos || []),
      ...(files.videos || []),
      ...(files.registry ? [files.registry[0]] : []),
      ...(files.saleDeed ? [files.saleDeed[0]] : []),
      ...(files.taxReceipt ? [files.taxReceipt[0]] : [])
    ];
    allUploadedFiles.forEach(f => {
      try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
    });
    return next(err);
  }
};

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
  handleMediaUpload
);

// Alias: /media/upload for the same endpoint
propertiesRouter.post(
  "/:id/media/upload",
  requireAuth,
  upload.fields([
    { name: "photos", maxCount: 20 },
    { name: "videos", maxCount: 3 },
    { name: "registry", maxCount: 1 },
    { name: "saleDeed", maxCount: 1 },
    { name: "taxReceipt", maxCount: 1 }
  ]),
  handleMediaUpload
);

propertiesRouter.post("/:id/mark-sold", requireAuth, async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (String(prop.owner) !== String(req.user.sub)) return res.status(403).json({ error: "Not allowed" });

    prop.status = "sold";
    await prop.save();
    return res.json({ property: formatProperty(prop) });
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
      return res.json({ success: true, favorited: false, property: formatProperty(prop) });
    }

    await Favorite.create({ user: req.user.sub, property: prop._id });
    await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.favorites": 1 } });
    return res.json({ success: true, favorited: true, property: formatProperty(prop) });
  } catch (err) {
    if (err && err.code === 11000) return res.json({ success: true, favorited: true, property: formatProperty(prop) });
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

const enquirySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    message: z.string().trim().min(5).max(1000)
  })
});

propertiesRouter.post("/:id/enquiry", requireAuth, validate(enquirySchema), async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (prop.status !== "active") {
      return res.status(400).json({ error: "Enquiries are only allowed on active properties" });
    }
    if (String(prop.owner) === String(req.user.sub)) {
      return res.status(400).json({ error: "You cannot enquire on your own property" });
    }

    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found" });

    const b = req.validated.body;
    const enquiry = await Enquiry.create({
      property: prop._id,
      user: user._id,
      name: b.name || user.name || "User",
      email: b.email || user.email,
      phone: b.phone || user.phone,
      message: b.message
    });

    await Property.updateOne({ _id: prop._id }, { $inc: { "analytics.enquiries": 1 } });

    await Notification.create({
      user: prop.owner,
      type: "property_enquiry",
      title: "New property enquiry",
      body: `${enquiry.name} enquired about "${prop.title}"`,
      data: { propertyId: String(prop._id), enquiryId: String(enquiry._id) }
    });

    // Notify all users who favorited this property (excluding the enquirer)
    const favorites = await Favorite.find({
      property: prop._id,
      user: { $ne: user._id }
    });

    if (favorites.length > 0) {
      const favoriteNotifications = favorites.map(fav => ({
        user: fav.user,
        type: "favorite_enquiry",
        title: "Enquiry on your favorited property",
        body: `Someone has enquired about "${prop.title}" which you favorited.`,
        data: { propertyId: String(prop._id), enquiryId: String(enquiry._id) }
      }));
      await Notification.insertMany(favoriteNotifications);
    }

    return res.status(201).json({
      message: "Enquiry submitted successfully",
      enquiry,
      viewCount: prop.analytics?.views ?? 0,
      enquiryCount: (prop.analytics?.enquiries ?? 0) + 1
    });
  } catch (err) {
    return next(err);
  }
});

propertiesRouter.get("/:id/enquiries", requireAuth, async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    if (String(prop.owner) !== String(req.user.sub)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const items = await Enquiry.find({ property: prop._id })
      .sort({ createdAt: -1 })
      .populate("user", "name email phone profilePhotoUrl");

    return res.json({
      propertyId: String(prop._id),
      viewCount: prop.analytics?.views ?? 0,
      enquiryCount: prop.analytics?.enquiries ?? 0,
      items
    });
  } catch (err) {
    return next(err);
  }
});

const updateEnquirySchema = z.object({
  params: z.object({
    id: z.string().min(1),
    enquiryId: z.string().min(1)
  }),
  body: z.object({
    status: z.enum(["pending", "contacted", "closed"])
  })
});

propertiesRouter.patch(
  "/:id/enquiries/:enquiryId",
  requireAuth,
  validate(updateEnquirySchema),
  async (req, res, next) => {
    try {
      const prop = await Property.findById(req.validated.params.id);
      if (!prop) return res.status(404).json({ error: "Property not found" });
      if (String(prop.owner) !== String(req.user.sub)) {
        return res.status(403).json({ error: "Not allowed" });
      }

      const enquiry = await Enquiry.findOneAndUpdate(
        { _id: req.validated.params.enquiryId, property: prop._id },
        { status: req.validated.body.status },
        { new: true }
      ).populate("user", "name email phone profilePhotoUrl");

      if (!enquiry) return res.status(404).json({ error: "Enquiry not found" });
      return res.json({ enquiry });
    } catch (err) {
      return next(err);
    }
  }
);

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

    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 4)));

    const items = await Property.find({
      _id: { $ne: prop._id },
      status: "active",
      type: prop.type,
      "location.city": prop.location?.city
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json({ items: formatPropertyList(items) });
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

propertiesRouter.get("/:id/map", async (req, res, next) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) {
      return res.status(404).send("<h1>Property not found</h1>");
    }

    if (!prop.geo || !prop.geo.coordinates || prop.geo.coordinates.length !== 2) {
      const escapeHTML = (str) => {
        if (!str) return "";
        return str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>No Location Data</title>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet">
            <style>
              body {
                background-color: #0f172a;
                color: #f1f5f9;
                font-family: 'Plus Jakarta Sans', sans-serif;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .card {
                background: rgba(30, 41, 59, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(16px);
                padding: 40px;
                border-radius: 24px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
                max-width: 450px;
                width: 90%;
              }
              h1 { font-size: 24px; margin-bottom: 16px; color: #f43f5e; }
              p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
              a {
                background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                color: white;
                text-decoration: none;
                padding: 12px 24px;
                border-radius: 12px;
                font-weight: 600;
                transition: transform 0.2s, box-shadow 0.2s;
                display: inline-block;
              }
              a:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4); }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>No Coordinates Available</h1>
              <p>This property ("${escapeHTML(prop.title)}") does not have valid latitude and longitude coordinates configured.</p>
              <a href="javascript:window.close()">Close Page</a>
            </div>
          </body>
        </html>
      `);
    }

    const [lng, lat] = prop.geo.coordinates;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const useGoogleMaps = !!apiKey;

    const escapeHTML = (str) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const formattedPrice = prop.price?.total 
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(prop.price.total)
      : "N/A";

    const formattedLocation = [
      prop.location?.landmark,
      prop.location?.localArea,
      prop.location?.city,
      prop.location?.state,
      prop.location?.pinCode
    ].filter(Boolean).join(", ");

    const pageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Map View - ${escapeHTML(prop.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  
  ${!useGoogleMaps ? `
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  ` : `
  <script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}"></script>
  `}

  <style>
    :root {
      --bg-color: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.85);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    #map {
      flex: 1;
      width: 100%;
      height: 100%;
      z-index: 1;
    }

    .info-overlay {
      position: absolute;
      top: 24px;
      left: 24px;
      z-index: 10;
      max-width: 420px;
      width: calc(100% - 48px);
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
      animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideIn {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .badge {
      display: inline-block;
      padding: 6px 12px;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }

    .title {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 8px;
      color: #ffffff;
    }

    .price {
      font-size: 24px;
      font-weight: 800;
      color: #34d399;
      margin-bottom: 16px;
    }

    .divider {
      height: 1px;
      background: var(--border-color);
      margin: 16px 0;
    }

    .detail-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 13px;
    }

    .detail-icon {
      color: var(--accent);
      margin-right: 10px;
      font-size: 16px;
      width: 20px;
      text-align: center;
      margin-top: 2px;
    }

    .detail-content {
      flex: 1;
      line-height: 1.4;
    }

    .detail-label {
      color: var(--text-muted);
      font-weight: 500;
      margin-bottom: 2px;
    }

    .detail-value {
      font-weight: 600;
      color: var(--text-main);
    }

    .btn-action {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
      color: white;
      text-decoration: none;
      padding: 14px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
      transition: all 0.2s ease;
      margin-top: 16px;
    }

    .btn-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4);
    }

    .btn-action:active {
      transform: translateY(0);
    }

    .coordinate-badge {
      position: absolute;
      bottom: 24px;
      right: 24px;
      background: rgba(17, 24, 39, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 11px;
      font-family: monospace;
      color: var(--text-muted);
      z-index: 10;
      backdrop-filter: blur(8px);
      pointer-events: none;
    }

    /* Sleek zoom controls custom styling for Leaflet */
    .leaflet-bar {
      border: 1px solid var(--border-color) !important;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
      border-radius: 10px !important;
      overflow: hidden;
    }
    .leaflet-bar a {
      background-color: var(--card-bg) !important;
      color: var(--text-main) !important;
      border-bottom: 1px solid var(--border-color) !important;
      transition: all 0.2s;
    }
    .leaflet-bar a:hover {
      background-color: var(--accent) !important;
      color: white !important;
    }
  </style>
</head>
<body>

  <div class="info-overlay">
    <span class="badge">${escapeHTML(prop.type)} - ${escapeHTML(prop.ownershipType)}</span>
    <h1 class="title">${escapeHTML(prop.title)}</h1>
    <div class="price">${formattedPrice}</div>
    
    <div class="divider"></div>
    
    <div class="detail-item">
      <span class="detail-icon">📍</span>
      <div class="detail-content">
        <div class="detail-label">Address</div>
        <div class="detail-value">${escapeHTML(formattedLocation) || "N/A"}</div>
      </div>
    </div>

    ${prop.area?.value ? `
    <div class="detail-item">
      <span class="detail-icon">📏</span>
      <div class="detail-content">
        <div class="detail-label">Area</div>
        <div class="detail-value">${prop.area.value} ${escapeHTML(prop.area.unit || 'sqft')}</div>
      </div>
    </div>
    ` : ''}

    ${prop.price?.pricePerSqFt ? `
    <div class="detail-item">
      <span class="detail-icon">💰</span>
      <div class="detail-content">
        <div class="detail-label">Rate</div>
        <div class="detail-value">₹${prop.price.pricePerSqFt.toLocaleString('en-IN')}/sqft</div>
      </div>
    </div>
    ` : ''}

    <button class="btn-action" onclick="focusMap()">Center Location</button>
  </div>

  <div class="coordinate-badge">
    Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}
  </div>

  <div id="map"></div>

  <script>
    const lat = ${lat};
    const lng = ${lng};
    let map;
    let marker;

    const propertyTitle = decodeURIComponent("${encodeURIComponent(prop.title)}");

    function initLeafletMap() {
      // Use CARTO DB Dark Matter tiles for a premium look matching our dark theme
      map = L.map('map', {
        zoomControl: true,
        attributionControl: false
      }).setView([lat, lng], 15);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
      }).addTo(map);

      // Custom sleek marker styling
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="background-color: #6366f1; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(99, 102, 241, 0.8); animation: pulse 2s infinite;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      // Add keyframe animation style
      const style = document.createElement('style');
      style.type = 'text/css';
      style.innerHTML = \`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      \`;
      document.getElementsByTagName('head')[0].appendChild(style);

      marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      
      const popupContent = \`
        <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; font-weight: 600;">
          \${escapeHTML(propertyTitle)}
        </div>
      \`;
      marker.bindPopup(popupContent, { closeButton: false }).openPopup();
    }

    function initGoogleMap() {
      const position = { lat: lat, lng: lng };
      
      // Slick dark theme styling for Google Maps
      const darkMapStyle = [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#263c3f" }],
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6b9a76" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#38414e" }],
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#212a37" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9ca5b9" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#746855" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#1f2835" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#f3d19c" }],
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#2f3930" }],
        },
        {
          featureType: "transit.station",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#17263c" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#515c6d" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#17263c" }],
        },
      ];

      map = new google.maps.Map(document.getElementById("map"), {
        zoom: 15,
        center: position,
        styles: darkMapStyle,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      marker = new google.maps.Marker({
        position: position,
        map: map,
        title: propertyTitle,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#6366f1",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        }
      });

      const infowindow = new google.maps.InfoWindow({
        content: \`<div style="color: #0f172a; padding: 4px; font-weight: 600;">\${escapeHTML(propertyTitle)}</div>\`,
      });

      marker.addListener("click", () => {
        infowindow.open(map, marker);
      });
      
      infowindow.open(map, marker);
    }

    function focusMap() {
      if (${useGoogleMaps}) {
        if (map) map.panTo({ lat: lat, lng: lng });
      } else {
        if (map) map.panTo([lat, lng]);
      }
    }

    function escapeHTML(str) {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // Initialize map on load
    window.onload = function() {
      if (${useGoogleMaps}) {
        initGoogleMap();
      } else {
        initLeafletMap();
      }
    };
  </script>
</body>
</html>
    `;

    res.setHeader("Content-Type", "text/html");
    return res.send(pageHtml);
  } catch (err) {
    return next(err);
  }
});

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { propertiesRouter };

