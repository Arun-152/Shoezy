const Razorpay = require("razorpay")
const crypto = require("crypto")
const Order = require("../../models/orderSchema")
const Coupon = require("../../models/CouponSchema")
const User = require("../../models/userSchema")
require("dotenv").config()
const Address = require("../../models/addressSchema")
const Cart = require("../../models/cartSchema")
const Product = require("../../models/productSchema")
const { validateCouponForCheckout, markCouponUsed } = require('./couponController');

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const createOrder = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("Razorpay credentials are not configured in .env file");
      return res.status(500).json({ success: false, message: "Payment gateway is not configured. Please contact support." });
    }

    const { selectedAddress, payment, finalTotal } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: "Please select a delivery address",
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      populate: { path: 'category' }
    });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart not found" });
    }

    // Validation
    const hasUnavailableItem = cart.items.some(item => {
      const product = item.productId;
      return !product || product.isDeleted || product.isBlocked || !product.category || product.category.isDeleted || !product.category.isListed;
    });

    if (hasUnavailableItem) {
      return res.status(400).json({
        success: false, showAlert: true, alertType: "error",
        alertMessage: "Some products in your cart are unavailable or blocked. Please review your cart before checkout.",
      });
    }

    const address = await Address.findById(selectedAddress);
    if (!address) {
      return res.status(400).json({ success: false, message: "Address not found" });
    }

    const orderItems = [];
    let totalAmount = 0;

    for (const item of cart.items) {
      const product = item.productId; 
      if (!product) {
        return res.status(404).json({ success: false, message: `Product with id ${item.productId} not found` });
      }

      const variant = product.variants.find(v => v.size === item.size);
      if (!variant) {
        return res.status(404).json({ success: false, message: `Variant with size ${item.size} for product ${item.productId} not found` });
      }

      const freshProduct = await Product.findById(item.productId);
      const freshVariant = freshProduct.variants.find(v => v.size === item.size);

      if (!freshVariant || freshVariant.variantQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          stockError: true,
          message: `Sorry, ${freshProduct.productName} (Size: ${item.size}) is out of stock or has insufficient quantity. Please remove it from your cart.`
        });
      }

      const price = variant.salePrice || variant.regularPrice;
      const totalPrice = price * item.quantity;
      totalAmount += totalPrice;

      orderItems.push({
        productId: item.productId._id,
        size: item.size || "Default",
        quantity: item.quantity,
        price: price,
        totalPrice: totalPrice,
        status: "Failed",
      });
    }

    const generateOrderNumber = () => {
      const prefix = "ORD";
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
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
      orginalAmount: totalAmount
    }
    const appliedCoupon = req.session.appliedCoupon

    if (appliedCoupon) {

      const couponValidation = await validateCouponForCheckout(appliedCoupon, userId, req)
      if (couponValidation.valid) {
        const coupon = couponValidation.coupon
        let discountAmount = 0

        if (coupon.discountType === "percentage") {
          discountAmount = Math.min((totalAmount * coupon.offerPrice) / 100, totalAmount)
        } else {
          discountAmount = Math.min(coupon.offerPrice, totalAmount)
        }
        const originalAmount = totalAmount + discountAmount;
        totalAmount = totalAmount - discountAmount
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
        addressType: address.addressType,
      },
      totalAmount: totalAmount, 
      paymentMethod: "Online",
      paymentStatus: "Pending", 
      orderStatus: "Failed", 
      couponCode: couponData.applied ? couponData.code : null,
      couponId: couponData.applied ? couponData.couponId : null,
      discountAmount: couponData.applied ? couponData.discount : 0,
    });

    await newOrder.save();

    const options = {
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt: `order_rcpt_${newOrder._id}`,
      notes: { internalOrderId: newOrder._id.toString() },
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      razorpayOrder,
      orderId: newOrder._id,
      useraddress: address
    });

  } catch (error) {
    console.error("Razorpay create order error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body
    const { UserOrderId } = req.body
    const order = await Order.findById(UserOrderId)
    const userId = req.session.userId
    if (!order) {
      return res.status(400).json({ success: false, message: "Order not found" })
    }
    const generatedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex")
    if (generatedSignature !== razorpay_signature) { return res.status(400).json({ success: false, message: "Invalid signature" }) }
    
    let productsToUpdate = []; 

    try {
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          order.paymentStatus = "Failed_Product_Missing";
          order.orderStatus = "Failed";
          await order.save();
          return res.status(400).json({
            success: false,
            stockError: true, 
            message: `Order failed: Product ${item.productId} not found. Please try again.`
          });
        }

        const variant = product.variants.find(v => v.size === item.size);
        if (!variant) {
          order.paymentStatus = "Failed_Variant_Missing";
          order.orderStatus = "Failed";
          await order.save();
          return res.status(400).json({
            success: false,
            stockError: true,
            message: `Order failed: Variant for ${product.productName} (Size: ${item.size}) not found. Please try again.`
          });
        }

        if (variant.variantQuantity < item.quantity) {
          order.paymentStatus = "Failed_Stock_Issue"; 
          order.orderStatus = "Failed";
          await order.save(); 
          return res.status(400).json({
            success: false,
            stockError: true,
            message: `Order failed: ${product.productName} (Size: ${item.size}) is out of stock or has insufficient quantity. Please contact support.`
          });
        }
        productsToUpdate.push({ product, variant, item }); 
      }
    
    } catch (validationError) {
      console.error('Error during stock validation save:', validationError);
      return res.status(500).json({
        success: false,
        stockError: true, 
        message: 'An unexpected error occurred while validating your order. Please contact support.'
      });
    }

    order.paymentStatus = "Paid";
    order.paymentMethod = "Online"
    order.razorpayPaymentId = razorpay_payment_id
    order.orderStatus = "Processing"; 
    order.items.forEach(item=>item.status = "Processing")
    await order.save();

    try {
      if (order.couponId) {
        await markCouponUsed(order.couponId, userId);
        await Coupon.findByIdAndUpdate(order.couponId, {
          $push: { userUsage: { userId, orderId: order._id } }
        });
      }
      if (req.session && req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }
    } catch (couponErr) {
      console.error('Error updating coupon usage after payment:', couponErr);
    }
    try {
      for (const { product, variant, item } of productsToUpdate) { 
        if (variant.variantQuantity < item.quantity) continue;

        variant.variantQuantity = Math.max(0, variant.variantQuantity - item.quantity);
        const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
        if (totalStock === 0) {
          product.status = "out of stock";
        } else {

          if (product.status === "out of stock" && totalStock > 0) {
              product.status = "Available";
          }
        }
        await product.save();
      }
    } catch (stockError) {
      console.error("Stock update error:", stockError);
    }

    await Cart.updateOne({ userId }, { $set: { items: [] } });

    return res.status(200).json({
      success: true,
      showAlert: true,
      alertType: "success",
      orderId: order._id,
      alertMessage: "Order placed successfully!",
    });


  } catch (error) {
    console.error(error, "razorpay verify payment error")
    return res.status(500).json({ success: false, message: "A critical server error occurred during payment verification." });
  }
}
const paymentFailed = async (req, res) => {
  try {

    const { orderId } = req.params

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(400).json({ success: false, message: "Order not found" });
    }


    order.paymentStatus = "Failed";
    await order.save();

    return res.render("paymentFailedPage", { order });
  } catch (err) {
    console.error("Payment failed handler error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
const loadRetryPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('items.productId');

    if (!order) {
      return res.status(404).render('user/errorPage', { message: 'Order not found' });
    }

    return res.render('user/retryPaymentPage', { order });

  } catch (error) {
    console.error("Error loading retry payment page:", error);
    return res.status(500).render('user/errorPage', { message: 'Internal server error' });
  }
};
const retryPayment = async(req,res)=>{
  try{

    const {orderId} = req.params
    const order = await Order.findById(orderId)

    if (!order || order.paymentStatus === "Failed_Stock_Issue" || (order.orderStatus === "Failed" && order.paymentStatus !== "Failed")) {
      return res.status(400).json({
        success: false,
        message: "This order cannot be retried due to stock issues or other failures."
      });
    }

    const options = {
      amount: Math.round(Number(order.totalAmount) * 100),
      currency: "INR",
      receipt: `order_rcpt_${order._id}`,
      notes: { internalOrderId: order._id.toString() },
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    

    return res.json({success:true,razorpayOrder,order,key: process.env.RAZORPAY_KEY_ID})

  }catch(error){
    console.error("retrypayment error",error)
    return res.status(500).json({success:false,message:"Internal server error"})
  }
}


module.exports = {
  createOrder,
  verifyPayment,
  paymentFailed,
  loadRetryPayment,
  retryPayment
}