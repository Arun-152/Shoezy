const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

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
            return res.status(404).render("usererrorPage");
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
            .populate("category")
            .limit(4); // Limit to 4 related products
        }
        if (relatedProducts.length < 4) {
            const additionalProducts = await Product.find({
                _id: { $ne: productId },
                isDeleted: false,
                isBlocked: false
            })
            .populate("category")
            .limit(4 - relatedProducts.length);

            relatedProducts = [...relatedProducts, ...additionalProducts];
        }

        return res.render("productDetailPage", {
            product: product,
            relatedProducts: relatedProducts,
            user: userData,
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
