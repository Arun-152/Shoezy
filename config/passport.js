const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const env = require("dotenv").config();
const {generatedReferralCode } = require("../helpers/generateReferral")

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
},
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google profile:', profile);

      const fullname = profile.displayName || profile.name?.givenName || "Nofullname";
      const email = profile.emails?.[0]?.value || `nodemail-${profile.id}@google.com`;
      const profilePicture = profile.photos?.[0]?.value || 'https://via.placeholder.com/150';

      // Check if user already exists by Google ID or email
      let user = await User.findOne({ email });

      if (user) {
        // User exists
        if (user.isBlocked) {
          // User is blocked, prevent login
          return done(null, false, { message: 'This account has been blocked.' });
        }
        if (!user.googleId) {
          // This is an existing local account, link it with Google ID
          user.googleId = profile.id;
          // Optionally update profile image if they don't have one
          if (!user.profilePicture) {
            user.profilePicture = profilePicture;
          }
          await user.save();
        }
        return done(null, user); // Login existing user
      }

      // Create new user
      const newUser = new User({
        googleId: profile.id,
        fullname,
        email,
        profilePicture,
        phone: 'registered by google',
        referralCode: generatedReferralCode(fullname),
      });

      await newUser.save();
      return done(null, newUser);

    } catch (err) {
      done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

module.exports=passport;