const express = require("express")
const router = express.Router()
const {userAuth} = require("../../middlewares/auth")
const walletController = require("../../controllers/user/walletController")


router.get("/",userAuth,walletController.getWalletPage)

module.exports = router;