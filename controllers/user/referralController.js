const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");

const getReferralPage = async (req, res) => {
    try {

        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const referralCode = user.referralCode;
        const referralLink = `https://sho-ezy.shop/signup?ref=${referralCode}`;

        let wallet = await Wallet.findOne({ userId });
        // If a wallet doesn't exist for any reason, create one.
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: [],
            });
            await wallet.save();
        }
        const walletBalance = wallet.balance;


        const referrals = await User.find({ referredBy: referralCode })
            .select("fullname email createdAt")
            .sort({ createdAt: -1 })
            .limit(5);

        const totalReferrals = await User.countDocuments({ referredBy: referralCode });
        const coinsEarned = totalReferrals * 50; 
        const totalEarned = totalReferrals * 100; 

      res.render("user/referralPage", {
    user,
    referralCode,
    referralLink,
    totalReferrals,
    coinsEarned,
    totalEarned,
    walletBalance,
    recentReferrals: referrals
});



    } catch (err) {
        console.error("Error in getReferralPage:", err.message );
        res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    getReferralPage
};
