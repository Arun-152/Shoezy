const express = require("express")
const router = express.Router()
const {userAuth} = require("../../middlewares/auth")
const checkoutController = require("../../controllers/user/checkoutController")


router.get("/",userAuth,checkoutController.loadCheckout)
router.post("/orderSuccess",userAuth,checkoutController.placeOrder)
router.get("/orderSuccess",userAuth,checkoutController.orderSuccess)



module.exports = router