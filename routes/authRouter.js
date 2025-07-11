const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth routes
router.get('/google', 
    passport.authenticate('google', { 
        scope: ['profile', 'email'] 
    })
);

// Google OAuth callback
router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/login?error=oauth_failed' 
    }),
    (req, res) => {
        try {
            // Successful authentication
            console.log('✅ Google OAuth successful for user:', req.user.email);
            req.session.userId = req.user._id;
            
            // Add success flash message
            req.flash('success_msg', 'Successfully signed in with Google!');
            res.redirect('/home');
        } catch (error) {
            console.error('❌ Error in OAuth callback:', error);
            req.flash('error_msg', 'Authentication failed. Please try again.');
            res.redirect('/login');
        }
    }
);

// Handle POST request to /auth/google (from the form)
router.post('/google', (req, res) => {
    // Redirect to the GET route which handles the actual OAuth
    res.redirect('/auth/google');
});

// Logout route
router.get('/logout', (req, res) => {
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
            res.redirect('/login');
        });
    });
});

module.exports = router;