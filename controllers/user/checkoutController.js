const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/CouponSchema");
const Wallet = require("../../models/walletSchema");
const { validateCouponForCheckout, markCouponUsed, removeCoupon } = require('./couponController'); 
const bcrypt = require("bcrypt");
const env = require("dotenv").config();

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      populate: { path: 'category' }
    });

    if (!cart || cart.items.length === 0) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/cart');
    }

    const defaultAddress = await Address.findOne({ userId, isDefault: true });
    const allAddresses = await Address.find({ userId });
    let subtotal = 0;
    let totalItems = 0;
    let allItems = [];

    for (const item of cart.items) {
      const product = item.productId;
      const isAvailable = product && !product.isDeleted && !product.isBlocked && product.category && !product.category.isDeleted && product.category.isListed;

      if (!product || product.isDeleted || product.isBlocked || !product.category || product.category.isDeleted || !product.category.isListed) {
        allItems.push({ ...item.toObject(), isAvailable: false, price: 0, totalPrice: 0 });
        continue;
      }

      const variant = product.variants.find(v => v.size === item.size);
      const price = variant ? (variant.salePrice || variant.regularPrice) : 0;
      const totalPrice = price * item.quantity;
      subtotal += totalPrice;
      totalItems += item.quantity;
      allItems.push({ ...item.toObject(), isAvailable: true, price, totalPrice });
    }
    const shipping = 0;

    // Clear any previously applied coupon when loading the checkout page
    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
    }

    const currentDate = new Date();

    const userUsedCoupons = await Coupon.find({ 'userUsage.userId': userId }).select('_id');
    const usedCouponIds = userUsedCoupons.map(c => c._id);

    const availableCoupons = await Coupon.find({
      _id: { $nin: usedCouponIds },
      islist: true,
      startDate: { $lte: currentDate }, 
      expireOn: { $gte: currentDate },
      $expr: { $lt: [ "$currentUsageCount", "$totalUsageLimit" ] }
    }).sort({ expireOn: 1 });

    const allCoupons = availableCoupons.filter(coupon => {
        return !coupon.userUsage.some(usage => usage.userId.toString() === userId);
    });
    
    let finalTotal = subtotal + shipping;
    let couponDiscount = 0;
    
    const userWallet = await Wallet.findOne({ userId });

    res.render('checkoutPage', {
      user,
      cartItems: cart.items,
      allItems,
      subtotal,
      totalItems,
      shipping,
      totalAmount: finalTotal,
      defaultAddress,
      allAddresses,
      coupon: allCoupons,
      appliedCoupon: null, 
      couponDiscount, 
      cart: { total: finalTotal },
      walletBalance: userWallet ? userWallet.balance : 0
    });

  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { selectedAddress, payment } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!selectedAddress || !payment) {
      return res.status(400).json({
        success: false,
        showAlert: true,
        alertType: "warning",
        alertMessage: "Please select a delivery address and payment method"
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      populate: { path: 'category' }
    });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Final validation before placing the order
    const hasUnavailableItem = cart.items.some(item => {
      const product = item.productId;
      return !product || product.isDeleted || product.isBlocked || !product.category || product.category.isDeleted || !product.category.isListed;
    });

    if (hasUnavailableItem) {
      return res.status(400).json({
        success: false, showAlert: true, alertType: "error",
        alertMessage: "Some products in your cart are unavailable or blocked. Please review your cart before checkout."
      });
    }
    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.isDeleted || product.isBlocked || !product.category || product.category.isDeleted || !product.category.isListed) {
        return res.status(400).json({
          success: false,
          showAlert: true,
          alertType: "error",
          alertMessage: "Some products in your cart are unavailable or blocked. Please review your cart before checkout."
        });
      }
    }
  // order calculation
    const orderItems = [];
    let totalAmount = 0;

    for (const item of cart.items) {
      const product = item.productId;
      const variant = product.variants.find(v => v.size === item.size);
      const price = variant.salePrice || variant.regularPrice;
      const totalPrice = price * item.quantity;

      totalAmount += totalPrice;
      orderItems.push({
        productId: product._id,
        size: item.size || "Default",
        quantity: item.quantity,
        price: price,
        totalPrice: totalPrice
      });
    }

    const address = await Address.findOne({ _id: selectedAddress, userId });
    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    const generateOrderNumber = () => {
      const prefix = 'ORD';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `${prefix}${timestamp}${random}`;
    };

    let orderNumber, isUnique = false;
    while (!isUnique) {
      orderNumber = generateOrderNumber();
      const existingOrder = await Order.findOne({ orderNumber });
      if (!existingOrder) isUnique = true;
    }

    let couponData = {
      applied: false,
      code: null,
      discount: 0,
      originalAmount: totalAmount
    };

    const appliedCoupon = req.session.appliedCoupon;

    if (appliedCoupon) {
      const couponValidation = await validateCouponForCheckout(appliedCoupon, userId, req);
      if (couponValidation.valid) {
        const coupon = couponValidation.coupon;
        let discountAmount = 0;

        if (coupon.discountType === "percentage") {
          discountAmount = Math.min((totalAmount * coupon.offerPrice) / 100, totalAmount);
        } else {
          discountAmount = Math.min(coupon.offerPrice, totalAmount);
        }
        const originalAmount = totalAmount; 
        totalAmount = totalAmount - discountAmount;
        couponData = {
          applied: true,
          code: appliedCoupon.couponCode,
          discount: discountAmount,
          originalAmount: originalAmount,
          couponId: appliedCoupon.couponId
        };
      } else {
        delete req.session.appliedCoupon;
        return res.status(400).json({
          success: false,
          message: couponValidation.message || "Coupon is no longer valid"
        });
      }
    }

    //  COD Amount Validation
    if (payment === "COD" && totalAmount > 1000) {
      return res.status(400).json({
        success: false,
        showAlert: true,
        alertType: "error",
        alertMessage: "Cash on Delivery is not available for orders over ₹1000. Please choose another payment method."
      });
    }
   

    let finalOrderAmount = totalAmount;
    let walletDeduction = 0;
    let orderPaymentMethod = payment;
    let orderStatus = "Pending"; 

    const newOrder = new Order({
      orderNumber,
      userId,
      items: orderItems,
      address: {
        fullName: address.fullName,
        mobileNumber: address.mobileNumber,
        address: address.address,
        city: address.city,
        district: address.district,
        state: address.state,
        landmark: address.landmark,
        pinCode: address.pinCode,
        addressType: address.addressType
      },
      totalAmount: totalAmount, 
      finalAmount: finalOrderAmount, 
      paymentMethod: orderPaymentMethod,
      paymentStatus: orderStatus,
      walletDeduction: walletDeduction,
      couponCode: couponData.code,
      couponId: couponData.couponId,
      discountAmount: couponData.discount
    });

    await newOrder.save();

    const userWallet = await Wallet.findOne({ userId });

    if (payment === "Wallet" || payment === "Wallet_COD" || payment === "Wallet_Online") {
      if (!userWallet || userWallet.balance < 0) {
        return res.status(400).json({
          success: false,
          showAlert: true,
          alertType: "error",
          alertMessage: "Wallet not found or invalid balance."
        });
      }
   //wallet payment
      if (finalOrderAmount <= userWallet.balance) {
        walletDeduction = finalOrderAmount;
        finalOrderAmount = 0;
        orderPaymentMethod = "Wallet";
        orderStatus = "Paid";
      } else {
        orderPaymentMethod = payment.split('_')[1]; 
        orderStatus = "Pending";
      }

      if (walletDeduction > 0) {
        userWallet.balance -= walletDeduction;
        userWallet.transactions.push({
          type: "debit",
          amount: walletDeduction,
          description: `Payment for order ${orderNumber}`,
          balanceAfter: userWallet.balance,
          orderId: newOrder._id, 
          status: "completed",
          source: "order_payment",
          metadata: {
            orderNumber: orderNumber,
            paymentMethod: orderPaymentMethod
          }
        });
        await userWallet.save();
      }
    } else if (payment === "COD") {
      orderStatus = "Pending"; 
    } else if (payment === "Online") {
      orderStatus = "Pending"; 
    }

    newOrder.paymentMethod = orderPaymentMethod;
