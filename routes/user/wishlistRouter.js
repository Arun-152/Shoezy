const express = require("express")
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const wishlistController = require("../../controllers/user/wishlistController")

router.get("/",userAuth,wishlistController.loadWishlist)
router.post("/add",wishlistController.addToWishlist)
router.patch("/remove",wishlistController.removeWishlist)
router.get("/status",userAuth,wishlistController.wishlistStatus)
router.post("/toggle",wishlistController.toggleWishlist)
router.patch("/clear",wishlistController.clearWishlist)
router.patch("/add-to-cart",wishlistController.addToCartFromWishlist)





module.exports = router