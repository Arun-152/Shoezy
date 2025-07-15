const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const shopPage = async (req, res) => {
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

        const products = await Product.find({ isDeleted: false, isBlocked: false })
            .populate("category")
            .sort({ createdAt: -1 });

        const categories = await Category.find({ isDeleted: false, isListed: true });

        return res.render("shopPage", {
            products: products,
            categories: categories,
            user: userData,
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