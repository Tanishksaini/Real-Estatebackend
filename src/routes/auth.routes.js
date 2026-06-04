const express = require("express");
const { z } = require("zod");

const { User } = require("../models/User");
const {
  hashPassword,
  verifyPassword,
  signJwt,
  generatePasswordResetOtp,
  hashPasswordResetOtp
} = require("../utils/auth");
const { sendPasswordResetOtp } = require("../utils/mail");
const { validate } = require("../utils/validate");

const authRouter = express.Router();

const passwordMatchRefine = (data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });
  }
};

const signupSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).optional(),
      email: z.string().trim().email(),
      password: z.string().min(6).max(72),
      confirmPassword: z.string().min(6).max(72),
      phone: z.string().trim().min(6).max(20).optional()
    })
    .superRefine(passwordMatchRefine)
});

authRouter.post("/signup", validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.validated.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({
      name,
      email,
      phone,
      passwordHash: await hashPassword(password)
    });

    const token = signJwt(user);
    return res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(72)
  })
});

authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signJwt(user);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().trim().email()
  })
});

authRouter.post("/forgot-password", validate(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.validated.body;
    const genericMessage = "If an account exists with this email, an OTP has been sent.";

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: genericMessage });
    }

    const { otp, hashed, expires } = generatePasswordResetOtp();
    user.passwordResetOtp = hashed;
    user.passwordResetExpires = expires;
 await user.save({ validateBeforeSave: false });

    await sendPasswordResetOtp(email, otp);

    const response = { message: genericMessage };
    if (process.env.PASSWORD_RESET_RETURN_OTP === "true") {
      response.otp = otp;
    }

    return res.json(response);
  } catch (err) {
    if (err.message && err.message.includes("EmailJS is not configured")) {
      return res.status(500).json({ error: "Email service is not configured" });
    }
    console.error("Forgot password email error:", err);
    return res.status(500).json({ error: "Failed to send OTP email. Please try again later." });
  }
});

const resetPasswordSchema = z.object({
  body: z
    .object({
      email: z.string().trim().email(),
      otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
      password: z.string().min(6).max(72),
      confirmPassword: z.string().min(6).max(72)
    })
    .superRefine(passwordMatchRefine)
});

authRouter.post("/reset-password", validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { email, otp, password } = req.validated.body;
    const hashedOtp = hashPasswordResetOtp(otp);

    const user = await User.findOne({
      email,
      passwordResetOtp: hashedOtp,
      passwordResetExpires: { $gt: new Date() }
    }).select("+passwordResetOtp +passwordResetExpires");

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    user.passwordHash = await hashPassword(password);
    user.passwordResetOtp = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const jwtToken = signJwt(user);
    return res.json({
      message: "Password reset successful",
      token: jwtToken,
      user: user.toSafeJSON()
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { authRouter };
