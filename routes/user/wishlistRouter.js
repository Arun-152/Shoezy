const express = require("express")
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const wishlistController = require("../../controllers/user/wishlistController")

router.get("/",userAuth,wishlistController.loadWishlist)
router.post("/add",userAuth,wishlistController.addToWishlist)
router.post("/remove",userAuth,wishlistController.removeWishlist)
router.post("/toggle",userAuth,wishlistController.toggleWishlist)
router.post("/clear",userAuth,wishlistController.clearWishlist)
router.post("/add-to-cart",userAuth,wishlistController.addToCartFromWishlist)
router.post("/addToWishlist",wishlistController.addToWishlist) // Keep for backward compatibility
router.patch("/removeWishlist",wishlistController.removeWishlist) // Keep for backward compatibility




module.exports = router