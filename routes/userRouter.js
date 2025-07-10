const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const { userAuth } = require("../middlewares/auth");

router.get("/", userController.landingPage);
router.get("/login", userController.loginPage);
router.get("/signup", userController.signupPage);
router.post("/signup", userController.postSignup);
router.get("/otpverification", userController.otpverification);
router.post("/verify-otp", userController.verifyOTP);
router.post("/login", userController.postlogin);
router.get("/home", userAuth, userController.homePage);
router.get("/logout", userController.logout);
router.get("/shop", userController.shopPage);
router.post("/resendotp", userController.resendOTP);
router.get("/profile", userAuth, userController.showuser);
router.get("/usererrorPage", userController.usererrorPage);

// Forgot Password Routes
router.get("/forgot-password", userController.forgotPasswordPage);
router.post("/forgot-password", userController.postForgotPassword);
router.get("/verify-reset-otp", userController.verifyOTPPage);
router.post("/verify-reset-otp", userController.postVerifyOTP);
router.post("/resend-reset-otp", userController.resendResetOTP);
router.get("/reset-password", userController.resetPasswordPage);
router.post("/reset-password", userController.postResetPassword);

module.exports = router;