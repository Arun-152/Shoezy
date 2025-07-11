const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let existingUser = await User.findOne({ googleId: profile.id });
        
        if (existingUser) {
            return done(null, existingUser);
        }
        
        // Check if user exists with the same email
        const email = profile.emails[0].value;
        existingUser = await User.findOne({ email: email.toLowerCase() });
        
        if (existingUser) {
            existingUser.googleId = profile.id;
            existingUser.profilePicture = profile.photos[0]?.value || '';
            existingUser.isVerified = true;
            await existingUser.save();
            return done(null, existingUser);
        }
        const newUser = new User({
            googleId: profile.id,
            fullname: profile.displayName,
            email: email.toLowerCase(),
            profilePicture: profile.photos[0]?.value || '',
            isVerified: true,
            phone: '', // Will be empty for Google users
            password: '' // No password needed for Google users
        });
        
        await newUser.save();
        done(null, newUser);
        
    } catch (error) {
        console.error('Google OAuth Error:', error);
        done(error, null);
    }
}));

module.exports = passport;