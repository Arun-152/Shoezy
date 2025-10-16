const express = require("express");
const router = express.Router();
const userController = require("../../controllers/user/userController");
const homepageController = require("../../controllers/user/homepageController");
const shopPageController = require("../../controllers/user/shopPageController");
const orderController = require("../../controllers/user/orderController");
const productController = require("../../controllers/user/productController")
const referralController = require("../../controllers/user/referralController")

const { userAuth } = require("../../middlewares/auth");
const passport = require("../../config/passport");

const authRouter = require("./authRouter")

const cartRouter = require("./addToCartRouter")

const wishlistRouter = require("./wishlistRouter")

const profileRouter = require("./profileRouter")

const checkoutRouter = require("./checkoutRouter")
const walletRouter = require("./walletRouter")

const couponRouter = require("./couponRouter")

const razorpayRouter = require("./razorpayRouter")




router.get("/login", userController.loginPage);
router.get("/signup", userController.signupPage);
router.post("/signup",userController.postSignup);
router.get("/otpVerification", userController.otpVerification);
router.post("/verifyOtp", userController.verifyOTP);
router.post("/login", userController.userPostLogin);

router.get("/", homepageController.homePage);
router.get("/home", homepageController.homePage);
router.get("/logout", userController.logout);
router.get("/shop",shopPageController.shopPage);
router.get("/product/:id", userAuth,productController.productDetailPage);
router.post("/resendOtp", userController.resendOTP);


// oredr router

router.get("/order",userAuth, orderController.orderPage);
router.get("/order/:orderId",userAuth, orderController.orderDetails);
router.post("/order/cancel",userAuth, orderController.cancelOrder);
router.get("/userErrorPage", userAuth,userController.userErrorPage)
router.patch("/order/:orderId/return", userAuth, orderController.returnOrder);
router.get("/order/:orderId/invoice",userAuth,orderController.getInvoice)
router.post('/order/individualOrderReturn',userAuth,orderController.returnSingleOrder)
router.post("/wallet-order", userAuth, orderController. placeOrderWithWallet)


// Forgot Password Routes
router.get("/forgot-password", userController.forgotPasswordPage);
router.post("/forgot-password", userController.sendResetLink);
router.get("/verifyResetOtp", userController.verifyOTPPage);
router.post("/verifyResetOtp", userController.postVerifyOTP);
router.post("/resendResetOtp", userController.resendResetOTP);
router.get("/reset-password", userController.resetPasswordPage);
router.post("/reset-password", userController.postResetPassword);

//referrral code

router.get("/referral",userAuth,referralController.getReferralPage)




// Contact page route
router.get("/contact",userController.getContactPage);

// About page route
router.get("/about",userController.getAboutPage);

router.use("/auth",authRouter)
router.use("/cart",cartRouter)
router.use("/wishlist",wishlistRouter)
router.use("/profile",profileRouter)
router.use("/checkout",checkoutRouter)
router.use("/wallet",walletRouter)
router.use("/coupon",couponRouter)
router.use("/payment",razorpayRouter)

module.exports = router;