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
            return res.redirect("/login");
        }

        const productId = req.params.id;

        if (!productId || !productId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(404).render("usererrorPage");
        }

        const product = await Product.findOne({
            _id: productId,
            isDeleted: false,
            isBlocked: false
        }).populate("category");

        if (!product) {
            return res.render("usererrorPage");
        }

        let relatedProducts = [];
        if (product.category) {
            relatedProducts = await Product.find({
                _id: { $ne: productId },
                category: product.category._id,
                isDeleted: false,
                isBlocked: false
            })
            .populate({
                path: "category",
                match: { isListed: true, isDeleted: false }
            })
            .limit(4); 

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

            const filteredAdditionalProducts = additionalProducts.filter(product => product.category !== null);
            relatedProducts = [...relatedProducts, ...filteredAdditionalProducts];
        }

        let wishlistItems = [];
        let cartItems = [];

        if (userData) {
            const userWishlist = await Wishlist.findOne({ userId: userData._id }).populate('products.productId');
            if (userWishlist && userWishlist.products) {
                wishlistItems = userWishlist.products.map(item => item.productId).filter(product => product !== null);
            }

            const userCart = await Cart.findOne({ userId: userData._id }).populate('items.productId');
            if (userCart && userCart.items) {
                cartItems = userCart.items
                    .filter(item => item.productId !== null)
                    .map(item => ({
                        _id: item.productId._id,
                        productName: item.productId.productName,
                        size: item.size,
                        quantity: item.quantity
                    }));
            }
        }

        return res.render("productDetailPage", {
            product: product,
            relatedProducts: relatedProducts,
            user: userData,
            wishlistItems: wishlistItems,
            cartItems: cartItems,
            isLandingPage: false,
            isBlocked:false
        });

    } catch (error) {
        console.error("Product detail page error:", error);
        res.status(500).render("usererrorPage");
    }
};

module.exports = {
    productDetailPage
};