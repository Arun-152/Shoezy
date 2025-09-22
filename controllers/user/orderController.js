const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema");
const generateInvoice = require("../../helpers/generateInvoice");
const Coupon = require("../../models/CouponSchema");


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

        // Track refund and determine scope
        let refundAmount = 0;
        // Consider active items only (not already cancelled)
        const activeItems = order.items.filter(it => it.status !== 'Cancelled');
        // Full cancellation if no itemsId provided OR provided list equals all active item ids
        const providedIds = itemsId
            ? Array.isArray(itemsId)
                ? itemsId.map(String)
                : [String(itemsId)]
            : [];
        const activeIds = activeItems.map(it => it._id.toString());
        const isProvidedFull = providedIds.length > 0 && providedIds.length === activeIds.length && providedIds.every(id => activeIds.includes(id));
        const fullCancellationRequested = !itemsId || isProvidedFull;

        // Compute proportional discount once (do not modify coupon fields)
        const originalSubtotal = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        let isFlatCoupon = false;
        let flatDiscountPerItem = 0;
        if (order.couponId) {
            try {
                const appliedCoupon = await Coupon.findById(order.couponId).select('discountType');
                if (appliedCoupon && appliedCoupon.discountType === 'flat') {
                    isFlatCoupon = true;
                    // Split the actual discount used on the order equally among all items (not quantity)
                    const itemsCount = order.items.length || 1;
                    flatDiscountPerItem = (order.discountAmount || 0) / itemsCount;
                }
            } catch (error) {
                console.error('DEBUG: Error fetching coupon:', error);
                isFlatCoupon = false;
            }
        } else {
        }
        // For percentage coupon, keep existing proportional logic
        const discountPercentage = (!isFlatCoupon && originalSubtotal > 0)
            ? (order.discountAmount / originalSubtotal)
            : 0;

        if (fullCancellationRequested) {
            refundAmount = activeItems.reduce((sum, item) => {
                if (isFlatCoupon) {
                    // For flat coupons, refund is item price minus the equally distributed flat discount per item
                    const itemRefund = item.price - flatDiscountPerItem;
                    return sum + itemRefund;
                } else {
                    // Existing logic for percentage coupons or no coupon
                    const itemTotal = item.price * item.quantity;
                    const itemDiscount = itemTotal * discountPercentage;
                    const net = order.couponCode ? (itemTotal - itemDiscount) : itemTotal;
                    return sum + net;
                }
            }, 0);
        } else {
            // Single item cancellation
            const targetId = providedIds[0];
            const itemToCancel = order.items.find(item => item._id.toString() === targetId);
            if (itemToCancel && itemToCancel.status !== 'Cancelled') {
                if (isFlatCoupon) {
                    // For flat coupons, refund is item price minus the equally distributed flat discount per item
                    refundAmount = itemToCancel.price - flatDiscountPerItem;
                } else {
                    // Existing logic for percentage coupons or no coupon
                    const itemTotal = itemToCancel.price * itemToCancel.quantity;
                    const itemDiscount = itemTotal * discountPercentage;
                    refundAmount = order.couponCode ? (itemTotal - itemDiscount) : itemTotal;
                }
            }
        }

        // Only credit wallet when Online payment
        if (order.paymentMethod === 'Online' && refundAmount > 0) {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = new Wallet({ userId, balance: 0, transactions: [] });
            }
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

        if (fullCancellationRequested) {
            // Cancel only active items
            for (const item of activeItems) {
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

            // If all items are now cancelled, update order status and set total to 0
            const allItemsCancelledAfter = order.items.every(it => it.status === 'Cancelled');
            if (allItemsCancelledAfter) {
                order.orderStatus = 'Cancelled';
                order.cancellationReason = reason;
                order.cancelledAt = new Date();
                order.statusHistory.push({
                    status: 'Cancelled',
                    date: new Date(),
                    description: `Order cancelled. Reason: ${reason}`
                });
                order.totalAmount = 0;
            } else {
                // Should not happen in a full request, but keep consistency
                order.statusHistory.push({
                    status: 'Cancelled',
                    date: new Date(),
                    description: `Some items cancelled. Reason: ${reason}`
                });
                // Reduce totalAmount by the refunded sum irrespective of payment method
                order.totalAmount = Math.max(0, (order.totalAmount || 0) - refundAmount);
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

                // Adjust order total to reflect the cancelled item's refund for all payment methods
                if (refundAmount > 0) {
                    order.totalAmount = Math.max(0, (order.totalAmount || 0) - refundAmount);
                }

                const allItemsCancelled = order.items.every(item => item.status === 'Cancelled');
                if (allItemsCancelled) {
                    order.orderStatus = 'Cancelled';
                    order.cancellationReason = 'All items cancelled';
                    order.totalAmount = 0; // everything cancelled
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

        // Coupon usage is not reset when an order is cancelled.
        // The coupon remains marked as 'Used' for the user.
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

        // Coupon usage is not reset when an order is returned.
        // The coupon remains marked as 'Used' for the user.
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
        // Coupon usage is not reset when an order item is returned.
        // The coupon remains marked as 'Used' for the user.
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
const placeOrderWithWallet = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { items, address, couponCode } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Step 1: Calculate total
    let totalAmount = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    let discountAmount = 0;
    let appliedCoupon = null;

    // Step 2: Apply coupon if available
    if (couponCode) {
      appliedCoupon = await Coupon.findOne({ name: couponCode.toUpperCase(), status: "Available" });

      if (appliedCoupon && totalAmount >= appliedCoupon.minimumPrice) {
        if (appliedCoupon.discountType === "flat") {
          discountAmount = appliedCoupon.offerPrice;
        } else if (appliedCoupon.discountType === "percentage") {
          discountAmount = (totalAmount * appliedCoupon.offerPrice) / 100;
        }
        totalAmount -= discountAmount;
      }
    }

    // Step 3: Check Wallet Balance
    let wallet = await Wallet.findOne({ userId });
    if (!wallet || wallet.balance < totalAmount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    // Step 4: Create Order
    const newOrder = new Order({
      orderNumber: "ORD" + Date.now(),
      userId,
      items: items.map(it => ({
        productId: it.productId,
        size: it.size || "Default",
        quantity: it.quantity,
        price: it.price,
        totalPrice: it.price * it.quantity
      })),
      address,
      totalAmount,
      paymentMethod: "Wallet",
      paymentStatus: "Paid",
      couponCode: appliedCoupon ? appliedCoupon.name : null,
      couponId: appliedCoupon ? appliedCoupon._id : null,
      discountAmount
    });

    await newOrder.save();

    // Step 5: Deduct Wallet Balance
    wallet.balance -= totalAmount;
    wallet.transactions.push({
      type: "debit",
      amount: totalAmount,
      description: `Payment for order ${newOrder.orderNumber}`,
      balanceAfter: wallet.balance,
      orderId: newOrder._id,
      source: "order_payment",
      metadata: {
        orderNumber: newOrder.orderNumber,
        paymentMethod: "Wallet"
      }
    });
    await wallet.save();

    // Step 6: Update coupon usage if applied
    if (appliedCoupon) {
      appliedCoupon.currentUsageCount += 1;
      appliedCoupon.userUsage.push({ userId, orderId: newOrder._id });
      appliedCoupon.status = "Used"; // Optional, if coupon is single-use
      await appliedCoupon.save();
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully using wallet",
      order: newOrder
    });

  } catch (error) {
    console.error("Error placing order with wallet:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
    orderPage,
    orderDetails,
    cancelOrder,
    returnOrder,
    getInvoice,
    returnSingleOrder,
    placeOrderWithWallet
};