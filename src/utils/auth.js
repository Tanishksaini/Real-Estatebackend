const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const RESET_OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generatePasswordResetOtp() {
  const otp = String(crypto.randomInt(100000, 1000000));
  const hashed = hashPasswordResetOtp(otp);
  const expires = new Date(Date.now() + RESET_OTP_EXPIRY_MS);
  return { otp, hashed, expires };
}

function hashPasswordResetOtp(otp) {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signJwt(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET in environment");
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email
    },
    secret,
    { expiresIn }
  );
}

module.exports = {
  hashPassword,
  verifyPassword,
  signJwt,
  generatePasswordResetOtp,
  hashPasswordResetOtp
};

