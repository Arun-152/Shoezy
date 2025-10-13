const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema")
const Wishlist = require("../../models/wishlistSchema")
const mongoose = require("mongoose");


const loadAddToCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    const userCart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      match: { isDeleted: false, isBlocked: false },
      populate: {
        path: "category",
        match: { isListed: true, isDeleted: false },
      },
    });

    let cartItems = [];
    let subtotal = 0;

    if (userCart && userCart.items.length > 0) {
      cartItems = userCart.items
        .filter(item => item.productId && item.productId.category)
        .map(item => {
          const variant = item.productId.variants.find(v => v.size === item.size);
          if (!variant) {
            return null; 
          }
          const currentPrice = variant.salePrice;
          const regularPrice = variant.regularPrice;
          const itemTotal = currentPrice * item.quantity;
          subtotal += itemTotal;
          return {
            ...item.toObject(),
            price: currentPrice,
            regularPrice,
            itemTotal,
          };
        })
        .filter(item => item !== null); 
    }

    const userWishlist = await Wishlist.findOne({ userId }).populate({
      path: "products.productId",
      match: { isDeleted: false, isBlocked: false },
      populate: {
        path: "category",
        match: { isListed: true, isDeleted: false },
      },
    });

    const shipping = subtotal > 500 ? 0 : 50;
    const total = subtotal + shipping;

    return res.render("addToCartPage", {
      user,
      cartItems,
      subtotal,
      shipping,
      total,
    });
  } catch (error) {
    console.error("Add to cart page error:", error);
    res.redirect("/usererrorPage");
  }
};

