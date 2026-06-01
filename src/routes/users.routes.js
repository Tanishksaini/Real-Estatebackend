const express = require("express");

const { User } = require("../models/User");

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

module.exports = { usersRouter };

