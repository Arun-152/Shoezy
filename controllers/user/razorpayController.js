const Razorpay = require("razorpay")
const crypto = require("crypto")
const Order = require("../../models/orderSchema")
const User = require("../../models/userSchema")
require("dotenv").config()
const Address = require("../../models/addressSchema")
const Cart = require("../../models/cartSchema")
const Product = require("../../models/productSchema")
const { validateCouponForCheckout } = require('./couponController');

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


const createOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { selectedAddress, payment,finalTotal} = req.body; 
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
      totalAmount += item.totalPrice;
      orderItems.push({
        productId: item.productId._id,
        size: item.size || "Default",
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
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
      totalAmount:finalTotal,
      paymentMethod:"Online",        
      paymentStatus: "Pending",
    });

    await newOrder.save();
   
      const options = {
        amount: newOrder.totalAmount * 100, 
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
        useraddress:address
      });

    

  } catch (error) {
    console.error("Razorpay create order error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

const verifyPayment = async(req,res)=>{
    try{
        const {razorpay_payment_id,razorpay_order_id,razorpay_signature} = req.body
        const {UserOrderId} = req.body
        const order = await Order.findById(UserOrderId)
        const userId = req.session.userId
        if(!order){
            return res.status(400).json({success:false,message:"Order not found"})
        }
        const generatedSignature = crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex")
        if(generatedSignature !== razorpay_signature){
            order.paymentStatus = "Failed"
            return res.status(400).json({success:false,message:"Invalid signature"})
        }
        order.paymentStatus = "Paid"
        order.paymentMethod = "Online"
        order.razorpayPaymentId = razorpay_payment_id
        await order.save()
         try {
      for (const item of order.items) {
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

    return res.status(200).json({
      success: true,
      showAlert: true,
      alertType: "success",
      alertMessage: "Order placed successfully!",
      redirectUrl: `/checkout/orderSuccess?orderId=${order._id}`
    });
       

    }catch(error){
        console.error(error,"razorpay verify payment error")
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

module.exports = {
    createOrder,
    verifyPayment,
    paymentFailed
}