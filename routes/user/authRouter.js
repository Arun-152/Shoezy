const express = require("express");
const passport = require("passport");
const router = express.Router();

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/google/callback", (req, res, next) => {
  passport.authenticate(
    "google",
    { failureRedirect: "/login" },
    async (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const message = info?.message || "Google authentication failed.";
        return res.redirect(`/login?error=${encodeURIComponent(message)}`);
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error("Error during req.logIn:", err);
          return res.redirect("/login");
        }

        // Manually set the userId in the session
        req.session.userId = user._id;
        
        // Save the session before redirecting
        req.session.save(() => res.redirect("/"));
      });
    }
  )(req, res, next);
});

module.exports = router;
