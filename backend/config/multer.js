const multer = require("multer");
const cloudinary = require("./cloudinary");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Use memory storage so we can upload buffer to Cloudinary.
// Accepts images, or encrypted image bytes (application/octet-stream) from the E2EE client.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith("image/") || file.mimetype === "application/octet-stream";
    cb(ok ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname), ok);
  },
});

// Encrypted images are opaque bytes, so they are stored as "raw" files;
// plain images (legacy clients) are stored as normal images.
const uploadBufferToCloudinary = (file, { encrypted }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: encrypted ? "raw" : "image", folder: "talkify" },
      (error, result) => (error ? reject(error) : resolve(result.secure_url || ""))
    );
    stream.end(file.buffer);
  });

module.exports = upload;
module.exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
