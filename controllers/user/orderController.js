const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const orderPage = async (req, res) => {
    try {
        const userData = req.session.userId
        if (!userData) {
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