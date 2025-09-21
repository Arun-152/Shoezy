const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema");
const generateInvoice = require("../../helpers/generateInvoice");

const orderPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.redirect("/login");
        }
        const user = await User.findById(userId);

        const orders = await Order.find({ userId })
            .populate('items.productId')
            .sort({ createdAt: -1 });

        return res.render("orderPage", {
            user: user,
            orders: orders,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order page error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const orderDetails = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;

        if (!userId) {
            return res.redirect("/login");
        }

        const order = await Order.findOne({ _id: orderId, userId })
            .populate('items.productId');

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        return res.render("orderDetailsPage", {
            user: userId,
            order: order,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order details error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId, itemsId, reason } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const order = await Order.findById(orderId).populate('items.productId');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        let refundAmount = 0;
        const isFullCancellation = !itemsId || itemsId.length === order.items.length;

        if (order.paymentMethod === 'Online') {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = new Wallet({ userId, balance: 0, transactions: [] });
            }

            if (isFullCancellation) {
                refundAmount = order.totalAmount;
            } else {
                const itemToCancel = order.items.find(item => item._id.toString() === itemsId);
                if (itemToCancel) {
                    if (order.couponCode) {
                        // Proportional refund
                        const discountPercentage = order.discountAmount / order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                        const itemTotal = itemToCancel.price * itemToCancel.quantity;
                        const itemDiscount = itemTotal * discountPercentage;
                        refundAmount = itemTotal - itemDiscount;
                    } else {
                        refundAmount = itemToCancel.price * itemToCancel.quantity;
                    }
                }
            }

            if (refundAmount > 0) {
                wallet.balance += refundAmount;
                wallet.transactions.push({
                    type: 'credit',
                    amount: refundAmount,
                    description: `Refund for order cancellation #${order.orderNumber}`,
                    balanceAfter: wallet.balance,
                    source: 'order_cancellation',
                    orderId: order._id,
                });
                await wallet.save();
            }
        }

        if (isFullCancellation) {
            order.orderStatus = 'Cancelled';
            order.cancellationReason = reason;
            order.cancelledAt = new Date();
            order.statusHistory.push({
                status: 'Cancelled',
                date: new Date(),
                description: `Order cancelled. Reason: ${reason}`
            });

            for (const item of order.items) {
                item.status = 'Cancelled';
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
        } else {
            const itemToCancel = order.items.id(itemsId);
            if (itemToCancel && ['Pending', 'Processing'].includes(itemToCancel.status)) {
                itemToCancel.status = 'Cancelled';

                const product = await Product.findById(itemToCancel.productId);
                if (product && product.variants) {
                    const variant = product.variants.find(v => v.size === (itemToCancel.size || "Default"));
                    if (variant) {
                        variant.variantQuantity += itemToCancel.quantity;
                        if (product.status === "out of stock") {
                            const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
                            if (totalStock > 0) product.status = "Available";
                        }
                        await product.save();
                    }
                }

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
            } else {
                return res.status(400).json({ success: false, message: 'Item cannot be cancelled' });
            }
        }

        await order.save();

        return res.json({ success: true, message: 'Order cancelled successfully.' });

    } catch (error) {
        console.error('Cancel order error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const returnOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = req.params.orderId;
        
        let { productId, reason } = req.body;
       
        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

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

        order.items = order.items.map(item => {
            const itemId = item.productId.toString();
            
            if (productId.includes(itemId) && item.status === 'Delivered') {
                item.status = 'ReturnRequested';
                item.returnReason = reason;
                item.returnDate = new Date();
            }
            return item;
        });

        order.orderReturnReason = reason;

        const allItemsReturnApproved = order.items.every(item => 
            item.status === 'ReturnApproved'
        );
        
        if (allItemsReturnApproved) {
            order.orderStatus = 'ReturnApproved';
        } else {
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
        itemIndex = order.items.findIndex(item => item._id.toString() === itemsId);
        if (itemIndex !== -1) {
            foundItem = order.items[itemIndex];
        }
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
        if (itemIndex === -1) {
            const mongoose = require('mongoose');
            try {
                const objectIdItemsId = new mongoose.Types.ObjectId(itemsId);
                itemIndex = order.items.findIndex(item => item._id.equals(objectIdItemsId));
                if (itemIndex !== -1) {
                    foundItem = order.items[itemIndex];
                }
            } catch (e) {
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
        if (item.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered items can be returned'
            });
        }
        if (['ReturnRequested', 'Returned', 'ReturnApproved'].includes(item.status)) {
            return res.status(400).json({
                success: false,
                message: 'This item is already in the return process'
            });
        }
        order.items[itemIndex].status = 'ReturnRequested';
        
        order.items[itemIndex].returnReason = reason;
        
        order.items[itemIndex].returnRequestDate = new Date();
        order.statusHistory.push({
            status: 'ReturnRequested',
            date: new Date(),
            description: `Return requested for ${item.productId.productName}. Reason: ${reason}`
        });
        
       
        const totalItems = order.items.length;
        
        const allStatuses = order.items.map(item => item.status);
        const uniqueStatuses = [...new Set(allStatuses)];
        
        let newOrderStatus = order.orderStatus;
        let statusDescription = '';
        
      
        if (uniqueStatuses.length === 1) {
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
            
            if (itemCounts.cancelled > 0 && itemCounts.cancelled === totalItems) {
                newOrderStatus = 'Cancelled';
                statusDescription = 'All order items have been cancelled';
            } else if (itemCounts.returned > 0 && (itemCounts.returned + itemCounts.cancelled) === totalItems) {
                newOrderStatus = 'Returned';
                statusDescription = `All active order items have been returned`;
            } else if (itemCounts.delivered > 0) {
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

module.exports = {
    orderPage,
    orderDetails,
    cancelOrder,
    returnOrder,
    getInvoice,
    returnSingleOrder,
};