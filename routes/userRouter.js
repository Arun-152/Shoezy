const express = require("express")
const router = express.Router()
const userController=require("../controllers/user/userController")
const {userAuth,adminAuth}=require("../middlewares/auth")


router.get("/",userController.landingPage)
router.get("/login",userController.loginPage)
router.get("/signup",userController.signupPage)
router.post("/signup",userController.postSignup)
router.get("/otpverification",userController.otpverification)
router.post('/verify-otp', userController.verifyOTP)
router.post("/login",userController.postlogin)
router.get("/home",userAuth,userController.homePage)
router.get("/logout",userController.logout)
router.get("/shop",userController.shopPage)
router.get("/resendotp",userController.resendOTP)
router.get("/profile",userController.showuser)


module.exports = router