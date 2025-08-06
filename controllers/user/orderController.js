const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Order = require("../../models/orderSchema");

const orderPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.redirect("/login");
        }

        // Fetch user's orders
        const orders = await Order.find({ userId })
            .populate('items.productId')
            .sort({ createdAt: -1 }); // Most recent first

        return res.render("orderPage", {
            user: userId,
            orders: orders,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order page error:", error);
        res.status(500).send("Server error");
    }
};

const orderDetails = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;
        
        if (!userId) {
            return res.redirect("/login");
        }

        // Fetch specific order details
        const order = await Order.findOne({ _id: orderId, userId })
            .populate('items.productId');

        if (!order) {
            return res.status(404).send("Order not found");
        }

        return res.render("orderDetailsPage", {
            user: userId,
            order: order,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order details error:", error);
        res.status(500).send("Server error");
    }
};

module.exports = {
    orderPage,
    orderDetails
}