const express = require("express")
const router = express.Router()
const {userAuth} = require("../../middlewares/auth")
const couponController = require("../../controllers/user/couponController")

router.get("/",userAuth,couponController.loadCoupons)
router.post("/appliedCoupon",userAuth,couponController.applyCoupon)
router.patch("/removeCoupon",userAuth,couponController.removeCoupon)
router.get("/availableCoupons",userAuth,couponController.getAvailableCoupon)

module.exports = router