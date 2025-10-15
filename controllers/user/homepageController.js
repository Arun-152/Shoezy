const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");

const homePage = async (req, res) => {
 
    try {
        const userData = req.session.userId;
        let user = null;

        // Check if user is logged 
        if (userData) {
            user = await User.findById(userData);
        }

        const featuredProducts = await Product.find({ isDeleted: false, isBlocked: false })
            .populate({
                path: "category",
                match: { isListed: true, isDeleted: false }
            })
            .sort({ createdAt: -1 })
            .limit(6);
          
        const filteredProducts = featuredProducts.filter(product => product.category !== null);
     

      
        let wishlistItems = [];
        let cartItems = [];

        if (userData) {
            const userWishlist = await Wishlist.findOne({ userId: userData }).populate({
                path: 'products.productId',
                match: { isDeleted: false, isBlocked: false },
                populate: {
                    path: 'category',
                    match: { isListed: true, isDeleted: false }
                }
                
            });
           

            if (userWishlist && userWishlist.products.length > 0) {
                wishlistItems = userWishlist.products
                    .filter(item => item.productId && item.productId.category) 
                    .map(item => item.productId._id.toString());
            }
     
            const userCart = await Cart.findOne({ userId: userData }).populate({
                path: 'items.productId',
                match: { isDeleted: false, isBlocked: false },
                populate: {
                    path: 'category',
                    match: { isListed: true, isDeleted: false }
                }
            });
            if (userCart && userCart.items.length > 0) {
                cartItems = userCart.items
                    .filter(item => item.productId && item.productId.category)
                    .map(item => item.productId._id.toString());
            }
        }
        

        return res.render("homePage", {
            products: filteredProducts,
            user: user,
            wishlistItems: wishlistItems,
            cartItems: cartItems,
            isLandingPage: false
        });

    } catch (error) {
        console.error("Error in homePage:", error.message);
        return res.redirect("/usererrorPage");
    }
};

module.exports = {
    homePage
};
