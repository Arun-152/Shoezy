const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");
const Cart = require("../../models/cartSchema");

const loadWishlist = async(req,res)=>{
    try{
        const userId = req.session.userId
        const user = await User.findById(userId)
        
        if(!user){
            return res.redirect("/login")
        }

        // Find user's wishlist
        const userWishlist = await Wishlist.findOne({ userId }).populate({
            path: 'products.productId',
            populate: {
                path: 'category',
                match: { isListed: true, isDeleted: false }
            }
        });
        
        let wishlistProducts = [];
        
        
        if (userWishlist && userWishlist.products) {
            wishlistProducts = userWishlist.products
                .map(item => item.productId)
                .filter(product => product !== null && product.category !== null);
           
        }

        const userCart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            match: { isDeleted: false, isBlocked: false },
            populate: {
                path: 'category',
                match: { isListed: true, isDeleted: false }
            }
        });
        
        
      

        return res.render("wishlistPage",{
            user,
            wishlist: wishlistProducts,
            
        })
    }catch(error){
        console.error(error)
        return res.redirect("/usererrorPage")
    }
}

const addToWishlist = async(req,res)=>{
    try {
        const productId = req.body.productId
        const userId = req.session.userId || req.body.user

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        // Check if product exists
        const product = await Product.findById(productId)
        if (!product) {
            return res.status(404).json({success: false, message: "Product not found"})
        }

        // Find or create user's wishlist
        let userWishlist = await Wishlist.findOne({ userId })
        
        if (!userWishlist) {
            userWishlist = new Wishlist({ userId, products: [] })
        }

        // Check if product already exists in wishlist
        const existingProduct = userWishlist.products.find(
            item => item.productId.toString() === productId
        )

        if (existingProduct) {
            return res.status(200).json({success: false, message: "Product already in wishlist"})
        }

        // Add product to wishlist
        userWishlist.products.push({ productId })
        await userWishlist.save()

        return res.status(200).json({success: true, message: "Product added to wishlist"})
    } catch (error) {
        console.error(error)
        return res.status(500).json({success: false, message: "Server error"})
    }
}

