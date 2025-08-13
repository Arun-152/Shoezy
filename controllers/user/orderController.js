const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Order = require("../../models/orderSchema");
const generateInvoice = require("../../helpers/generateInvoice")

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

// Cancel order and restore stock
const cancelOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;
        const reason = req.body.reason
       

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        if (!orderId || orderId === 'null') {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.orderStatus === 'Cancelled') {
            return res.status(400).json({ success: false, message: 'Order already cancelled' });
        }

        if (order.orderStatus !== 'Pending') {
            return res.status(400).json({ success: false, message: 'Only pending orders can be cancelled' });
        }

        // Restore stock
        for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product && product.variants) {
                const variant = product.variants.find(v => v.size === (item.size || "Default"));
                if (variant) {
                    variant.variantQuantity += item.quantity;
                    if (product.status === "out of stock") {
                        const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
                        if (totalStock > 0) product.status = "Available";
                    }
                    await product.save();
                }
            }
        }

        // Update individual item statuses to 'Cancelled'
        order.items.forEach(item => {
            item.status = 'Cancelled';
        });

        // Update overall order status to 'Cancelled'
        order.orderStatus = 'Cancelled';
        order.cancellationReason = reason; 
        order.cancelledAt = new Date();

        // Add status history entry
        order.statusHistory.push({
            status: 'Cancelled',
            date: new Date(),
            description: `Order cancelled. Reason: ${reason}`
        });

        await order.save();

        return res.json({ success: true, message: 'Order cancelled successfully and stock restored.' });

    } catch (error) {
        console.error('Cancel order error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const returnOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;
        
        // Handle both single productId and multiple 
        let { productId,  reason} = req.body;
       
        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        

        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        let itemsFound = 0;
        let eligibleItems = 0;

        // Check eligibility first
        order.items.forEach(item => {
            const itemId = item.productId.toString();
            if (productId.includes(itemId)) {
                eligibleItems++;
                if (item.status === 'Delivered') {
                    itemsFound++;
                }
            }
        });

        if (eligibleItems === 0) {
            return res.status(400).json({ success: false, message: "Products not found in this order" });
        }

        if (itemsFound === 0) {
            return res.status(400).json({ success: false, message: "No items are eligible for return. Only delivered items can be returned." });
        }

        // Update items
        order.items = order.items.map(item => {
            const itemId = item.productId.toString();
            
            if (productId.includes(itemId) && item.status === 'Delivered') {
                item.status = 'ReturnRequested';
                item.returnReason = reason;
                item.returnDate = new Date();
            }
            return item;
        });

        // Set order return reason
        order.orderReturnReason = reason;

        // ✅ NEW LOGIC: Check if all items are ReturnApproved and update order status
        const allItemsReturnApproved = order.items.every(item => 
            item.status === 'ReturnApproved'
        );
        
        if (allItemsReturnApproved) {
            order.orderStatus = 'ReturnedApproved';
        } else {
            // Update order status for return requests
            const allItemsReturnRequested = order.items.every(item => 
                item.status === 'ReturnRequested' || item.status === 'ReturnApproved' || item.status === 'Cancelled'
            );
            
            if (allItemsReturnRequested) {
                order.orderStatus = 'ReturnRequested';
            }
        }

        await order.save();

        return res.status(200).json({ 
            success: true, 
            message: `Return request submitted successfully for ${itemsFound} item(s)` 
        });
    } catch (error) {
        console.error("Return Order Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};




const getInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId).populate("items.productId");
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        generateInvoice(order, res);
    } catch (error) {
        console.error("Invoice Generation Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}
module.exports = {
    orderPage,
    orderDetails,
    cancelOrder,
    returnOrder,
    getInvoice

};