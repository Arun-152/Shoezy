const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth routes

router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account'  // Force account chooser modal
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

                // Add success flash message
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

// Handle POST request to /auth/google (from the form)
router.post('/google', (req, res) => {
    res.redirect('/auth/google');
});

// Logout route (backup - main logout is in userController)
router.get('/logout', (req, res) => {
    // Check if session exists before attempting logout
    if (req.session) {
        if (req.logout && typeof req.logout === 'function') {
            req.logout((err) => {
                if (err) {
                    console.error('Logout error:', err);
                    return res.redirect('/home');
                }
                // After passport logout, destroy the session
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Session destroy error:', err);
                        return res.redirect('/home');
                    }
                    // Clear the session cookie
                    res.clearCookie('connect.sid');
                    res.redirect('/login');
                });
            });
        } else {
            // If no passport logout needed, just destroy session
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
        // No session exists, just redirect
        res.clearCookie('connect.sid');
        res.redirect('/login');
    }
});

module.exports = router;