const express = require("express");
const fs = require("fs");
const path = require("path");

const documentsRouter = express.Router();
const docsDir = path.resolve(process.cwd(), "documents");

// Helper to check if file exists and is within the docs directory to prevent path traversal
function getSafeFilePath(filename) {
  if (!filename) return null;
  // Resolve the full path
  const filePath = path.join(docsDir, filename);
  // Ensure that filePath starts with the directory path to prevent directory traversal
  if (!filePath.startsWith(docsDir)) {
    return null;
  }
  // Check if file exists and is indeed a file
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      return filePath;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// GET /api/documents - List all documents
documentsRouter.get("/", (req, res, next) => {
  try {
    if (!fs.existsSync(docsDir)) {
      return res.json({ documents: [] });
    }

    const files = fs.readdirSync(docsDir);
    const documents = [];

    for (const filename of files) {
      const filePath = path.join(docsDir, filename);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          // Construct file size
          const sizeBytes = stats.size;
          // Determine title
          const nameWithoutExt = path.parse(filename).name;
          
          // Construct URL
          const protocol = req.protocol;
          const host = req.get("host");
          const url = `${protocol}://${host}/api/documents/${encodeURIComponent(filename)}`;

          documents.push({
            name: nameWithoutExt,
            filename,
            size: sizeBytes,
            url
          });
        }
      } catch (err) {
        console.error(`Error reading doc ${filename}:`, err);
      }
    }

    return res.json({ documents });
  } catch (err) {
    return next(err);
  }
});

// GET /api/documents/:filename - Get a specific document
documentsRouter.get("/:filename", (req, res, next) => {
  try {
    const filename = req.params.filename;
    const safePath = getSafeFilePath(filename);

    if (!safePath) {
      return res.status(404).json({ error: "Document not found or invalid filename" });
    }

    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }

    return res.sendFile(safePath);
  } catch (err) {
    return next(err);
  }
});

module.exports = { documentsRouter };
