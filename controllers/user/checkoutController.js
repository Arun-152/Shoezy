
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema")
const Product = require("../../models/productSchema")
const Order = require("../../models/orderSchema")
const bcrypt = require("bcrypt")
const env = require("dotenv").config()
const session = require("express-session")

const loadCheckout = async(req,res)=>{

  try {
    // Get user ID from session (set by userAuth middleware)
    const userId = req.session.userId;
    
    // Fetch user data
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // Fetch user's cart items
    const cartItems = await Cart.find({ userId: userId }).populate('items.productId');
    
    // Fetch user's default address
    const defaultAddress = await Address.findOne({ userId: userId, isDefault: true });
    
    // Fetch all user addresses
    const allAddresses = await Address.find({ userId: userId });
    
    // Calculate totals
    let subtotal = 0;
    let totalItems = 0;
    let allItems = [];
    
    cartItems.forEach(cart => {
      cart.items.forEach(item => {
        subtotal += item.totalPrice;
        totalItems += item.quantity;
        allItems.push(item);
      });
    });
    
    // Shipping is free
    const shipping = 0;
    const finalTotal = subtotal + shipping;

    res.render('checkoutPage', {
      user: user,
      cartItems: cartItems,
      allItems: allItems,
      subtotal: subtotal,
      totalItems: totalItems,
      shipping: shipping,
      finalTotal: finalTotal,
      defaultAddress: defaultAddress,
      allAddresses: allAddresses
    });

  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.status(500).send('Server Error');
  }
}
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { selectedAddress, payment } = req.body;

    // 🔒 Validation
    if (!userId) {
      return res.status(401).json({ success:false,message: "User not authenticated" });
    }

    if (!selectedAddress || !payment) {
      return res.status(400).json({ 
        success: false,
        showAlert: true,
        alertType: "warning",
        alertMessage: "Please select a delivery address and payment method"
      });
    }

    if (!['COD'].includes(payment)) {
      return res.status(400).json({ 
        success: false,
        showAlert: true,
        alertType: "error",
        alertMessage: "Please select a valid payment method"
      });
    }

    // 🛒 Get cart items
    const cartItems = await Cart.find({ userId }).populate('items.productId');
    
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ success:false,message: "Cart is empty" });
    }

    // Check if cart has items
    let hasItems = false;
    cartItems.forEach(cart => {
      if (cart.items && cart.items.length > 0) {
        hasItems = true;
      }
    });

    if (!hasItems) {
      return res.status(400).json({ success:false,message: "No items in cart" });
    }

    // 🏠 Get Address
    const address = await Address.findOne({ _id: selectedAddress, userId });
    
    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    // 💰 Calculate total and prepare items
    let totalAmount = 0;
    const orderItems = [];
    
    cartItems.forEach(cart => {
      cart.items.forEach(item => {
        totalAmount += item.totalPrice;
        orderItems.push({
          productId: item.productId._id,
          size: item.size || "Default", // Include size information
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice
        });
      });
    });

    // COD amount validation - server side
    if (payment === 'COD' && totalAmount > 6000) {
      return res.status(400).json({ 
        success: false,
        showAlert: true,
        alertType: "error",
        alertMessage: "COD is not available for orders above ₹6000. Please choose another payment method."
      });
    }

    // 📦 Generate unique order number
    const generateOrderNumber = () => {
      const prefix = 'ORD';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `${prefix}${timestamp}${random}`;
    };

    let orderNumber;
    let isUnique = false;
    
    // Keep generating until we get a unique order number
    while (!isUnique) {
      orderNumber = generateOrderNumber();
      const existingOrder = await Order.findOne({ orderNumber });
      if (!existingOrder) {
        isUnique = true;
      }
    }

    // Create order with generated order number
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
      totalAmount,
      paymentMethod: payment
    });

    await newOrder.save();
    
    // 🔄 Update stock for each product variant
    try {
      for (const item of orderItems) {
        const product = await Product.findById(item.productId);
        if (product && product.variants) {
          // Find the specific variant by size
          const variant = product.variants.find(v => v.size === item.size);
          if (variant) {
            // Decrement stock for this specific variant
            variant.variantQuantity = Math.max(0, variant.variantQuantity - item.quantity);
            
            // Update product status if all variants are out of stock
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
      // Continue with order even if stock update fails
    }
    
    // Clear cart after successful order
    await Cart.updateMany({ userId }, { $set: { items: [] } });

    // Return success response for SweetAlert
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
}


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
      order: order
    });
    
  } catch (error) {
    console.error("Order success page error:", error);
    res.redirect('/order');
  }
}

module.exports ={
    loadCheckout,
    placeOrder,
    orderSuccess
}