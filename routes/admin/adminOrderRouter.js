const express = require("express");
const router = express.Router();
const { adminAuth } = require("../../middlewares/auth");
const orderController = require("../../controllers/admin/orderController");

router.get("/", adminAuth, orderController.ordersPage);
router.get("/orderDetails/:orderId", adminAuth, orderController.orderDetails);
router.patch("/:orderId/status", adminAuth, orderController.updateOrderStatus);
router.get("/returnRequests", adminAuth, orderController.viewReturnRequests)
router.patch("/approve-return/:orderId/:productId", adminAuth, orderController.approveReturnRequest);
router.patch("/reject-return/:orderId/:productId", adminAuth, orderController.rejectReturnRequest);



module.exports = router;
