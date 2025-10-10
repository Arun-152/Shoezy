const User = require("../models/userSchema")

function generatedReferralCode(fullname) {
            const random = Math.floor(1000 + Math.random() * 9000);
            const initials = fullname.substring(0, 3).toUpperCase();
            return initials + random;
        }


        module.exports={generatedReferralCode}