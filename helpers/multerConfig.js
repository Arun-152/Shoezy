const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directories if they don't exist
const uploadsDir = path.join(__dirname, '../public/uploads/products');
const profileUploadsDir = path.join(__dirname, '../public/uploads/profiles');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(profileUploadsDir)) {
  fs.mkdirSync(profileUploadsDir, { recursive: true });
}

// Product image storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Profile image storage configuration
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, profileUploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Product upload configuration
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 3 // Max 3 files
  },
  fileFilter: function (req, file, cb) {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Profile upload configuration
const profileUpload = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Single file for profile
  },
  fileFilter: function (req, file, cb) {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP files are allowed!'), false);
    }
  }
});

module.exports = { upload, profileUpload };