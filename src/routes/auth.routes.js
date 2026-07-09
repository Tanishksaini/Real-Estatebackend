const express = require("express");
const { z } = require("zod");

const { User } = require("../models/User");
const {
  hashPassword,
  verifyPassword,
  signJwt,
  generatePasswordResetOtp,
  hashPasswordResetOtp,
  generateEmailVerificationOtp,
  hashEmailVerificationOtp
} = require("../utils/auth");
const { sendPasswordResetOtp, sendEmailVerificationOtp } = require("../utils/mail");
const { validate } = require("../utils/validate");
const { OAuth2Client } = require("google-auth-library");

const authRouter = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


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

const handleSignup = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.validated.body;
    const emailLower = email.toLowerCase();

    let user = await User.findOne({ email: emailLower });

    if (user && user.isEmailVerified) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const { otp, hashed, expires } = generateEmailVerificationOtp();
    const passwordHash = await hashPassword(password);

    if (user) {
      user.name = name;
      user.phone = phone;
      user.passwordHash = passwordHash;
      user.emailVerificationOtp = hashed;
      user.emailVerificationExpires = expires;
      await user.save();
    } else {
      user = await User.create({
        name,
        email: emailLower,
        phone,
        passwordHash,
        isEmailVerified: false,
        emailVerificationOtp: hashed,
        emailVerificationExpires: expires
      });
    }

    try {
      await sendEmailVerificationOtp(emailLower, otp);
    } catch (mailErr) {
      console.error("Failed to send verification email:", mailErr);
      return res.status(500).json({ error: "Failed to send verification email. Please try again." });
    }

    const response = {
      message: "Verification OTP sent to your email. Please verify to complete registration.",
      email: emailLower
    };

    if (process.env.SIGNUP_RETURN_OTP === "true") {
      response.otp = otp;
    }

    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
};

authRouter.post("/signup", validate(signupSchema), handleSignup);
authRouter.post("/register", validate(signupSchema), handleSignup);

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

    if (!user.passwordHash) {
      return res.status(400).json({
        error: "This account was registered using Google. Please log in using Google."
      });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    // Auto-migrate legacy users who don't have isEmailVerified set
    if (user.isEmailVerified === undefined) {
      user.isEmailVerified = true;
      await user.save({ validateBeforeSave: false });
    }

    if (user.isEmailVerified === false) {
      return res.status(400).json({
        error: "Email is not verified. Please verify your email first."
      });
    }

    const token = signJwt(user);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

const googleLoginSchema = z.object({
  body: z.object({
    idToken: z.string().trim().optional(),
    token: z.string().trim().optional(),
    credential: z.string().trim().optional()
  })
});

authRouter.post("/google", validate(googleLoginSchema), async (req, res, next) => {
  try {
    const { idToken: bodyIdToken, token: bodyToken, credential } = req.validated.body;
    let idToken = bodyIdToken || bodyToken || credential;

    // Try to extract from Authorization header if not found in body
    if (!idToken && req.headers.authorization) {
      const auth = req.headers.authorization;
      if (auth.toLowerCase().startsWith("bearer ")) {
        idToken = auth.substring(7);
      } else {
        idToken = auth;
      }
    }

    if (!idToken || !idToken.trim()) {
      return res.status(400).json({ error: "Google ID Token is required (send via idToken, token, credential in body, or Authorization header)" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({ error: "Google Authentication is not configured on the server." });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error("Google token verification failed:", err);
      return res.status(401).json({ error: "Invalid Google ID Token" });
    }

    const { email, name, picture, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({ error: "Google email is not verified" });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      user = await User.create({
        name: name || email.split("@")[0],
        email: email.toLowerCase(),
        profilePhotoUrl: picture,
        isSellerVerified: false,
        isEmailVerified: true
      });
    } else {
      let changed = false;
      if (!user.profilePhotoUrl && picture) {
        user.profilePhotoUrl = picture;
        changed = true;
      }
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }

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
    if (err.message && err.message.includes("is not configured")) {
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

const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits")
  })
});

authRouter.post("/verify-email", validate(verifyEmailSchema), async (req, res, next) => {
  try {
    const { email, otp } = req.validated.body;
    const emailLower = email.toLowerCase();
    const hashedOtp = hashEmailVerificationOtp(otp);

    const user = await User.findOne({
      email: emailLower,
      emailVerificationOtp: hashedOtp,
      emailVerificationExpires: { $gt: new Date() }
    }).select("+emailVerificationOtp +emailVerificationExpires");

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    user.isEmailVerified = true;
    user.emailVerificationOtp = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    const jwtToken = signJwt(user);
    return res.json({
      message: "Email verification successful",
      token: jwtToken,
      user: user.toSafeJSON()
    });
  } catch (err) {
    return next(err);
  }
});

const resendVerificationSchema = z.object({
  body: z.object({
    email: z.string().trim().email()
  })
});

authRouter.post("/resend-verification-otp", validate(resendVerificationSchema), async (req, res, next) => {
  try {
    const { email } = req.validated.body;
    const emailLower = email.toLowerCase();

    const user = await User.findOne({ email: emailLower });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    const { otp, hashed, expires } = generateEmailVerificationOtp();
    user.emailVerificationOtp = hashed;
    user.emailVerificationExpires = expires;
    await user.save();

    try {
      await sendEmailVerificationOtp(emailLower, otp);
    } catch (mailErr) {
      console.error("Failed to send verification email:", mailErr);
      return res.status(500).json({ error: "Failed to send verification email. Please try again." });
    }

    const response = {
      message: "Verification OTP resent to your email.",
      email: emailLower
    };

    if (process.env.SIGNUP_RETURN_OTP === "true") {
      response.otp = otp;
    }

    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

module.exports = { authRouter };
