const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcrypt");
require("dotenv").config();

const adminErrorPage = (req, res) => {
  try {
    return res.render("adminerrorPage", { title: "Error" });
  } catch (error) {
    console.error("Error rendering admin error page:", error.message);
    res.status(500).json({ message: "Server not found" });
  }
};

const adminLoginPage = async (req, res) => {
  try {
    if (req.session.adminId) {
      return res.redirect("/admin/dashboard");
    }
   
    res.render("adminloginPage", {
      email: "",
      password: "",
      title: "Admin Login"
    });
  } catch (error) {
    console.error("Error rendering admin login page:", error.message);
    res.redirect("/admin/adminErrorPage");
  }
};

const postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if this is an AJAX request
    const isAjax = req.headers['content-type'] === 'application/json' || req.headers['x-requested-with'] === 'XMLHttpRequest';

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
          errorType: "email"
        });
      }
      return res.render("adminloginPage", {
        message: "Please enter a valid email address.",
        messageType: "error",
        email: "",
        password: "",
        title: "Admin Login"
      });
    }

    // Password validation
    if (!password || password.trim().length === 0) {
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: "Please enter your password.",
          errorType: "password"
        });
      }
      return res.render("adminloginPage", {
        message: "Please enter your password.",
        messageType: "error",
        email: "",
        password: "",
        title: "Admin Login"
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: "No admin account found with this email address.",
          errorType: "email"
        });
      }
      return res.render("adminloginPage", {
        message: "No admin account found with this email address.",
        messageType: "error",
        errorType: "email",
        email: "",
        password: "",
        title: "Admin Login"
      });
    }

    if (!user.isAdmin) {
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: "This email does not have admin access.",
          errorType: "email"
        });
      }
      return res.render("adminloginPage", {
        message: "This email does not have admin access.",
        messageType: "error",
        errorType: "email",
        email: "",
        password: "",
        title: "Admin Login"
      });
    }

    const admin = user; 

    const matchpass = await bcrypt.compare(password, admin.password);

    if (!matchpass) {
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: "Incorrect password. Please try again.",
          errorType: "password"
        });
      }
      return res.render("adminloginPage", {
        message: "Incorrect password. Please try again.",
        messageType: "error",
        errorType: "password",
        email: "",
        password: "",
        title: "Admin Login"
      });
    }

    req.session.adminId = admin._id;

    if (isAjax) {
      return res.json({
        success: true,
        message: "Admin login successful!",
        redirect: "/admin/dashboard"
      });
    }
    return res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("Error during admin login:", error.message);

    const isAjax = req.headers['content-type'] === 'application/json' || req.headers['x-requested-with'] === 'XMLHttpRequest';

    if (isAjax) {
      return res.status(500).json({
        success: false,
        message: "An error occurred during login. Please try again.",
        errorType: "general"
      });
    }
    return res.render("adminloginPage", {
      message: "An error occurred during login. Please try again.",
      messageType: "error",
      email: "",
      password: "",
      title: "Admin Login"
    });
  }
};

const dashboardPage = async (req, res) => {
  try {
  
    
    // Fetch dynamic data for dashboard
    const totalUsers = await User.countDocuments({ isAdmin: false, isBlocked: false });
    const totalProducts = await Product.countDocuments({ isDeleted: false });
    const totalCategories = await Category.countDocuments({ isDeleted: false });
    const blockedUsers = await User.countDocuments({ isAdmin: false, isBlocked: true });
    
    // Calculate total sales value (sum of all variant prices)
    const products = await Product.find({ isDeleted: false });
    let totalSalesValue = 0;
    products.forEach(product => {
      product.variants.forEach(variant => {
        totalSalesValue += variant.variantPrice * variant.variantQuantity;
      });
    });
    
    // Get recent products for latest orders section
    const recentProducts = await Product.find({ isDeleted: false })
      .populate('category')
      .sort({ createdAt: -1 })
      .limit(4);
    
    const dashboardData = {
      totalSales: totalSalesValue,
      totalUsers: totalUsers,
      totalProducts: totalProducts,
      totalCategories: totalCategories,
      blockedUsers: blockedUsers,
      recentProducts: recentProducts,
      totalOrders: 0,
      visitors: totalUsers + blockedUsers
    };
    
    res.render("dashboardPage", { 
      title: "Admin Dashboard",
      data: dashboardData
    });
  } catch (error) {
    console.error("Error rendering dashboard:", error.message);
    res.status(500).json({success:false,message:`Server error: ${error.message}`});
  }
};



const salesPage = (req, res) => {
  try {
    res.render("adminsalesreportPage", { title: "Sales Report" });
  } catch (error) {
    console.error("Error rendering sales report page:", error.message);
    res.status(500).json({success:false,message:`Server error: ${error.message}`});
  }
};



const offersPage = (req, res) => {
  try {
    res.render("adminoffersPage", { title: "Offers" });
  } catch (error) {
    console.error("Error rendering offers page:", error.message);
    res.status(500).json({success:false,message:`Server error: ${error.message}`});
  }
};

const settingsPage = (req, res) => {
  try {
    res.render("settingsPage", { title: "Settings" });
  } catch (error) {
    console.error("Error rendering settings page:", error.message);
    res.status(500).json({success:false,message:`Server error: ${error.message}`});
  }
};

const adminLogout = (req, res) => {
  try {
    delete req.session.adminId;
    res.redirect("/admin/login");
  } catch (err) {
    console.error("Admin Logout error:", err.message);
    res.status(500).json({success:false,message:"Logout failed"});
  }
};


module.exports = {
  adminLoginPage,
  postLogin,
  dashboardPage,
  salesPage,
  offersPage,
  settingsPage,
  adminLogout,
  adminErrorPage,
};