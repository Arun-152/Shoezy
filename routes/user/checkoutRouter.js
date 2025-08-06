const express = require("express")
const router = express.Router()
const {userAuth} = require("../../middlewares/auth")
const checkoutController = require("../../controllers/user/checkoutController")


router.get("/",userAuth,checkoutController.loadCheckout)



module.exports = router