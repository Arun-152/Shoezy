const express = require('express');
const passport = require('passport');
const router = express.Router();

router.get("/auth/google",passport.authenticate("google",{scope:['profile','email']}))

router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            req.flash('error', info.message || 'Google authentication failed. Please try again.');
            return res.redirect(`/login?error=${encodeURIComponent(info.message)}`);
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error("Error during req.logIn after Google auth:", err);
                req.flash('error', 'Could not log you in after Google authentication.');
                return res.redirect('/login');
            }
            req.session.user = user._id;
            return res.redirect("/home");
        });
    })(req, res, next);
});
module.exports = router;