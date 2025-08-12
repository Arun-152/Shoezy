const express = require("express");
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const addToCartController = require("../../controllers/user/addToCartController");

// Cart management routes
router.get("/", userAuth, addToCartController.loadAddToCart);
router.post("/add", addToCartController.addToCart);
router.post("/update-quantity", addToCartController.updateQuantity);
router.post("/remove", addToCartController.removeCart);
router.post("/clear" , addToCartController.clearCart);

module.exports = router;