const express = require("express");
const router = express.Router();
const { userAuth, adminAuth } = require("../../middlewares/auth");
const orderController = require("../../controllers/admin/orderController")





router.get("/", adminAuth, orderController.ordersPage);
router.patch("/:orderId/status", adminAuth, orderController.updateOrderStatus)

module.exports = router;