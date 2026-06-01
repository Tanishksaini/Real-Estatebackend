function notFound(req, res, next) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(err, req, res, next) {
  const status = Number(err.statusCode || err.status || 500);
  const message = err.publicMessage || err.message || "Server error";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: message,
    details: err.details
  });
}

module.exports = { notFound, errorHandler };

