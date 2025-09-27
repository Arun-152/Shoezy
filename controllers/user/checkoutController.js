const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/CouponSchema");
const Wallet = require("../../models/walletSchema");
const { validateCouponForCheckout, markCouponUsed } = require('./couponController'); // Import markCouponUsed
const bcrypt = require("bcrypt");
const env = require("dotenv").config();

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    const coupon = await Coupon.find({ islist: true });

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    const cartItems = await Cart.find({ userId }).populate('items.productId');

    const defaultAddress = await Address.findOne({ userId, isDefault: true });
    const allAddresses = await Address.find({ userId });

    // --- Start: Corrected Coupon Filtering Logic ---
    const appliedCouponInSession = req.session.appliedCoupon || null;
    const appliedCouponCode = appliedCouponInSession ? appliedCouponInSession.couponCode : null;
    const currentDate = new Date();

    const allCoupons = await Coupon.find({
      islist: true,
      startDate: { $lte: currentDate }, // Only active coupons
      expireOn: { $gte: currentDate }   // Only non-expired coupons
    }).sort({ expireOn: 1 });

    const availableCouponsForPage = [];
    for (const couponItem of allCoupons) {
      // Skip if the coupon is the one currently applied
      if (appliedCouponCode && couponItem.name === appliedCouponCode) {
        continue;
      }

      // Check global usage limit
      if (couponItem.totalUsageLimit && couponItem.currentUsageCount >= couponItem.totalUsageLimit) {
        continue;
      }
      
      const userUsageCount = await Order.countDocuments({
        userId: userId,
        couponCode: couponItem.name,
        orderStatus: { $ne: 'Cancelled' }
      });
      if (userUsageCount >= (couponItem.maxUsesPerUser || 1)) {
        continue;
      }

      availableCouponsForPage.push(couponItem);
    }
    
    let subtotal = 0;
    let totalItems = 0;
    let allItems = [];
    let blockedOrDeletedProducts = [];
    cartItems.forEach(cart => {
      const filteredItems = cart.items.filter(item => {
        const product = item.productId;
        if (product && (product.isBlocked || product.isDeleted)) {
          blockedOrDeletedProducts.push(product.name);
        }
        return product && !product.isBlocked && !product.isDeleted;
      });

      cart.items = filteredItems;

      filteredItems.forEach(item => {
        const product = item.productId;
        const variant = product.variants.find(v => v.size === item.size);

        if (variant) {
          const price = variant.salePrice || variant.regularPrice;
          const totalPrice = price * item.quantity;

          const itemWithPrice = {
            ...item.toObject(),
            price: price,
            totalPrice: totalPrice
          };

          subtotal += totalPrice;
          totalItems += item.quantity;
          allItems.push(itemWithPrice);
        } else {
          // Handle cases where the variant is not found, though this should ideally not happen if cart is managed well
          console.warn(`Variant not found for product ${product._id} with size ${item.size}`);
        }
      });
    });
    const shipping = 0;
    
    const appliedCoupon = req.session.appliedCoupon || null;
    let finalTotal = subtotal + shipping;
    let couponDiscount = 0;

    if (appliedCoupon) {
      const couponValidation = await validateCouponForCheckout(appliedCoupon, userId, req);
      if (couponValidation.valid) {
        const coupon = couponValidation.coupon;
        const totalBeforeDiscount = subtotal + shipping;

        if (coupon.discountType === "percentage") {
          couponDiscount = Math.min((totalBeforeDiscount * coupon.offerPrice) / 100, totalBeforeDiscount);
        } else {
          couponDiscount = Math.min(coupon.offerPrice, totalBeforeDiscount);
        }

        finalTotal = totalBeforeDiscount - couponDiscount;
      } else {
        delete req.session.appliedCoupon;
        couponDiscount = 0;
      }
    }
    
    if (blockedOrDeletedProducts.length > 0) {
      req.flash('error', `These products are blocked or deleted: ${blockedOrDeletedProducts.join(', ')}`);
      return res.redirect("/cart");
    }

    if (allItems.length === 0) {
      req.flash('error', 'Your cart is empty or contains unavailable products.');
      return res.redirect('/cart');
    }

    const userWallet = await Wallet.findOne({ userId });

    res.render('checkoutPage', {
      user,
      cartItems,
      allItems,
      subtotal,
      totalItems,
      shipping,
      totalAmount: finalTotal,
      defaultAddress,
      allAddresses,
      coupon,
      coupon: availableCouponsForPage, // Pass the correctly filtered coupons
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

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const blockedProducts = [];
    const unavailableProducts = [];

    for (const item of cart.items) {
      const product = item.productId;

      if (!product) {
        unavailableProducts.push("Unknown Product");
        continue;
      }

      if (product.isBlocked) {
        blockedProducts.push(product.productName);
        continue;
      }

      if (product.isDeleted) {
        unavailableProducts.push(product.productName);
        continue;
      }

      if (product.variants) {
        const variant = product.variants.find(v => v.size === item.size);
        if (!variant || variant.variantQuantity < item.quantity) {
          unavailableProducts.push(`${product.productName} (Size: ${item.size})`);
        }
      }
    }

    if (blockedProducts.length > 0) {
      return res.status(400).json({
        success: false,
        showAlert: true,
        alertType: "error",
        alertMessage: `The following product(s) are currently blocked and unavailable: ${blockedProducts.join(", ")}. Please remove them from your cart and try again.`
      });
    }

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        success: false,
        showAlert: true,
        alertType: "error",
        alertMessage: `The following product(s) are currently unavailable: ${unavailableProducts.join(", ")}. Please remove them from your cart and try again.`
      });
    }

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
        const originalAmount = totalAmount; // Store original amount before discount
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

    let finalOrderAmount = totalAmount;
    let walletDeduction = 0;
    let orderPaymentMethod = payment;
    let orderStatus = "Pending"; // Default status

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
      totalAmount: totalAmount, // This is the original total amount before wallet deduction
      finalAmount: finalOrderAmount, // This is the amount remaining to be paid after wallet deduction
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

      if (finalOrderAmount <= userWallet.balance) {
        // Full payment from wallet
        walletDeduction = finalOrderAmount;
        finalOrderAmount = 0;
        orderPaymentMethod = "Wallet";
        orderStatus = "Paid";
      } else if (userWallet.balance > 0) {
        // Partial payment from wallet
        walletDeduction = userWallet.balance;
        finalOrderAmount -= walletDeduction;
        orderPaymentMethod = `Wallet + ${payment.split('_')[1]}`; // e.g., "Wallet + COD"
        orderStatus = "Pending"; // Remaining amount needs to be paid
      } else {
        // Wallet selected but balance is 0, proceed with other payment method
        orderPaymentMethod = payment.split('_')[1]; // e.g., "COD" or "Online"
        orderStatus = "Pending";
      }

      if (walletDeduction > 0) {
        userWallet.balance -= walletDeduction;
        userWallet.transactions.push({
          type: "debit",
          amount: walletDeduction,
          description: `Payment for order ${orderNumber}`,
          balanceAfter: userWallet.balance,
          orderId: newOrder._id, // Now newOrder._id is available
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
      orderStatus = "Pending"; // For COD, order is placed but payment is pending
    } else if (payment === "Online") {
      orderStatus = "Pending"; // For online, payment is pending
    }

    // Update the order with the final payment method and status after wallet deduction
    newOrder.paymentMethod = orderPaymentMethod;
    newOrder.paymentStatus = orderStatus;
    newOrder.finalAmount = finalOrderAmount;
    newOrder.walletDeduction = walletDeduction;
    await newOrder.save();

    // Update coupon usage if a coupon was applied
    if (couponData.applied) {
      await markCouponUsed(couponData.couponId, userId);

      // Update userUsage array in Coupon
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

    // Clear applied coupon from session after order is placed
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