const addToCart = async(req,res)=>{
    try {
        const userId = req.session.userId
        let {productId, size, price, quantity} = req.body

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        if (!productId) {
            return res.status(400).json({success: false, message: "Product ID is required"})
        }

        
        const product = await Product.findById(productId).populate("category")
        if (!product || product.isDeleted || product.isBlocked) {
            return res.status(400).json({success: false, message: "This product is unavailable"})
        }

        if (!product.category || !product.category.isListed || product.category.isDeleted) {
            return res.status(400).json({success: false, message: "This product category is unavailable"})
        }

        if (!quantity) quantity = 1;
        if (!price && product.variants && product.variants.length > 0) {

            const prices = product.variants.map(v => v.salePrice);
            price = Math.min(...prices);
        }
        if (!size && product.variants && product.variants.length > 0) {
          
            const availableVariant = product.variants.find(v => v.variantQuantity > 0);
            if (availableVariant) {
                size = availableVariant.size;
                price = availableVariant.salePrice; 
            } else {
                return res.status(400).json({success: false, message: "No available sizes for this product"})
            }
        }

        if (!size || !price) {
            return res.status(400).json({success: false, message: "Missing required product information"})
        }

        quantity = parseInt(quantity)
        if (isNaN(quantity) || quantity <= 0) quantity = 1
        if (quantity > 10) {
            return res.status(400).json({success: false, message: "You can only add up to 10 units per product"})
        }

        let variantStock = Infinity
        if (product.variants && product.variants.length > 0) {
            const variant = product.variants.find(v => (v.size || "Default") === (size || "Default"))
            if (!variant) {
                return res.status(400).json({success: false, message: "Selected size is unavailable"})
            }
            variantStock = parseInt(variant.variantQuantity) || 0
            if (variantStock <= 0) {
                return res.status(400).json({success: false, message: "This size is out of stock"})
            }
        }

        let userCart = await Cart.findOne({userId})
        if (!userCart) {
            userCart = new Cart({userId, items: []})
        }

        const existingItemIndex = userCart.items.findIndex(item => 
            item.productId.toString() === productId && (item.size || "Default") === size
        )

        if (existingItemIndex > -1) {
            const currentQty = parseInt(userCart.items[existingItemIndex].quantity) || 0
            const desiredQty = currentQty + quantity

            if (desiredQty > 10) {
                return res.status(400).json({success: false, message: "You can only add up to 10 units of this product in your cart"})
            }

            if (desiredQty > variantStock) {
                return res.status(400).json({success: false, message: `Only ${variantStock} stock left`})
            }

            userCart.items[existingItemIndex].quantity = desiredQty
            userCart.items[existingItemIndex].totalPrice = userCart.items[existingItemIndex].price * userCart.items[existingItemIndex].quantity
            userCart.items[existingItemIndex].size = size;
        } else {
            if (quantity > variantStock) {
                return res.status(400).json({success: false, message: `Only ${variantStock} stock left`})
            }
            userCart.items.push({
                productId: productId,
                size: size,
                quantity: parseInt(quantity),
                price: parseFloat(price),
                totalPrice: parseFloat(price) * parseInt(quantity)
            })
        }

        await userCart.save()
        const cartCount = userCart.items.length
        const totalQuantity = userCart.items.reduce((total, item) => total + item.quantity, 0);
        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                      req.headers['accept'] && req.headers['accept'].includes('application/json') ||
                      req.headers['content-type'] && req.headers['content-type'].includes('application/json');

        if (isAjax) {
            return res.status(200).json({
                success: true, 
                message: "Product added to cart successfully",
                totalQuantity: totalQuantity ,
                cartCount,
            })
        }

        return res.redirect("/cart")

    } catch (error) {
        console.error('Error adding to cart:', error)
        
        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                      req.headers['accept'] && req.headers['accept'].includes('application/json') ||
                      req.headers['content-type'] && req.headers['content-type'].includes('application/json');
        
        if (isAjax) {
            return res.status(500).json({success: false, message: "Server error"})
        }
        return res.redirect("/usererrorPage")
    }
}
const updateQuantity = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { productId, size, quantity } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const newQuantity = parseInt(quantity);
        if (isNaN(newQuantity) || newQuantity <= 0 || newQuantity > 10) {
            return res.status(400).json({ success: false, message: "Invalid quantity. Only 1-10 units are allowed." });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const item = cart.items.find(
            i => i.productId.toString() === productId && (i.size || "Default") === (size || "Default")
        );

        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        const product = await Product.aggregate([
            { $unwind: "$variants" },
            { $match: { _id: new mongoose.Types.ObjectId(productId), "variants.size": size } }
        ]);

        if (!product || product.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const variant = product[0].variants;

        if (!variant || variant.size !== size) {
            return res.status(404).json({ success: false, message: "Product variant not found" });
        }

        if (variant.variantQuantity < newQuantity) {
            return res.status(400).json({ success: false, message: `Only ${variant.variantQuantity} units in stock.` });
        }

        item.quantity = newQuantity;

        await cart.save();

        const updatedCart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "variants" 
        });

        let newSubtotal = 0;
        let newItemTotal = 0;

        updatedCart.items.forEach(cartItem => {
            const productData = cartItem.productId;
            if (productData && productData.variants) {
                const itemVariant = productData.variants.find(v => v.size === cartItem.size);
                if (itemVariant) {
                    const itemPrice = itemVariant.salePrice || itemVariant.regularPrice;
                    const currentItemTotal = itemPrice * cartItem.quantity;
                    newSubtotal += currentItemTotal;

                    // Find the total for the specific item that was just updated
                    if (cartItem.productId._id.toString() === productId && cartItem.size === size) {
                        newItemTotal = currentItemTotal;
                    }
                }
            }
        });

        let subtotal = 0;
        const shipping = newSubtotal > 500 ? 0 : 50;
        const total = newSubtotal + shipping;
        const cartCount = updatedCart.items.length;

        // ✅ Send success response
        return res.status(200).json({
            success: true,
            message: "Quantity updated successfully",
            itemTotal: newItemTotal,
            subtotal: newSubtotal,
            shipping: shipping,
            total: total,
            cartCount: cartCount,
        });

    } catch (error) {
        console.error("Error updating quantity:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
const removeCart = async(req,res)=>{
    try {
        const userId = req.session.userId
        const {productId, size} = req.body

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        const cart = await Cart.findOne({userId})
        if (!cart) {
            return res.status(404).json({success: false, message: "Cart not found"})
        }

        cart.items = cart.items.filter(item => 
            !(item.productId.toString() === productId && (item.size || "Default") === (size || "Default"))
        )
        await cart.save()
 
        // After removing, re-fetch and populate to calculate fresh totals
        const updatedCart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "variants" // Only need variants for price calculation
        });
 
        let newSubtotal = 0;
        if (updatedCart && updatedCart.items.length > 0) {
            updatedCart.items.forEach(cartItem => {
                const productData = cartItem.productId;
                if (productData && productData.variants) {
                    const itemVariant = productData.variants.find(v => v.size === cartItem.size);
                    if (itemVariant) {
                        const itemPrice = itemVariant.salePrice || itemVariant.regularPrice;
                        newSubtotal += itemPrice * cartItem.quantity;
                    }
                }
            });
        }
 
        const shipping = newSubtotal > 500 ? 0 : 50;
        const total = newSubtotal + shipping;
 
        return res.status(200).json({
            success: true, 
            message: "Product removed successfully",
            subtotal: newSubtotal,
            shipping: shipping,
            total: total,
            cartCount: updatedCart ? updatedCart.items.length : 0
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({success: false, message: "Server error"})
    }
}

const clearCart = async(req,res)=>{
    try {
        const userId = req.session.userId

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        const cart = await Cart.findOne({userId})
        if (!cart) {
            return res.status(404).json({success: false, message: "Cart not found"})
        }

        // Clear all items from cart
        cart.items = []
        await cart.save()

        return res.status(200).json({
            success: true, 
            message: "Cart cleared successfully"
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({success: false, message: "Server error"})
    }
}

const validateCheckout = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const userCart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                match: { isListed: true, isDeleted: false }
            }
        });

        if (!userCart || userCart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty" });
        }

        // Check for blocked, deleted, or unavailable products
        const unavailableProducts = [];
        
        for (const item of userCart.items) {
            const product = item.productId;
            
            // Check if product is deleted, blocked, or category is unavailable
            if (!product || product.isDeleted || product.isBlocked || 
                !product.category || !product.category.isListed || product.category.isDeleted) {
                unavailableProducts.push(product ? product.productName : 'Unknown Product');
                continue;
            }

            // Check stock availability for the specific size
            const variant = product.variants.find(v => v.size === item.size);
            if (!variant || variant.variantQuantity < item.quantity) {
                unavailableProducts.push(`${product.productName} (Size: ${item.size})`);
            }
        }

        if (unavailableProducts.length > 0) {
            return res.status(400).json({
                success: false,
                message: `The following products are unavailable: ${unavailableProducts.join(', ')}. Please remove them from your cart.`
            });
        }

        return res.status(200).json({
            success: true,
            message: "Cart validation successful"
        });

    } catch (error) {
        console.error('Error validating checkout:', error);
        return res.status(500).json({ success: false, message: "Server error during validation" });
    }
};

module.exports = {
    loadAddToCart,
    addToCart,
    updateQuantity,
    removeCart,
    clearCart,
    validateCheckout
}