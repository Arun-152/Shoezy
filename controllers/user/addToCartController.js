const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema")
const Wishlist = require("../../models/wishlistSchema")

const loadAddToCart= async (req, res) => {
    try {
        const userId = req.session.userId
        if (!userId) {
            return res.redirect("/login");
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect("/login");
        }

        // Get user's cart with populated product details
        const userCart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            match: { isDeleted: false, isBlocked: false },
            populate: {
                path: 'category',
                match: { isListed: true, isDeleted: false }
            }
        });

        let cartItems = [];
        let cartCount = 0;
        let subtotal = 0;

        if (userCart && userCart.items.length > 0) {
            // Ensure all cart items have a size field for legacy compatibility
            let cartUpdated = false;
            userCart.items.forEach(item => {
                if (!item.size) {
                    item.size = "Default";
                    cartUpdated = true;
                }
            });
            
            // Save cart if we updated any items
            if (cartUpdated) {
                await userCart.save();
            }

            cartItems = userCart.items
                .filter(item => item.productId && item.productId.category)
                .map(item => {
                    const itemTotal = item.price * item.quantity;
                    subtotal += itemTotal;
                    return {
                        ...item.toObject(),
                        itemTotal: itemTotal
                    };
                });
            cartCount = cartItems.length;
        }

        // Get wishlist count for navbar
        const userWishlist = await Wishlist.findOne({ userId }).populate({
            path: 'products.productId',
            match: { isDeleted: false, isBlocked: false },
            populate: {
                path: 'category',
                match: { isListed: true, isDeleted: false }
            }
        });

        let wishlistCount = 0;
        if (userWishlist && userWishlist.products.length > 0) {
            const validWishlistItems = userWishlist.products.filter(item => item.productId && item.productId.category);
            wishlistCount = validWishlistItems.length;
        }

        // Calculate totals
        const shipping = subtotal > 500 ? 0 : 50; // Free shipping over ₹500
        const total = subtotal + shipping;

        return res.render("addToCartPage", {
            user: user,
            cartItems: cartItems,
            cartCount: cartCount,
            wishlistCount: wishlistCount,
            subtotal: subtotal,
            shipping: shipping,
            total: total
        });
    } catch (error) {
        console.error("Add to cart page error:", error);
        res.redirect("/usererrorPage");
    }        
}   


 const addToCart = async(req,res)=>{
    try {
        const userId = req.session.userId
        let {productId, size, price, quantity} = req.body

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        // Validate required fields - size is optional for shop page quick add
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

        // Find or create user's cart
        let userCart = await Cart.findOne({userId})
        if (!userCart) {
            userCart = new Cart({userId, items: []})
        }

        // Check if product with same size already exists in cart
        const existingItemIndex = userCart.items.findIndex(item => 
            item.productId.toString() === productId && (item.size || "Default") === size
        )

        if (existingItemIndex > -1) {
            // Update existing item quantity - prevent duplicates by increasing quantity
            userCart.items[existingItemIndex].quantity += parseInt(quantity)
            userCart.items[existingItemIndex].totalPrice = userCart.items[existingItemIndex].price * userCart.items[existingItemIndex].quantity
            // Ensure the size field is set for existing items
            if (!userCart.items[existingItemIndex].size) {
                userCart.items[existingItemIndex].size = size;
            }
        } else {
            // Add new item to cart only if it doesn't exist
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
                cartCount: userCart.items.length, // Number of unique items
                totalQuantity: totalQuantity // Total quantity of all items
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
        const {productId, size, quantity} = req.body

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        const cart = await Cart.findOne({userId})
        if (!cart) {
            return res.status(404).json({success: false, message: "Cart not found"})
        }

        const item = cart.items.find(item => 
            item.productId.toString() === productId && (item.size || "Default") === (size || "Default")
        )
        if (!item) {
            return res.status(404).json({success: false, message: "Item not in cart"})
        }

        // Validate quantity
        const newQuantity = parseInt(quantity)
        if (newQuantity < 1 || newQuantity > 10) {
            return res.status(400).json({success: false, message: "Invalid quantity"})
        }

        // Update quantity and total price
        item.quantity = newQuantity
        item.totalPrice = item.price * newQuantity

        await cart.save()

        // Calculate new totals
        let subtotal = 0
        cart.items.forEach(cartItem => {
            subtotal += cartItem.totalPrice
        })

        const shipping = subtotal > 500 ? 0 : 50
        const total = subtotal + shipping

        return res.status(200).json({
            success: true, 
            message: "Quantity updated",
            itemTotal: item.totalPrice,
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

        // Remove item from cart (filter by both productId and size)
        cart.items = cart.items.filter(item => 
            !(item.productId.toString() === productId && (item.size || "Default") === (size || "Default"))
        )
        await cart.save()

        // Calculate new totals
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

module.exports = {
    loadAddToCart,
    addToCart,
    updateQuantity,
    removeCart,
    clearCart
}