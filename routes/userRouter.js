const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const homepageController = require("../controllers/user/homepageController");
const shopPageController = require("../controllers/user/shoppageController");
const orderController = require("../controllers/user/orderController");
const productController = require("../controllers/user/productController");
const showuserController = require("../controllers/user/showuserController");
const { userAuth } = require("../middlewares/auth");
const passport = require("../config/passport");


router.get("/", userController.landingPage);
router.get("/login", userController.loginPage);
router.get("/signup", userController.signupPage);
router.post("/signup", userController.postSignup);
router.get("/otpverification", userController.otpverification);
router.post("/verify-otp", userController.verifyOTP);
router.post("/login", userController.postlogin);
router.get("/home", homepageController.homePage);
router.get("/logout", userController.logout);
router.get("/shop", shopPageController.shopPage);
router.get("/product/:id", productController.productDetailPage);
router.post("/resendotp", userController.resendOTP);
router.get("/profile", userAuth, showuserController.showuser);



router.get("/order", orderController.orderPage);
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