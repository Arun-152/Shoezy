const { application } = require("express");
const User = require("../models/userSchema");

const userAuth = async (req, res, next) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      if(req.headers.accept?.includes("application/json")){
        return res.json({success:false,message:"Please login to continue"})
      }
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    if (!user || user.isBlocked) {
      delete req.session.userId;
      delete req.session.role;
      return res.redirect('/login');
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.redirect('/login');
  }
};

const adminAuth = (req, res, next) => {
  try {
    if (req.session && req.session.adminId) {
      return next();
    } else {
      delete req.session.adminId;
      delete req.session.role;
      return res.redirect("/admin/login");
    }
  } catch (error) {
    console.error("Admin Auth Middleware Error:", error);
    return res.redirect("/pageerror");
  }
};

module.exports = {
  userAuth,
  adminAuth
};
