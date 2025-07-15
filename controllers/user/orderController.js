const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const orderPage = async (req, res) => {
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

        return res.render("orderPage", {
            user: userData,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Order page error:", error);
        res.status(500).send("Server error");
    }
};

module.exports = {
    orderPage
}