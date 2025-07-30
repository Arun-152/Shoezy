const express = require("express")
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const wishlistController = require("../../controllers/user/wishlistController")

router.get("/",userAuth,wishlistController.loadWishlist)
router.post("/addToWishlist",wishlistController.addToWishlist)
router.patch("/removeWishlist",wishlistController.removeWishlist)




module.exports = router