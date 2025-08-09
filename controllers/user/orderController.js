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
        
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
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

        // 🔄 Restore stock for each product variant
        try {
            for (const item of order.items) {
                const product = await Product.findById(item.productId);
                if (product && product.variants) {
                    // Find the specific variant by size
                    const variant = product.variants.find(v => v.size === (item.size || "Default"));
                    if (variant) {
                        // Restore stock for this specific variant
                        variant.variantQuantity += item.quantity;
                        
                        // Update product status if it was out of stock
                        if (product.status === "out of stock") {
                            const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
                            if (totalStock > 0) {
                                product.status = "Available";
                            }
                        }
                        
                        await product.save();
                    }
                }
            }
        } catch (stockError) {
            console.error("Stock restoration error:", stockError);
            return res.status(500).json({ success: false, message: 'Error restoring stock' });
        }

        // Update order status to cancelled
        order.orderStatus = 'Cancelled';
        await order.save();

        return res.json({ 
            success: true, 
            message: 'Order cancelled successfully and stock restored.' 
        });

    } catch (error) {
        console.error('Cancel order error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

const returnOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId, productId, reason } = req.body;
    

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        let itemFound = false;

        order.items = order.items.map(item => {
            if (item.productId.toString() === productId && item.status === 'Delivered') {
                item.status = 'Returned';
                item.returnReason = reason; 
                item.returnDate = new Date();
                itemFound = true;
            }
            return item;
        });
        order.orderReturnReason = reason
        if (!itemFound) {
            return res.status(400).json({ success: false, message: "Product not eligible for return" });
        }

        await order.save(); 

        return res.status(200).json({ success: true, message: "Return request submitted successfully" });
    } catch (error) {
        console.error("Return Order Error:", error);
        return res.redirect("/usererrorPage");
    }
};


const getInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(orderId)
    const order = await Order.findById(orderId).populate("items.productId");
    console.log(order)
    if (!order) {
      return res.status(404).json({success:false,message:"Order not found"});
    }

    generateInvoice(order, res);
  } catch (error) {
    console.error("Invoice Generation Error:", error);
    res.status(500).json({success:false,message:"Internal server error"});
  }
}
module.exports = {
    orderPage,
    orderDetails,
    cancelOrder,
    returnOrder,
    getInvoice
   
};