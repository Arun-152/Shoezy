const mongoose = require("mongoose");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Order = require("../../models/orderSchema");
require("dotenv").config();

const ordersPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({})
      .populate("userId", "fullname email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("adminordersPage", {
      orders,
      currentPage: page,
      totalPages,
      totalOrders,
    });
  } catch (error) {
    console.error("Error rendering orders page:", error.message);
    res.redirect("/admin/adminErrorPage");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, reason } = req.body; // Destructure reason from body
    const orderId = req.params.orderId;

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing order ID" });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if order is locked (payment failed orders)
    if (order.isLocked) {
      return res.status(400).json({
        success: false,
        message: "Cannot update status for locked orders (payment failed). This order is protected from status changes.",
      });
    }

    // Check if order has payment-failed status
    if (order.orderStatus === "payment-failed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status for payment failed orders. These orders are locked for security.",
      });
    }

    // Check if online payment is pending or failed
    if (order.paymentMethod && order.paymentMethod.toLowerCase() === "online") {
      if (order.paymentStatus === "pending" || order.paymentStatus === "failed") {
        return res.status(400).json({
          success: false,
          message: `Cannot update status for orders with ${order.paymentStatus} online payment. Payment must be completed first.`,
        });
      }
    }

    // Check if order is already delivered
    if (order.orderStatus.toLowerCase() === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status for a delivered order",
      });
    }

    // Validate status
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled","Paid"];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    // For cancellation, ensure reason is provided
    if (status.toLowerCase() === "cancelled" && !reason) {
      return res.status(400).json({ success: false, message: "Cancellation reason is required" });
    }

    // Update order status
    order.orderStatus = status;

    // Update item statuses
    order.items.forEach((item) => {
      if (!["cancelled", "returned"].includes(item.status)) {
        item.status = status;
      }
    });

    // Handle delivered status
    if (status.toLowerCase() === "delivered") {
      order.paymentStatus = "Paid";
      order.deliveryDate = new Date();
    }

    // Handle cancellation
    if (status.toLowerCase() === "cancelled") {
      order.cancellationReason = reason;
    }

    // Add to status history
    order.statusHistory.push({
      status,
      date: new Date(),
      description: status.toLowerCase() === "cancelled" ? reason : undefined,
    });

    // Save the order
    await order.save();

    res.json({ success: true, message: "Status updated successfully" });
  } catch (error) {
    console.error("Error updating order status:", error.message);
    res.status(500).json({ success: false, message: "Server error updating status" });
  }
};

module.exports = {
  ordersPage,
  updateOrderStatus,
};