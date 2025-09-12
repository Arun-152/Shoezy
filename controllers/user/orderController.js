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
        const user = await User.findById(userId)
    

        // Fetch user's orders
        const orders = await Order.find({ userId })
            .populate('items.productId')
            .sort({ createdAt: -1 }); // Most recent first

        return res.render("orderPage", {
            user: user,
            orders: orders,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order page error:", error);
        res.status(500).json({success:false,message:"Server error"});
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
            return res.status(404).json({success:false,message:"Order not found"});
        }

        return res.render("orderDetailsPage", {
            user: userId,
            order: order,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order details error:", error);
        return res.status(500).json({success:false,message:"Server error"});
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
        let { productId, reason } = req.body;
       
        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        // Ensure productId is always an array
        if (typeof productId === 'string') {
            productId = [productId];
        }
        
        if (!Array.isArray(productId) || productId.length === 0) {
            return res.status(400).json({ success: false, message: "No products specified for return" });
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

        const allItemsReturnApproved = order.items.every(item => 
            item.status === 'ReturnApproved'
        );
        
        if (allItemsReturnApproved) {
            order.orderStatus = 'ReturnApproved';
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
        if (order.orderStatus === "Cancelled") {
            res.redirect("/usererrorPage")
        }
    } catch (error) {
        console.error("Invoice Generation Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}


const returnSingleOrder = async (req, res) => {
    try {
        const { orderId, itemsId, reason } = req.body;
        
        let userId = req.session?.user?.id || 
                    req.session?.user?._id || 
                    req.user?.id || 
                    req.user?._id ||
                    req.session?.userId ||
                    req.userId;
        // Validate required fields
        if (!orderId || !itemsId || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Order ID, Items ID, and reason are required'
            });
        }
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please log in again.'
            });
        }
        // Find the order
        const order = await Order.findOne({
            _id: orderId,
            $or: [
                { userId: userId },
                { user: userId },
                { customerId: userId }
            ]
        }).populate('items.productId');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or access denied'
            });
        }
        let itemIndex = -1;
        let foundItem = null;
        // Strategy 1: Direct string comparison
        itemIndex = order.items.findIndex(item => item._id.toString() === itemsId);
        if (itemIndex !== -1) {
            foundItem = order.items[itemIndex];
        }
        // Strategy 2: Try without toString()
        if (itemIndex === -1) {
            itemIndex = order.items.findIndex(item => item._id == itemsId);
            if (itemIndex !== -1) {
                foundItem = order.items[itemIndex];
            }
        }
        if (itemIndex === -1) {
            itemIndex = order.items.findIndex(item => item.productId?._id?.toString() === itemsId);
            if (itemIndex !== -1) {
                foundItem = order.items[itemIndex];
            }
        }
        // Strategy 4: Try with ObjectId conversion
        if (itemIndex === -1) {
            const mongoose = require('mongoose');
            try {
                const objectIdItemsId = new mongoose.Types.ObjectId(itemsId);
                itemIndex = order.items.findIndex(item => item._id.equals(objectIdItemsId));
                if (itemIndex !== -1) {
                    foundItem = order.items[itemIndex];
                }
            } catch (e) {
                // ObjectId conversion failed, continue
            }
        }
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in this order',
                debug: {
                    searchingFor: itemsId,
                    availableItems: order.items.map(item => ({
                        itemId: item._id.toString(),
                        productId: item.productId?._id?.toString(),
                        status: item.status
                    }))
                }
            });
        }
        const item = foundItem;
        // Check if the item is delivered
        if (item.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered items can be returned'
            });
        }
        // Check if item is already in return process
        if (['ReturnRequested', 'Returned', 'ReturnApproved'].includes(item.status)) {
            return res.status(400).json({
                success: false,
                message: 'This item is already in the return process'
            });
        }
        // Update the specific item status to 'ReturnRequested'
        order.items[itemIndex].status = 'ReturnRequested';
        
        // Store return reason in the item
        order.items[itemIndex].returnReason = reason;
        
        // Store return request date
        order.items[itemIndex].returnRequestDate = new Date();
        // Add to status history
        order.statusHistory.push({
            status: 'ReturnRequested',
            date: new Date(),
            description: `Return requested for ${item.productId.productName}. Reason: ${reason}`
        });
        
       
        const totalItems = order.items.length;
        
        // Get all unique statuses in the order
        const allStatuses = order.items.map(item => item.status);
        const uniqueStatuses = [...new Set(allStatuses)];
        
        let newOrderStatus = order.orderStatus;
        let statusDescription = '';
        
      
        if (uniqueStatuses.length === 1) {
            // All items have the same status
            const singleStatus = uniqueStatuses[0];
            switch (singleStatus) {
                case 'Returned':
                    newOrderStatus = 'Returned';
                    statusDescription = totalItems === 1 ? 'Order item has been returned' : 'All order items have been returned';
                    break;
                case 'ReturnApproved':
                    newOrderStatus = 'ReturnApproved';
                    statusDescription = totalItems === 1 ? 'Return approved for order item' : 'Return approved for all order items';
                    break;
                case 'ReturnRequested':
                    newOrderStatus = 'ReturnRequested';
                    statusDescription = totalItems === 1 ? 'Return requested for order item' : `Return requested for all ${totalItems} items`;
                    break;
                case 'Cancelled':
                    newOrderStatus = 'Cancelled';
                    statusDescription = totalItems === 1 ? 'Order item has been cancelled' : 'All order items have been cancelled';
                    break;
                case 'Delivered':
                    newOrderStatus = 'Delivered';
                    statusDescription = totalItems === 1 ? 'Order item has been delivered' : 'All order items have been delivered';
                    break;
                case 'Shipped':
                    newOrderStatus = 'Shipped';
                    statusDescription = totalItems === 1 ? 'Order item has been shipped' : 'All order items have been shipped';
                    break;
                case 'Processing':
                    newOrderStatus = 'Processing';
                    statusDescription = totalItems === 1 ? 'Order item is being processed' : 'All order items are being processed';
                    break;
                case 'Pending':
                    newOrderStatus = 'Pending';
                    statusDescription = totalItems === 1 ? 'Order item is pending' : 'All order items are pending';
                    break;
            }
        } else {
            const itemCounts = {
                returned: allStatuses.filter(status => status === 'Returned').length,
                returnApproved: allStatuses.filter(status => status === 'ReturnApproved').length,
                returnRequested: allStatuses.filter(status => status === 'ReturnRequested').length,
                cancelled: allStatuses.filter(status => status === 'Cancelled').length,
                delivered: allStatuses.filter(status => status === 'Delivered').length,
                shipped: allStatuses.filter(status => status === 'Shipped').length,
                processing: allStatuses.filter(status => status === 'Processing').length,
                pending: allStatuses.filter(status => status === 'Pending').length
            };
            
            // Priority order: Cancelled > Returned > ReturnApproved > ReturnRequested > Delivered > Shipped > Processing > Pending
            if (itemCounts.cancelled > 0 && itemCounts.cancelled === totalItems) {
                newOrderStatus = 'Cancelled';
                statusDescription = 'All order items have been cancelled';
            } else if (itemCounts.returned > 0 && (itemCounts.returned + itemCounts.cancelled) === totalItems) {
                newOrderStatus = 'Returned';
                statusDescription = `All active order items have been returned`;
            } else if (itemCounts.delivered > 0) {
                // If any items are still delivered, keep order as delivered with description of return status
                const returnItems = itemCounts.returned + itemCounts.returnApproved + itemCounts.returnRequested;
                if (returnItems > 0) {
                    newOrderStatus = 'Delivered';
                    statusDescription = `Order partially in return process (${returnItems}/${totalItems} items)`;
                } else {
                    newOrderStatus = 'Delivered';
                    statusDescription = 'Order contains delivered items';
                }
            } else if (itemCounts.shipped > 0) {
                newOrderStatus = 'Shipped';
                statusDescription = 'Order contains shipped items';
            } else if (itemCounts.processing > 0) {
                newOrderStatus = 'Processing';
                statusDescription = 'Order contains processing items';
            } else if (itemCounts.pending > 0) {
                newOrderStatus = 'Pending';
                statusDescription = 'Order contains pending items';
            } else {
                // Fallback to return-related statuses
                if (itemCounts.returned > 0) {
                    newOrderStatus = 'Returned';
                    statusDescription = `${itemCounts.returned}/${totalItems} items returned`;
                } else if (itemCounts.returnApproved > 0) {
                    newOrderStatus = 'ReturnApproved';
                    statusDescription = `${itemCounts.returnApproved}/${totalItems} items return approved`;
                } else if (itemCounts.returnRequested > 0) {
                    newOrderStatus = 'ReturnRequested';
                    statusDescription = `${itemCounts.returnRequested}/${totalItems} items return requested`;
                }
            }
        }
        
        // Update order status if it has changed
        if (order.orderStatus !== newOrderStatus) {
            order.orderStatus = newOrderStatus;
            order.statusHistory.push({
                status: newOrderStatus,
                date: new Date(),
                description: statusDescription
            });
        }
        await order.save();
        res.json({
            success: true,
            message: 'Return request submitted successfully. We will process it within 24 hours.',
            itemStatus: 'ReturnRequested',
            orderStatus: order.orderStatus
        });
    } catch (error) {
        console.error('Return single order error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.',
            error: error.message
        });
    }
};



