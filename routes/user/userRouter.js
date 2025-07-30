const express = require("express");
const router = express.Router();
const userController = require("../../controllers/user/userController");
const homepageController = require("../../controllers/user/homepageController");
const shopPageController = require("../../controllers/user/shopPageController");
const orderController = require("../../controllers/user/orderController");
const productController = require("../../controllers/user/productController");
const showuserController = require("../../controllers/user/showuserController");
const wishlistController = require("../../controllers/user/wishlistController")

const { userAuth } = require("../../middlewares/auth");
const passport = require("../../config/passport");


const cartRouter = require("./addToCartRouter")

const wishlistRouter = require("./wishlistRouter")


router.get("/", userController.landingPage);
router.get("/login", userController.loginPage);
router.get("/signup", userController.signupPage);
router.post("/signup", userController.postSignup);
router.get("/otpVerification", userController.otpVerification);
router.post("/verifyOtp", userController.verifyOTP);
router.post("/login", userController.postLogin);


router.get("/home", homepageController.homePage);
router.get("/logout", userController.logout);
router.get("/shop", shopPageController.shopPage);
router.get("/product/:id", productController.productDetailPage);
router.post("/resendOtp", userController.resendOTP);
router.get("/profile", userAuth, showuserController.showUser);



router.get("/order",userAuth, orderController.orderPage);
router.get("/userErrorPage", userController.userErrorPage);

// Forgot Password Routes
router.get("/forgotPassword", userController.forgotPasswordPage);
router.post("/forgotPassword", userController.postForgotPassword);
router.get("/verifyResetOtp", userController.verifyOTPPage);
router.post("/verifyResetOtp", userController.postVerifyOTP);
router.post("/resendResetOtp", userController.resendResetOTP);
router.get("/resetPassword", userController.resetPasswordPage);
router.post("/resetPassword", userController.postResetPassword);

router.use("/cart",cartRouter)
router.use("/wishlist",wishlistRouter)

module.exports = router;