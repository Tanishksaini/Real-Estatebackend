const mongoose = require("mongoose");

const recentlyViewedSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    lastViewedAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

recentlyViewedSchema.index({ user: 1, property: 1 }, { unique: true });

const RecentlyViewed = mongoose.model("RecentlyViewed", recentlyViewedSchema);

module.exports = { RecentlyViewed };

