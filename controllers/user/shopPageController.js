const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");

const shopPage = async (req, res) => {
    try {
       
        const userData = req.session.userId
        const products = await Product.find({ isDeleted: false, isBlocked: false })
            .populate({
                path: "category",
                match: { isListed: true, isDeleted: false }
            })
            .sort({ createdAt: -1 });

        // Filter out products with unlisted categories
        const filteredProducts = products.filter(product => product.category !== null);

        const categories = await Category.find({ isDeleted: false, isListed: true });

        // Initialize empty arrays for wishlist and cart items
        let wishlistItems = [];
        let cartItems = [];

        // If user is logged in, fetch their wishlist and cart data
        if (userData) {
            // Fetch user's wishlist
            const userWishlist = await Wishlist.findOne({ userId: userData }).populate('products.productId');
            if (userWishlist && userWishlist.products) {
                wishlistItems = userWishlist.products.map(item => item.productId).filter(product => product !== null);
            }

            // Fetch user's cart
            const userCart = await Cart.findOne({ userId: userData }).populate('items.productId');
            if (userCart && userCart.items) {
                cartItems = userCart.items.map(item => item.productId).filter(product => product !== null);
            }
        }

        const user  = await User.findById(userData)

        return res.render("shopPage", {
            products: filteredProducts,
            categories: categories,
            user: user,
            wishlistItems: wishlistItems,
            cartItems: cartItems,
            isLandingPage: false,
            
        });
    } catch (error) {
        console.error("Shop page error:", error);
        res.status(500).send("Server error");
    }
};


module.exports = {
    shopPage
}