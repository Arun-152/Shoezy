const express = require("express");
const router = express.Router();
const { adminAuth } = require("../../middlewares/auth")
const User = require("../../models/userSchema")
const Cart = require("../../models/cartSchema")
const Product = require("../../models/productSchema")
const Coupon = require("../../models/CouponSchema")
const couponController = require("../../controllers/admin/couponController")


router.get("/", adminAuth, couponController.couponPage);
router.get("/addcoupon",adminAuth,couponController.getCreateCoponPage)
router.post("/addcoupon",adminAuth,couponController.createCoupon)
router.get("/editCoupon",adminAuth,couponController.loadEditCoupon)
router.patch("/editCoupon",adminAuth,couponController.editCoupon)
router.patch("/deleteCoupon/:id",adminAuth,couponController.deleteCoupon)
router.patch("/list",adminAuth,couponController.couponToggle)
router.get("/:couponId/customers",adminAuth,couponController.getCustomers)



module.exports = router;