const express = require("express");
const { z } = require("zod");

const { requireAuth } = require("../middleware/auth");
const { validate } = require("../utils/validate");
const { User } = require("../models/User");
const { Favorite } = require("../models/Favorite");
const { RecentlyViewed } = require("../models/RecentlyViewed");
const { Notification } = require("../models/Notification");
const { ContactedProperty } = require("../models/ContactedProperty");
const { Enquiry } = require("../models/Enquiry");

const profileRouter = express.Router();

profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found" });
    const safeUser = user.toSafeJSON();
    return res.json({ user: safeUser, profile: safeUser });
  } catch (err) {
    return next(err);
  }
});

const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).optional(),
      phone: z.string().trim().min(6).max(20).optional(),
      profilePhotoUrl: z.string().trim().min(1).optional(),
      avatar: z.string().trim().min(1).optional()
    })
    .strict()
});

profileRouter.patch("/", validate(updateProfileSchema), async (req, res, next) => {
  try {
    const body = req.validated.body;
    // Map avatar to profilePhotoUrl if provided
    if (body.avatar && !body.profilePhotoUrl) {
      body.profilePhotoUrl = body.avatar;
    }
    delete body.avatar;
    
    const user = await User.findByIdAndUpdate(req.user.sub, body, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    const safeUser = user.toSafeJSON();
    return res.json({ user: safeUser, profile: safeUser });
  } catch (err) {
    return next(err);
  }
});

profileRouter.delete("/", async (req, res, next) => {
  try {
    await Promise.all([
      Favorite.deleteMany({ user: req.user.sub }),
      RecentlyViewed.deleteMany({ user: req.user.sub }),
      Notification.deleteMany({ user: req.user.sub }),
      ContactedProperty.deleteMany({ user: req.user.sub }),
      Enquiry.deleteMany({ user: req.user.sub })
    ]);
    await User.findByIdAndDelete(req.user.sub);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

profileRouter.get("/favorites", async (req, res, next) => {
  try {
    const items = await Favorite.find({ user: req.user.sub })
      .sort({ createdAt: -1 })
      .populate("property");
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

profileRouter.get("/recently-viewed", async (req, res, next) => {
  try {
    const items = await RecentlyViewed.find({ user: req.user.sub })
      .sort({ lastViewedAt: -1 })
      .limit(100)
      .populate("property");
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

profileRouter.get("/contacted", async (req, res, next) => {
  try {
    const items = await ContactedProperty.find({ user: req.user.sub })
      .sort({ createdAt: -1 })
      .populate("property");
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

profileRouter.get("/enquiries", async (req, res, next) => {
  try {
    const items = await Enquiry.find({ user: req.user.sub })
      .sort({ createdAt: -1 })
      .populate("property", "title location price status analytics");

    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

profileRouter.get("/notifications", async (req, res, next) => {
  try {
    const items = await Notification.find({ user: req.user.sub }).sort({ createdAt: -1 }).limit(200);
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
});

const markReadSchema = z.object({
  params: z.object({ id: z.string().min(1) })
});

profileRouter.post("/notifications/:id/read", validate(markReadSchema), async (req, res, next) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.validated.params.id, user: req.user.sub },
      { readAt: new Date() },
      { new: true }
    );
    if (!n) return res.status(404).json({ error: "Notification not found" });
    return res.json({ success: true, item: n });
  } catch (err) {
    return next(err);
  }
});

module.exports = { profileRouter };
