const express = require("express")
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const wishlistController = require("../../controllers/user/wishlistController")

router.get("/",userAuth,wishlistController.loadWishlist)
router.post("/add",wishlistController.addToWishlist)
router.post("/remove",wishlistController.removeWishlist)
router.post("/toggle",wishlistController.toggleWishlist)
router.post("/clear",wishlistController.clearWishlist)
router.post("/add-to-cart",wishlistController.addToCartFromWishlist)





module.exports = router