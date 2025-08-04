const express = require("express");
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const addToCartController = require("../../controllers/user/addToCartController");

// Cart management routes
router.get("/", userAuth, addToCartController.loadAddToCart);
router.post("/add", userAuth, addToCartController.addToCart);
router.post("/addToCart", userAuth, addToCartController.addToCart); // Alternative route for shop page
router.post("/update-quantity", userAuth, addToCartController.updateQuantity);
router.post("/remove", userAuth, addToCartController.removeCart);
router.post("/clear", userAuth, addToCartController.clearCart);

module.exports = router;