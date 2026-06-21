const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Configure cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a local file to Cloudinary and deletes the local file afterwards.
 * @param {string} localFilePath - Path to local file
 * @param {string} folder - Target folder on Cloudinary
 * @param {string} [resourceType] - 'image', 'video', 'raw', 'auto'
 * @returns {Promise<string>} The secure URL of the uploaded asset
 */
const uploadToCloudinary = async (localFilePath, folder = "properties", resourceType = "auto") => {
  try {
    if (!localFilePath) return null;

    // Check if file exists locally
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found at path: ${localFilePath}`);
    }

    const result = await cloudinary.uploader.upload(localFilePath, {
      folder: folder,
      resource_type: resourceType
    });

    // Delete local file after successful upload
    try {
      fs.unlinkSync(localFilePath);
    } catch (err) {
      console.error(`Failed to delete local file after upload: ${localFilePath}`, err);
    }

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    // Delete local file on failure to avoid leaking temporary files
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (err) {
      console.error(`Failed to delete local file on upload error cleanup: ${localFilePath}`, err);
    }
    throw error;
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary
};
