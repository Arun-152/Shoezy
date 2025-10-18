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

      let user = await User.findOne({ email });

      if (user) {
        if (user.isBlocked) {
          return done(null, false, { message: 'This account has been blocked.' });
        }
        if (!user.googleId) {
          user.googleId = profile.id;
          if (!user.profilePicture) {
            user.profilePicture = profilePicture;
          }
          await user.save();
        }
        return done(null, user); 
      }

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