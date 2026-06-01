const mongoose = require("mongoose");

const contactedPropertySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    method: { type: String, enum: ["call", "whatsapp", "email"], default: "call", index: true }
  },
  { timestamps: true }
);

contactedPropertySchema.index({ user: 1, property: 1, method: 1 }, { unique: true });

const ContactedProperty = mongoose.model("ContactedProperty", contactedPropertySchema);

module.exports = { ContactedProperty };