// Cancel entire order
const cancelSingleOrder = async (req, res) => {
    try {
        const { orderId, itemsId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the specific item to cancel using itemsId
        const itemToCancel = order.items.id(itemsId);
        
        if (!itemToCancel) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in order'
            });
        }

        // Check if item can be cancelled
        if (!['Pending', 'Processing'].includes(itemToCancel.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel item with status: ${itemToCancel.status}`
            });
        }

      
        const product = await Product.findById(itemToCancel.productId);
        if (product && product.variants) {
            const variant = product.variants.find(v => v.size === (itemToCancel.size || "Default"));
            if (variant) {
                variant.variantQuantity += itemToCancel.quantity; 
                if (product.status === "out of stock") {
                    const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
                    if (totalStock > 0) {
                        product.status = "Available";
                    }
                }
                await product.save();
            }
        }

        itemToCancel.status = 'Cancelled';

        const allItemsCancelled = order.items.every(item => item.status === 'Cancelled');
        if (allItemsCancelled) {
            order.orderStatus = 'Cancelled';
            order.cancellationReason = 'All items cancelled';
        }

        order.statusHistory.push({
            status: 'Cancelled',
            date: new Date(),
            description: `Item cancelled. Reason: ${reason || 'Item cancelled by customer'}`
        });

        await order.save();

        res.status(200).json({
            success: true,
            message: 'Item cancelled successfully',
            order: order
        });

    } catch (error) {
        console.error('Cancel item error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while cancelling item'
        });
    }
};





module.exports = {
    orderPage,
    orderDetails,
    cancelOrder,
    returnOrder,
    getInvoice,
    returnSingleOrder,
    cancelSingleOrder

};