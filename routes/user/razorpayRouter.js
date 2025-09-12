const express = require("express")
const router = express.Router()
const {userAuth} = require("../../middlewares/auth")
const razorpayController = require("../../controllers/user/razorpayController")


router.post("/createOrder",userAuth,razorpayController.createOrder)
router.post("/verifyPayment",userAuth,razorpayController.verifyPayment)
// router.get("/failedPayment",userAuth,razorpayController.failedPayment)

module.exports = router