newOrder.paymentStatus = orderStatus;
newOrder.finalAmount = finalOrderAmount;
newOrder.walletDeduction = walletDeduction;
await newOrder.save();

// Update item + order status 
if (orderStatus === "Paid") {
  newOrder.items.forEach(item => (item.status = "Processing"));
  newOrder.orderStatus = "Processing";
  await newOrder.save();
}

    // Update coupon usage 
    if (couponData.applied) {
      await markCouponUsed(couponData.couponId, userId);

      
      await Coupon.findByIdAndUpdate(couponData.couponId, {
        $push: {
          userUsage: {
            userId: userId,
            orderId: newOrder._id
          }
        }
      });
    }

    try {
      for (const item of orderItems) {
        const product = await Product.findById(item.productId);
        if (product && product.variants) {
          const variant = product.variants.find(v => v.size === item.size);
          if (variant) {
            variant.variantQuantity = Math.max(0, variant.variantQuantity - item.quantity);
            const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
            if (totalStock === 0) {
              product.status = "out of stock";
            }
            await product.save();
          }
        }
      }
    } catch (stockError) {
      console.error("Stock update error:", stockError);
    }

    await Cart.updateOne({ userId }, { $set: { items: [] } });

    delete req.session.appliedCoupon;

    res.status(200).json({
      success: true,
      showAlert: true,
      alertType: "success",
      alertMessage: "Order placed successfully!",
      redirectUrl: `/checkout/orderSuccess?orderId=${newOrder._id}`
    });

  } catch (error) {
    console.error("Place Order Error:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

const orderSuccess = async (req, res) => {
  try {
    const orderId = req.query.orderId;

    if (!orderId) {
      return res.redirect('/order');
    }

    const order = await Order.findById(orderId).populate('items.productId');

    if (!order) {
      return res.redirect('/order');
    }

    res.render("orderSuccessPage", {
      order,
    });

  } catch (error) {
    console.error("Order success page error:", error);
    res.redirect('/order');
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  orderSuccess,
};