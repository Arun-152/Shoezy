const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcrypt");
require("dotenv").config();

const adminerrorPage = (req, res) => {
  try {
    return res.render("adminerrorPage", { title: "Error" });
  } catch (error) {
    console.error("Error rendering admin error page:", error.message);
    res.status(500).json({ message: "Server not found" });
  }
};

const adminloginpage = async (req, res) => {
  try {
    const { email = "", password = "" } = req.query;
    if (req.session.adminId) {
      console.log("Admin already logged in, redirecting to dashboard");
      return res.redirect("/admin/dashboard");
    }
    res.render("adminloginPage", { email, password, title: "Admin Login" });
  } catch (error) {
    console.error("Error rendering admin login page:", error.message);
    res.redirect("/admin/adminerrorPage");
  }
};

const postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });
    if (!admin) {
      console.log("Admin not found for email:", email);
      return res.redirect("/admin/login");
    }
    const matchpass = await bcrypt.compare(password, admin.password);
    if (!matchpass) {
      console.log("Incorrect password for admin:", email);
      return res.redirect("/admin/login");
    }
    req.session.adminId = admin._id;
    console.log("Admin logged in, session adminId:", req.session.adminId);
    return res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("Error during admin login:", error.message);
    res.status(500).json({ error: "Failed to login" });
  }
};

const dashboardPage = async (req, res) => {
  try {
    console.log("Session adminId:", req.session.adminId); // Debug session
    
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
      // Mock data for orders since we don't have order schema yet
      totalOrders: 0,
      visitors: totalUsers + blockedUsers
    };
    
    res.render("dashboardPage", { 
      title: "Admin Dashboard",
      data: dashboardData
    });
  } catch (error) {
    console.error("Error rendering dashboard:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const ordersPage = (req, res) => {
  try {
    res.render("adminordersPage", { title: "Orders" });
  } catch (error) {
    console.error("Error rendering orders page:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const coupenPage = (req, res) => {
  try {
    res.render("admincoupenPage", { title: "Coupons" });
  } catch (error) {
    console.error("Error rendering coupons page:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const salesPage = (req, res) => {
  try {
    res.render("adminsalesreportPage", { title: "Sales Report" });
  } catch (error) {
    console.error("Error rendering sales report page:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const categoryPage = (req, res) => {
  try {
    res.render("admincategoryPage", { title: "Categories" });
  } catch (error) {
    console.error("Error rendering category page:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const offersPage = (req, res) => {
  try {
    res.render("adminoffersPage", { title: "Offers" });
  } catch (error) {
    console.error("Error rendering offers page:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const settingsPage = (req, res) => {
  try {
    res.render("settingsPage", { title: "Settings" });
  } catch (error) {
    console.error("Error rendering settings page:", error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

const adminLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err.message);
      return res.status(500).send("Logout failed");
    }
    console.log("Admin logged out successfully");
    res.redirect("/admin/login");
  });
};

module.exports = {
  adminloginpage,
  postLogin,
  dashboardPage,
  ordersPage,
  coupenPage,
  salesPage,
  categoryPage,
  offersPage,
  settingsPage,
  adminLogout,
  adminerrorPage,
};