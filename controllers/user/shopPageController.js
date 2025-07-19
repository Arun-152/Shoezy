const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

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

        return res.render("shopPage", {
            products: filteredProducts,
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