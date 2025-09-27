const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema")
const Wishlist = require("../../models/wishlistSchema")

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

        // Check if product exists and is available
        const product = await Product.findById(productId).populate("category")
        if (!product || product.isDeleted || product.isBlocked) {
            return res.status(400).json({success: false, message: "This product is unavailable"})
        }

        if (!product.category || !product.category.isListed || product.category.isDeleted) {
            return res.status(400).json({success: false, message: "This product category is unavailable"})
        }

        // Set default values if not provided (for shop page quick add)
        if (!quantity) quantity = 1;
        if (!price && product.variants && product.variants.length > 0) {
            // Use the minimum sale price if price not provided
            const prices = product.variants.map(v => v.salePrice);
            price = Math.min(...prices);
        }
        if (!size && product.variants && product.variants.length > 0) {
            // Use the first available size if size not provided
            const availableVariant = product.variants.find(v => v.variantQuantity > 0);
            if (availableVariant) {
                size = availableVariant.size;
                price = availableVariant.salePrice; // Use the correct price for this size
            } else {
                return res.status(400).json({success: false, message: "No available sizes for this product"})
            }
        }

        // Final validation after setting defaults
        if (!size || !price) {
            return res.status(400).json({success: false, message: "Missing required product information"})
        }

        // Validate requested quantity bounds (client may send any number)
        quantity = parseInt(quantity)
        if (isNaN(quantity) || quantity <= 0) quantity = 1
        if (quantity > 10) {
            return res.status(400).json({success: false, message: "You can only add up to 10 units per product"})
        }

        // Find variant stock for the selected size
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

        // Find or create user's cart
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

            // Enforce per-item maximum of 10
            if (desiredQty > 10) {
                return res.status(400).json({success: false, message: "You can only add up to 10 units of this product in your cart"})
            }

            // Enforce stock
            if (desiredQty > variantStock) {
                return res.status(400).json({success: false, message: `Only ${variantStock} stock left`})
            }

            userCart.items[existingItemIndex].quantity = desiredQty
            userCart.items[existingItemIndex].totalPrice = userCart.items[existingItemIndex].price * userCart.items[existingItemIndex].quantity
            // Ensure the size field is set for existing items
            if (!userCart.items[existingItemIndex].size) {
                userCart.items[existingItemIndex].size = size;
            }
        } else {
            // Add new item to cart only if it doesn't exist
            // Enforce stock for new item
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

        // Ensure all existing items have a size field before saving
        userCart.items.forEach(item => {
            if (!item.size) {
                item.size = "Default";
            }
        });

        await userCart.save()
        const cartCount = userCart.items.length

        // Calculate total quantity for cart count (sum of all item quantities)
        const totalQuantity = userCart.items.reduce((total, item) => total + item.quantity, 0);

        // Check if this is an AJAX request
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

        // Otherwise redirect to cart page
        return res.redirect("/cart")

    } catch (error) {
        console.error('Error adding to cart:', error)
        
        // Check if this is an AJAX request for error handling too
        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                      req.headers['accept'] && req.headers['accept'].includes('application/json') ||
                      req.headers['content-type'] && req.headers['content-type'].includes('application/json');
        
        if (isAjax) {
            return res.status(500).json({success: false, message: "Server error"})
        }
        return res.redirect("/usererrorPage")
    }
}
const updateQuantity = async(req,res)=>{
    try {
        const userId = req.session.userId
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

        const item = cart.items.find(i => 
            i.productId.toString() === productId && (i.size || "Default") === (size || "Default")
        );
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        const product = await Product.aggregate([{$unwind: "$variants"},{$match:{_id:item.productId,"variants.size":size}}]);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
      
        const variant = product[0].variants?.size===size
      
        if (!variant) {
            return res.status(404).json({ success: false, message: "Product variant not found" });
        }

        if (variant.variantQuantity < newQuantity) {
            return res.status(400).json({ success: false, message: `Only ${variant.variantQuantity} units in stock.` });
        }
      
        // Update quantity and total price
        item.quantity = newQuantity;
   
        item.totalPrice = item.price || product[0].variants.salePrice * newQuantity;
   
        // Save the updated cart
        await cart.save();

        // Calculate new totals
        let subtotal = 0;
        cart.items.forEach(cartItem => {
            subtotal += cartItem.totalPrice;
        });
  

        const shipping = subtotal > 500 ? 0 : 50
        const total = subtotal + shipping
      
        let cartCount = 0
        if(cart && cart.items.length){
            cartCount =cart.items.length
        }
        // Also calculate total quantity of all items in cart
        const totalQuantity = cart.items.reduce((sum, currentItem) => sum + currentItem.quantity, 0);
       
        return res.status(200).json({
            success: true, 
            message: "Quantity updated",
            itemTotal: item.totalPrice,
            subtotal: subtotal,
            shipping: shipping,
            total: total,
            cartCount: cartCount,
            totalQuantity: totalQuantity
        });
    } catch (error) {
        console.error("Error updating quantity:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}

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

        let subtotal = 0
        cart.items.forEach(cartItem => {
            subtotal += cartItem.totalPrice
        })

        const shipping = subtotal > 500 ? 0 : 50
        const total = subtotal + shipping

        return res.status(200).json({
            success: true, 
            message: "Product removed successfully",
            subtotal: subtotal,
            shipping: shipping,
            total: total,
            cartCount: cart.items.length
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