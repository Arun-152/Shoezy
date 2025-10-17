const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const env = require("dotenv").config();
const {generatedReferralCode } = require("../helpers/generateReferral")



passport.use(
  new GoogleStrategy(
    { 
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const fullname = profile.displayName;
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const profilePicture = profile.photos && profile.photos[0]? profile.photos[0].value : "";

        const user = await User.findOne({ email });
        if (user) {
          if(user.isBlocked){
            return done(null,false,{message:"Your account has been blocked by admin"})
          }
          if(!user.googleId){
             user.googleId = profile._id
             if(!user.profilePicture || !user.profilePicture.url){
               user.profileImage = { public_id: "", url: profilePicture };
            }
            await user.save();
          }
          return done(null, user);
        }

        const newUser = {
          fullname,
          email,
          googleId: profile._id,
          profilePicture:{
            public_id: "",
            url: profilePicture
          },
          phone:"Registered By Google",
          referralCode:generatedReferralCode(),
          
        }
        await newUser.save();
        return done(null, newUser); 

      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user);
    })
    .catch((err) => {
      done(err, null);
    });
});

module.exports=passport;