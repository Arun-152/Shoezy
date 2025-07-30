const User = require("../../models/userSchema")
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");


const productDetailPage = async (req, res) => {
    try {
        // Check if user is logged in
        let userData = null;
        if (req.session.userId) {
            userData = await User.findById(req.session.userId);
            if (!userData) {
                return res.redirect("/login");
            }
        } else {
            // Redirect to login if user is not authenticated
            return res.redirect("/login");
        }

        const productId = req.params.id;

        // Validate product ID
        if (!productId || !productId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(404).render("usererrorPage");
        }

        // Find the product with populated category
        const product = await Product.findOne({
            _id: productId,
            isDeleted: false,
            isBlocked: false
        }).populate("category");

        if (!product) {
            return res.render("usererrorPage");
        }

        // Find related products from the same category
        let relatedProducts = [];
        if (product.category) {
            relatedProducts = await Product.find({
                _id: { $ne: productId }, // Exclude current product
                category: product.category._id,
                isDeleted: false,
                isBlocked: false
            })
            .populate({
                path: "category",
                match: { isListed: true, isDeleted: false }
            })
            .limit(4); // Limit to 4 related products

            // Filter out products with unlisted categories
            relatedProducts = relatedProducts.filter(product => product.category !== null);
        }
        if (relatedProducts.length < 4) {
            const additionalProducts = await Product.find({
                _id: { $ne: productId },
                isDeleted: false,
                isBlocked: false
            })
            .populate({
                path: "category",
                match: { isListed: true, isDeleted: false }
            })
            .limit(4 - relatedProducts.length);

            // Filter out products with unlisted categories
            const filteredAdditionalProducts = additionalProducts.filter(product => product.category !== null);
            relatedProducts = [...relatedProducts, ...filteredAdditionalProducts];
        }

        // Initialize empty arrays for wishlist and cart items
        let wishlistItems = [];
        let cartItems = [];

        // Fetch user's wishlist and cart data
        if (userData) {
            // Fetch user's wishlist
            const userWishlist = await Wishlist.findOne({ userId: userData._id }).populate('products.productId');
            if (userWishlist && userWishlist.products) {
                wishlistItems = userWishlist.products.map(item => item.productId).filter(product => product !== null);
            }

            // Fetch user's cart
            const userCart = await Cart.findOne({ userId: userData._id }).populate('items.productId');
            if (userCart && userCart.items) {
                cartItems = userCart.items.map(item => item.productId).filter(product => product !== null);
            }
        }

        return res.render("productDetailPage", {
            product: product,
            relatedProducts: relatedProducts,
            user: userData,
            wishlistItems: wishlistItems,
            cartItems: cartItems,
            wishlistCount: wishlistItems.length,
            cartCount: cartItems.length,
            isLandingPage: false,
        });

    } catch (error) {
        console.error("Product detail page error:", error);
        res.status(500).render("usererrorPage");
    }
};

module.exports = {
    productDetailPage
};
