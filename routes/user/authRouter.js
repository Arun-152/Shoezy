const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth routes

router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account' 
    })
);

// Google OAuth callback
router.get('/google/callback',
    (req, res, next) => {
        if (!req.session) {
            console.error('Session not found during OAuth callback');
            return res.redirect('/login?error=session_error');
        }
        next();
    },
    passport.authenticate('google', {
        failureRedirect: '/login?error=oauth_failed'
    }),
    (req, res) => {
        try {
            if (req.session) {
                req.session.userId = req.user._id;

                req.flash('success_msg', 'Successfully signed in with Google!');
                res.redirect('/home');
            } else {
                console.error('Session not available after OAuth success');
                res.redirect('/login?error=session_error');
            }
        } catch (error) {
            console.error('Error in OAuth callback:', error);
            req.flash('error_msg', 'Authentication failed. Please try again.');
            res.redirect('/login');
        }
    }
);

router.post('/google', (req, res) => {
    res.redirect('/auth/google');
});

router.get('/logout', (req, res) => {
    if (req.session) {
        if (req.logout && typeof req.logout === 'function') {
            req.logout((err) => {
                if (err) {
                    console.error('Logout error:', err);
                    return res.redirect('/home');
                }
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Session destroy error:', err);
                        return res.redirect('/home');
                    }
                    res.clearCookie('connect.sid');
                    res.redirect('/login');
                });
            });
        } else {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destroy error:', err);
                    return res.redirect('/home');
                }
                res.clearCookie('connect.sid');
                res.redirect('/login');
            });
        }
    } else {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    }
});

module.exports = router;