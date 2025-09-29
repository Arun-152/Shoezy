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

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) {
      return res.status(400).json({ success: false, message: "Cart not found" });
    }

    const address = await Address.findById(selectedAddress);
    if (!address) {
      return res.status(400).json({ success: false, message: "Address not found" });
    }

    const orderItems = [];
    let totalAmount = 0;

    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product with id ${item.productId} not found` });
      }

      const variant = product.variants.find(v => v.size === item.size);
      if (!variant) {
        return res.status(404).json({ success: false, message: `Variant with size ${item.size} for product ${item.productId} not found` });
      }

      // --- Start: Final Stock Check ---
      // Re-fetch the product and variant to ensure latest stock data
      const freshProduct = await Product.findById(item.productId);
      const freshVariant = freshProduct.variants.find(v => v.size === item.size);

      if (!freshVariant || freshVariant.variantQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          stockError: true,
          message: `Sorry, ${freshProduct.productName} (Size: ${item.size}) is out of stock or has insufficient quantity. Please remove it from your cart.`
        });
      }
      // --- End: Final Stock Check ---

      const price = variant.salePrice || variant.regularPrice;
      const totalPrice = price * item.quantity;
      totalAmount += totalPrice;

      orderItems.push({
        productId: item.productId._id,
        size: item.size || "Default",
        quantity: item.quantity,
        price: price,
        totalPrice: totalPrice,
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
      // Ensure numeric total amount
      totalAmount: totalAmount, // Use the calculated total amount
      paymentMethod: "Online",
      paymentStatus: "Failed",
      // Persist coupon details so that usage checks work later
      couponCode: couponData.applied ? couponData.code : null,
      couponId: couponData.applied ? couponData.couponId : null,
      discountAmount: couponData.applied ? couponData.discount : 0,
    });

    await newOrder.save();

    const options = {
      // Razorpay expects amount in paise as an integer
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
    // The order.paymentStatus = "Failed"; and await order.save(); were moved to the previous turn's diff
    // and should be present here. If not, please ensure they are.
    // If signature is invalid, we should not proceed with stock checks or order finalization.
    if (generatedSignature !== razorpay_signature) { return res.status(400).json({ success: false, message: "Invalid signature" }) }
    
    try {
      // --- START: Final Stock Check before finalizing order and deducting stock ---
      const productsToUpdate = [];
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          // This scenario should be rare if createOrder already validated, but good to have.
          order.paymentStatus = "Failed_Product_Missing";
          order.orderStatus = "Failed"; // Mark overall order status as failed
          await order.save();
          return res.status(400).json({
            success: false,
            stockError: true, // Flag for frontend to show specific Swal message
            message: `Order failed: Product ${item.productId} not found. Please try again.`
          });
        }

        const variant = product.variants.find(v => v.size === item.size);
        if (!variant) {
          order.paymentStatus = "Failed_Variant_Missing";
          order.orderStatus = "Failed"; // Mark overall order status as failed
          await order.save();
          return res.status(400).json({
            success: false,
            stockError: true,
            message: `Order failed: Variant for ${product.productName} (Size: ${item.size}) not found. Please try again.`
          });
        }

        if (variant.variantQuantity < item.quantity) {
          // Stock is insufficient!
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
        stockError: true, // Ensure frontend shows an error
        message: 'An unexpected error occurred while validating your order. Please contact support.'
      });
    }

    // If we reach here, signature is valid and stock is sufficient. Proceed to finalize the order.
    order.paymentStatus = "Paid";
    order.paymentMethod = "Online"
    order.razorpayPaymentId = razorpay_payment_id
    order.orderStatus = "Processing"; // Initial status for a successfully placed order
    // Removed: const productsToUpdate = order.items.map(item => ({ product: null, variant: null, item })); // This line was incorrectly re-initializing productsToUpdate
    await order.save();

    // If a coupon was applied to this online order, mark it as used now
    try {
      if (order.couponId) {
        await markCouponUsed(order.couponId, userId);
        // Also record usage entry on the coupon document
        await Coupon.findByIdAndUpdate(order.couponId, {
          $push: { userUsage: { userId, orderId: order._id } }
        });
      }
      // Clear applied coupon from session after a successful order
      if (req.session && req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }
    } catch (couponErr) {
      console.error('Error updating coupon usage after payment:', couponErr);
    }
    try {
      // Deduct stock for all items
      // Use the productsToUpdate array populated during the stock check
      for (const { product, variant, item } of productsToUpdate) { 

        // This check is redundant but safe
        if (variant.variantQuantity < item.quantity) continue;

        variant.variantQuantity = Math.max(0, variant.variantQuantity - item.quantity);
        const totalStock = product.variants.reduce((sum, v) => sum + v.variantQuantity, 0);
        if (totalStock === 0) {
          product.status = "out of stock";
        } else {
          // If stock becomes > 0 after deduction (e.g., if it was 0 and we added some), mark as available
          // This ensures product status is "Available" if there's stock.
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
    // This function is being deprecated in favor of direct AJAX calls from the order pages.
    // If a user somehow lands here, redirect them to their orders.
    console.log("loadRetryPayment was called, redirecting to /order");
    return res.redirect('/order');
  } catch (error) {
    console.error("retry payment error:", error);
    // Redirect to an error page or the main order page on error.
    return res.status(500).render("user/errorPage", {
      success: false,
      message: "Internal server error"
    });
  }
};
const retryPayment = async(req,res)=>{
  try{

    const {orderId} = req.params
    const order = await Order.findById(orderId)

    if (!order || order.paymentStatus === "Failed_Stock_Issue" || order.orderStatus === "Failed") {
      return res.status(400).json({
        success: false,
        message: "This order cannot be retried due to stock issues or other failures."
      });
    }

    const options = {
      // Razorpay expects amount in paise as an integer
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