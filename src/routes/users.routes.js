const express = require("express");
const { z } = require("zod");

const { User } = require("../models/User");
const {
  hashPassword,
  verifyPassword,
  signJwt
} = require("../utils/auth");
const { validate } = require("../utils/validate");

const usersRouter = express.Router();

usersRouter.get("/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

// Auth endpoints as fallback routes
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

usersRouter.post("/signup", validate(signupSchema), async (req, res, next) => {
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

usersRouter.post("/login", validate(loginSchema), async (req, res, next) => {
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

    const token = signJwt(user);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

module.exports = { usersRouter };

