const express = require("express");
const router = express.Router();
const { userAuth } = require("../../middlewares/auth");
const addToCartController = require("../../controllers/user/addToCartController");



// addtocart management
router.get("/",userAuth,addToCartController.loadAddToCart);
router.post("/addTocart",userAuth,addToCartController.addToCart)


module.exports = router;