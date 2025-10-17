const express = require('express');
const passport = require('passport');
const router = express.Router();

router.get("/auth/google",passport.authenticate("google",{scope:['profile','email']}))

router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        if (err) return next(err);
        if (!user) {          
            return res.redirect(`/signup?error=${encodeURIComponent(info.message)}`);
        }
        req.logIn(user, (err) => {
            if (err) return next(err);
            req.session.user = user._id;
            return res.redirect("/home");
        });
    })(req,res,next);
});
module.exports = router;