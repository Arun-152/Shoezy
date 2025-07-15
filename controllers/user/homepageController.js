const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const homePage = async (req, res) => {
    try {
        // Check if user is logged in (optional for home page)
        let userData = null;
        if (req.session.userId) {
            userData = await User.findById(req.session.userId);
        }

        const featuredProducts = await Product.find({ isDeleted: false, isBlocked: false })
            .populate("category")
            .sort({ createdAt: -1 })
            .limit(6);

        return res.render("homePage", {
            products: featuredProducts,
            user: userData,
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
