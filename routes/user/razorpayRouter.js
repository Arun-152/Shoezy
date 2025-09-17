const express = require("express")
const router = express.Router()
const {userAuth} = require("../../middlewares/auth")
const razorpayController = require("../../controllers/user/razorpayController")


router.post("/createOrder",userAuth,razorpayController.createOrder)
router.post("/verifyPayment",userAuth,razorpayController.verifyPayment)
router.get("/orderFailed/:orderId",userAuth,razorpayController.paymentFailed)

module.exports = router