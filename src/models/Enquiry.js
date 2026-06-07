const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    phone: { type: String, trim: true },
    message: { type: String, trim: true, required: true },
    status: { type: String, enum: ["pending", "contacted", "closed"], default: "pending", index: true }
  },
  { timestamps: true }
);

enquirySchema.index({ property: 1, createdAt: -1 });
enquirySchema.index({ user: 1, createdAt: -1 });

const Enquiry = mongoose.model("Enquiry", enquirySchema);

module.exports = { Enquiry };
