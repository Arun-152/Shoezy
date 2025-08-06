const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema")
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



module.exports ={
    loadCheckout
}