const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema")
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
const dashboard = async (req, res) => {
  try {
    // Total Customers (non-admin users)
    const totalCustomers = await User.countDocuments({ isAdmin: false });

    // Total Products (active products)
    const totalProducts = await Product.countDocuments({
      isDeleted: false,
      isBlocked: false,
    });

    // Total Orders
    const totalOrders = await Order.countDocuments();

    // Total Revenue (from delivered and paid orders)
    const revenueAgg = await Order.aggregate([
      {
        $match: {
          orderStatus: "Delivered",
          paymentStatus: "Paid",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    // Order Status Counts
    const statusCounts = await Order.aggregate([
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
    ]);
    let pending = 0,
      processing = 0,
      shipped = 0,
      delivered = 0;
    statusCounts.forEach((s) => {
      if (s._id === "Pending") pending = s.count;
      else if (s._id === "Processing") processing = s.count;
      else if (s._id === "Shipped") shipped = s.count;
      else if (s._id === "Delivered") delivered = s.count;
    });

    // Recent Orders (last 5)
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "fullname");
    const recentOrdersData = recentOrders.map((order) => ({
      orderNumber: order.orderNumber,
      customer: order.userId ? order.userId.fullname : "Unknown",
      status: order.orderStatus,
      amount: order.totalAmount,
      date: order.createdAt.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

    // Most Ordered Products (top 5 by number of unique orders)
    const mostOrderedProducts = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          orders: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          count: { $size: "$orders" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.productName",
          count: 1,
        },
      },
    ]);

    // Most Ordered Categories (top 5 by number of unique orders containing products from category)
    const mostOrderedCategories = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          orders: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          count: { $size: "$orders" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          name: "$category.name", // Assuming Category has a 'name' field
          count: 1,
        },
      },
    ]);

    // Sales Data for Chart (monthly sales over last 12 months)
    const monthlySalesRaw = await Order.aggregate([
      {
        $match: {
          orderStatus: "Delivered",
          paymentStatus: "Paid",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);
    const monthlySales = monthlySalesRaw
      .map((s) => ({
        label: `${s._id.month}/${s._id.year % 100}`,
        total: s.total,
      }))
      .reverse(); // Oldest to newest

    // Percentage Calculations (last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Helper functions
    const getPeriodRevenue = async (start, end) => {
      const agg = await Order.aggregate([
        {
          $match: {
            orderStatus: "Delivered",
            paymentStatus: "Paid",
            createdAt: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalAmount" },
          },
        },
      ]);
      return agg.length > 0 ? agg[0].total : 0;
    };

    const getPeriodOrders = async (start, end) => {
      return await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
      });
    };

    const getPeriodNewCustomers = async (start, end) => {
      return await User.countDocuments({
        isAdmin: false,
        createdAt: { $gte: start, $lt: end },
      });
    };

    const getPeriodNewProducts = async (start, end) => {
      return await Product.countDocuments({
        createdAt: { $gte: start, $lt: end },
      });
    };

    const currentRevenue = await getPeriodRevenue(thirtyDaysAgo, now);
    const previousRevenue = await getPeriodRevenue(sixtyDaysAgo, thirtyDaysAgo);
    const revenuePercentage =
      previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(
            1
          )
        : 0;

    const currentOrders = await getPeriodOrders(thirtyDaysAgo, now);
    const previousOrders = await getPeriodOrders(sixtyDaysAgo, thirtyDaysAgo);
    const ordersPercentage =
      previousOrders > 0
        ? ((currentOrders - previousOrders) / previousOrders * 100).toFixed(1)
        : 0;

    const currentNewCustomers = await getPeriodNewCustomers(thirtyDaysAgo, now);
    const previousNewCustomers = await getPeriodNewCustomers(sixtyDaysAgo, thirtyDaysAgo);
    const customersPercentage =
      previousNewCustomers > 0
        ? (
            (currentNewCustomers - previousNewCustomers) /
            previousNewCustomers *
            100
          ).toFixed(1)
        : 0;

    const currentNewProducts = await getPeriodNewProducts(thirtyDaysAgo, now);
    const previousNewProducts = await getPeriodNewProducts(sixtyDaysAgo, thirtyDaysAgo);
    const productsPercentage =
      previousNewProducts > 0
        ? (
            (currentNewProducts - previousNewProducts) /
            previousNewProducts *
            100
          ).toFixed(1)
        : 0;

    // Render the dashboard with dynamic data
   res.render("dashboardPage", {
  totalCustomers,
  customersPercentage: `${customersPercentage > 0 ? "+" : ""}${customersPercentage}%`,
  totalRevenue: `₹${totalRevenue.toLocaleString("en-IN")}`,
  revenuePercentage: `${revenuePercentage > 0 ? "+" : ""}${revenuePercentage}%`,
  totalOrders,
  ordersPercentage: `${ordersPercentage > 0 ? "+" : ""}${ordersPercentage}%`,
  totalProducts,
  productsPercentage: `${productsPercentage > 0 ? "+" : ""}${productsPercentage}%`,
  pending,
  processing,
  shipped,
  delivered,
  recentOrdersData,
  mostOrderedProducts, 
  mostOrderedCategories, 
  monthlySales, 
});

  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.render("admin500");
  }
}

module.exports = {
  adminLoginPage,
  postLogin,
  offersPage,
  settingsPage,
  adminLogout,
  adminErrorPage,
  dashboard
};