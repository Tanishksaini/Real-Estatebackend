const { ZodError } = require("zod");

function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      req.validated = parsed;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message
          }))
        });
      }
      return next(err);
    }
  };
}

module.exports = { validate };