const removeWishlist = async(req,res)=>{
    try {
        const productId = req.query.productId || req.body.productId
        const userId = req.session.userId

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        // Find user's wishlist
        const userWishlist = await Wishlist.findOne({ userId })
        
        if (!userWishlist) {
            return res.status(404).json({success: false, message: "Wishlist not found"})
        }

        // Remove product from wishlist
        userWishlist.products = userWishlist.products.filter(
            item => item.productId.toString() !== productId
        )

        await userWishlist.save()

        // Check if this is an AJAX request
        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                      req.headers['accept'] && req.headers['accept'].includes('application/json') ||
                      req.headers['content-type'] && req.headers['content-type'].includes('application/json');

        if (isAjax) {
            return res.status(200).json({success: true, message: "Product removed from wishlist"})
        }

        // Otherwise redirect to wishlist page
        return res.redirect("/wishlist")
    } catch (error) {
        console.error(error)
        
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

// Toggle wishlist - Add if not present, remove if present
const toggleWishlist = async(req,res)=>{
    try {
        const { productId } = req.body
        const userId = req.session.userId
    
        
        if (!userId) {
            
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        // Check if product exists
        const product = await Product.findById(productId)
        if (!product) {
          
            return res.status(404).json({success: false, message: "Product not found"})
        }

        // Find or create wishlist
        let userWishlist = await Wishlist.findOne({ userId })
        if (!userWishlist) {
          
            userWishlist = new Wishlist({ userId, products: [] })
        }

        // Check if product already in wishlist
        const existingProductIndex = userWishlist.products.findIndex(item => 
            item.productId.toString() === productId
        )

        let action = '';
        let message = '';

        if (existingProductIndex > -1) {
            // Product exists, remove it
            userWishlist.products.splice(existingProductIndex, 1)
            action = 'removed';
            message = 'Product removed from wishlist';
          
        } else {
            // Product doesn't exist, add it
            userWishlist.products.push({ productId })
            action = 'added';
            message = 'Product added to wishlist';
         
        }

        await userWishlist.save()
        
        
        return res.status(200).json({
            success: true, 
            message: message,
            action: action,
            isInWishlist: action === 'added'
        })
        
    } catch (error) {
        console.error('Error toggling wishlist:', error)
        return res.status(500).json({success: false, message: "Server error"})
    }
}

// Clear entire wishlist
const clearWishlist = async(req,res)=>{
    try {
        const userId = req.session.userId

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        // Find user's wishlist
        const userWishlist = await Wishlist.findOne({ userId })
        
        if (!userWishlist) {
            return res.status(404).json({success: false, message: "Wishlist not found"})
        }

        // Clear all products from wishlist
        userWishlist.products = []
        await userWishlist.save()

        // Check if this is an AJAX request
        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                      req.headers['accept'] && req.headers['accept'].includes('application/json') ||
                      req.headers['content-type'] && req.headers['content-type'].includes('application/json');

        if (isAjax) {
            return res.status(200).json({success: true, message: "Wishlist cleared successfully"})
        }

        // Otherwise redirect to wishlist page
        return res.redirect("/wishlist")
    } catch (error) {
        console.error(error)
        
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

// Add to cart from wishlist
const addToCartFromWishlist = async(req,res)=>{
    try {
        const { productId, size } = req.body
        const userId = req.session.userId

        if (!userId) {
            return res.status(401).json({success: false, message: "User not authenticated"})
        }

        if (!productId || !size) {
            return res.status(400).json({success: false, message: "Product ID and size are required"})
        }

        // Check if product exists and is available
        const product = await Product.findById(productId).populate("category")
        if (!product || product.isDeleted || product.isBlocked) {
            return res.status(400).json({success: false, message: "This product is unavailable"})
        }

        if (!product.category || !product.category.isListed || product.category.isDeleted) {
            return res.status(400).json({success: false, message: "This product category is unavailable"})
        }

        // Find the variant with the selected size
        const selectedVariant = product.variants.find(v => v.size === size);
        if (!selectedVariant) {
            return res.status(400).json({success: false, message: "Selected size not available"})
        }

        // Check if the selected variant is out of stock
        if (selectedVariant.variantQuantity <= 0) {
            return res.status(400).json({success: false, message: "Out of Stock", isOutOfStock: true})
        }

        // Check overall product stock status
        const totalStock = product.variants.reduce((sum, variant) => sum + variant.variantQuantity, 0);
        if (totalStock <= 0) {
            return res.status(400).json({success: false, message: "Out of Stock", isOutOfStock: true})
        }

        // Add to cart
 
        let userCart = await Cart.findOne({userId})
        if (!userCart) {
            userCart = new Cart({userId, items: []})
        }

        // Check if product with same size already exists in cart
        const existingItemIndex = userCart.items.findIndex(item => 
            item.productId.toString() === productId && (item.size || "Default") === size
        )

        if (existingItemIndex > -1) {
            // Update existing item quantity
            userCart.items[existingItemIndex].quantity += 1
            userCart.items[existingItemIndex].totalPrice = userCart.items[existingItemIndex].price * userCart.items[existingItemIndex].quantity
        } else {
            // Add new item to cart
            userCart.items.push({
                productId: productId,
                size: size,
                quantity: 1,
                price: selectedVariant.salePrice,
                totalPrice: selectedVariant.salePrice
            })
        }

        await userCart.save()

        // Calculate updated cart count
        const updatedCart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            match: { isDeleted: false, isBlocked: false },
            populate: {
                path: 'category',
                match: { isListed: true, isDeleted: false }
            }
        });
        
        let cartCount = 0;
         if(updatedCart && updatedCart.items){
                cartCount = updatedCart.items.length
        }

        // Remove from wishlist
        const userWishlist = await Wishlist.findOne({ userId })
        if (userWishlist) {
            userWishlist.products = userWishlist.products.filter(
                item => item.productId.toString() !== productId
            )
            await userWishlist.save()
        }

        return res.status(200).json({
            success: true, 
            message: "Product moved to cart successfully",
            cartCount: cartCount
        })

    } catch (error) {
        console.error('Error adding to cart from wishlist:', error)
        return res.status(500).json({success: false, message: "Server error"})
    }
}


const wishlistStatus = async(req,res)=>{
    try{
        const userId=req.session.userId
        const wishlist = await Wishlist.findOne(userId)
        const wishlistItems = wishlist.products.map((items)=>items.productId.toString())
        res.json({success:true,wishlistItems})
    }catch(error){
        console.error()
    }
}

module.exports = {
    loadWishlist,
    addToWishlist,
    removeWishlist,
    toggleWishlist,
    clearWishlist,
    addToCartFromWishlist,
    wishlistStatus
}