const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    status: { type: String, enum: ["active", "pending", "sold"], default: "pending", index: true },

    type: {
      type: String,
      enum: ["plot", "house", "flat", "shop", "commercial", "office"],
      required: true,
      index: true
    },
    ownershipType: { type: String, enum: ["owner", "dealer", "builder"], required: true, index: true },
    purpose: { type: String, enum: ["sell"], default: "sell", index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    location: {
      state: { type: String, trim: true, index: true },
      city: { type: String, trim: true, index: true },
      localArea: { type: String, trim: true, index: true },
      landmark: { type: String, trim: true },
      pinCode: { type: String, trim: true }
    },

    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number], // [lng, lat]
        validate: {
          validator: (v) => Array.isArray(v) && v.length === 2,
          message: "geo.coordinates must be [lng, lat]"
        }
      }
    },

    area: {
      value: { type: Number, min: 0 },
      unit: { type: String, enum: ["gaz", "sqft", "sqyard", "meter"], default: "sqft" }
    },

    price: {
      total: { type: Number, required: true, min: 0, index: true },
      negotiable: { type: Boolean, default: false },
      pricePerSqFt: { type: Number, min: 0 }
    },

    specs: { type: mongoose.Schema.Types.Mixed, default: {} },
    amenities: [{ type: String, trim: true }],

    media: {
      photos: [{ type: String, trim: true }],
      videos: [{ type: String, trim: true }]
    },

    documents: {
      registry: { type: String, trim: true },
      saleDeed: { type: String, trim: true },
      taxReceipt: { type: String, trim: true }
    },

    verified: {
      property: { type: Boolean, default: false, index: true },
      location: { type: Boolean, default: false }
    },

    analytics: {
      views: { type: Number, default: 0 },
      favorites: { type: Number, default: 0 },
      calls: { type: Number, default: 0 },
      shares: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

propertySchema.index({ geo: "2dsphere" });
propertySchema.index({
  title: "text",
  "location.city": "text",
  "location.localArea": "text",
  "location.landmark": "text",
  "location.state": "text"
});

const Property = mongoose.model("Property", propertySchema);

module.exports = { Property };

