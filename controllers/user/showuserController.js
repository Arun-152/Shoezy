const User = require("../../models/userSchema");

const showUser = async (req, res) => {
    try {
        const userId = req.session.userId;

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect("/loginPage");
        }

        res.render("myaccount", {
            user: userData,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Show user error:", error);
        res.status(500).render("usererrorPage");
    }
};

module.exports = {
    showUser
};
