const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");

const loadWishlist = async(req,res)=>{
    try{
        const userId = req.session.userId
        const user = await User.findById(userId)
        
        if(!user){
            return res.redirect("/login")
        }

        // Find user's wishlist
        const userWishlist = await Wishlist.findOne({ userId }).populate('products.productId');
        let wishlistProducts = [];
        
        if (userWishlist && userWishlist.products) {
            wishlistProducts = userWishlist.products
                .map(item => item.productId)
                .filter(product => product !== null);
        }

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

        // If this is an AJAX request, return JSON response
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(200).json({success: true, message: "Product removed from wishlist"})
        }

        // Otherwise redirect to wishlist page
        return res.redirect("/wishlist")
    } catch (error) {
        console.error(error)
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
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
        console.error('💥 Error toggling wishlist:', error)
        return res.status(500).json({success: false, message: "Server error"})
    }
}

module.exports = {
    loadWishlist,
    addToWishlist,
    removeWishlist,
    toggleWishlist,
}