const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");

const homePage = async (req, res) => {
    try {
        // Check if user is logged in (optional for home page)
        const userData = req.session.userId;
        let user = null;
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

        // Filter out products with unlisted categories
        const filteredProducts = featuredProducts.filter(product => product.category !== null);

        // Initialize empty arrays for wishlist and cart items
        let wishlistItems = [];
        let cartItems = [];

        // If user is logged in, fetch their wishlist and cart data
        if (userData) {
            // Fetch user's wishlist
            const userWishlist = await Wishlist.findOne({ userId: userData }).populate('products.productId');
            if (userWishlist && userWishlist.products) {
                wishlistItems = userWishlist.products.map(item => item.productId._id.toString()).filter(id => id !== null);
            }

            // Fetch user's cart
            const userCart = await Cart.findOne({ userId: userData }).populate('items.productId');
            if (userCart && userCart.items) {
                cartItems = userCart.items.map(item => item.productId).filter(product => product !== null);
            }
        }

        return res.render("homePage", {
            products: filteredProducts,
            user: user,
            wishlistItems: wishlistItems,
            cartItems: cartItems,
            wishlistCount: wishlistItems.length,
            cartCount: cartItems.length,
            isLandingPage: false,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    homePage
};
