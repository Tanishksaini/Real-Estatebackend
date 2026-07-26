const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, trim: true, index: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// Create a TTL index so MongoDB automatically deletes expired documents after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTP = mongoose.model("OTP", otpSchema);

module.exports = { OTP };
