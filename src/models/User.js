const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: false },
    phone: { type: String, trim: true },
    profilePhotoUrl: { type: String, trim: true },
    isSellerVerified: { type: Boolean, default: false },
    passwordResetOtp: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false }
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone,
    avatar: this.profilePhotoUrl,
    profilePhotoUrl: this.profilePhotoUrl,
    role: 'user',
    verified: this.isSellerVerified,
    isSellerVerified: this.isSellerVerified,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model("User", userSchema);

module.exports = { User };

