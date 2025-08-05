const express = require("express")
const router = express.Router()
const {userAuth} =require("../../middlewares/auth")
const showUserController = require("../../controllers/user/showUserController") 
const { profileUpload } = require("../../helpers/multerConfig")

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
    if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: "File size too large. Maximum 5MB allowed." });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ success: false, message: "Invalid file upload." });
        }
        if (err.message && err.message.includes('Only JPEG, PNG,  and WebP files are allowed')) {
            return res.status(400).json({ success: false, message: "Invalid file type. Only JPEG, PNG, GIF, and WebP files are allowed." });
        }
        return res.status(400).json({ success: false, message: err.message || "File upload error." });
    }
    next();
};

router.get("/",userAuth,showUserController.showUser)
router.get("/edit",userAuth,showUserController.loadEditProfile)
router.patch("/updateProfile",userAuth,profileUpload.single('profilePicture'),handleMulterError,showUserController.updateProfile)
router.get("/changePassword",userAuth,showUserController.loadChangePassword)
router.post("/change-password",userAuth,showUserController.changePassword)
router.post("/changeemail",userAuth,showUserController.chnageEmailValid)
router.post("/send-email-otp",userAuth,showUserController.sendEmailOTP)
router.post("/resend-email-otp",userAuth,showUserController.resendEmailOTP)
router.post("/verify-email-otp",userAuth,showUserController.verifyEmailOTP)


module.exports = router