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

    // Define a filter to exclude failed online orders
    const excludeFailedOrdersFilter = {
      orderStatus: { $nin: ["Failed", "payment-failed"] },
      paymentStatus: { $ne: "Failed_Stock_Issue" }
    };

    // Total Sold Products (Quantity)
    const soldProductsAgg = await Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          orderStatus: { $nin: ["Cancelled", "Returned", "Failed", "payment-failed"] },
          "items.status": { $in: ["Delivered", "Shipped", "Processing"] }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: "$items.quantity" }
        }
      }
    ]);
    const totalSoldProducts = soldProductsAgg.length > 0 ? soldProductsAgg[0].count : 0;


    // Order Status Counts
    const statusCounts = await Order.aggregate([
      {
        $match: excludeFailedOrdersFilter
      },
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

    // --- Fetch all relevant orders to calculate revenue and populate the table ---
    const allOrders = await Order.find(excludeFailedOrdersFilter)
      .populate('userId', 'fullname')
      .populate('items.productId', 'productName')
      .populate('couponId', 'discountType')
      .sort({ createdAt: -1 })
      .lean();

    // --- Flatten orders into sales data (like sales report) ---
    const salesData = allOrders.flatMap(order => {
      const orderDiscount = Number(order.discountAmount) || 0;
      const orderSubtotal = order.items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
      const isFlatCoupon = order.couponId?.discountType === 'flat';
      const totalItemsInOrder = order.items.length > 0 ? order.items.length : 1;

      return order.items.map(item => {
        const itemPrice = Number(item.totalPrice) || 0;
        let itemDiscount = 0;

        if (isFlatCoupon) {
          itemDiscount = orderDiscount / totalItemsInOrder;
        } else {
          itemDiscount = orderSubtotal > 0 ? (itemPrice / orderSubtotal) * orderDiscount : 0;
        }
        const netItemPrice = itemPrice - itemDiscount;

        return {
          orderNumber: order.orderNumber,
          customer: order.userId ? order.userId.fullname : "Unknown",
          productName: item.productId?.productName || 'Unknown Product',
          status: item.status || order.orderStatus,
          amount: netItemPrice,
          date: order.createdAt,
        };
      });
    });

    // --- Filter for items that contribute to revenue and should be displayed ---
    const revenueItems = salesData.filter(item =>
      ['Delivered', 'Shipped', 'Processing'].includes(item.status)
    );

    // --- Calculate Net Revenue and Total Orders ---
    const totalRevenue = revenueItems.reduce((acc, item) => acc + item.amount, 0);
    const totalOrders = await Order.countDocuments(excludeFailedOrdersFilter);

    // --- Paginate the filtered items for the dashboard table ---
    const page = parseInt(req.query.page) || 1;
    const limit = 6; // 6 orders per page
    const skip = (page - 1) * limit;

    const paginatedItems = revenueItems.slice(skip, skip + limit);
    const totalPages = Math.ceil(revenueItems.length / limit);

    const recentSalesData = paginatedItems.map(item => ({
      ...item,
      date: item.date.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));

    // Most Ordered Products (top 5 by number of unique orders)
    const mostOrderedProducts = await Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          "items.status": { $in: ["Delivered", "Shipped", "Processing"] }
        }
      },
      {
        $group: {
          _id: "$items.productId",
          count: { $sum: 1 },
          totalAmount: { $sum: "$items.totalPrice" }
        },
      },
      {
        $sort: { count: -1 }
      },
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
          totalAmount: 1
        },
      },
    ]);

    // Most Ordered Categories (top 5 by number of unique orders containing products from category)
    const mostOrderedCategories = await Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          "items.status": { $in: ["Delivered", "Shipped", "Processing"] }
        }
      },
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
          count: { $sum: 1 },
          totalAmount: { $sum: "$items.totalPrice" }
        },
      },
      {
        $sort: { count: -1 }
      },
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
          totalAmount: 1
        },
      },
    ]);

    // --- Chart Data Aggregation ---

    // Helper to get month name
    const getMonthName = (monthNum) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months[monthNum - 1];
    };

    // 1. Yearly Sales Data (for a fixed range of years: 2022-2026)
    const yearlyLabels = [2022, 2023, 2024, 2025, 2026];
    const yearlySalesData = await Order.aggregate([
      {
        $match: {
          ...excludeFailedOrdersFilter,
          orderStatus: { $nin: ["Cancelled", "Returned", "Failed", "payment-failed"] },
          createdAt: {
            $gte: new Date(yearlyLabels[0], 0, 1), // Start of the first year
            $lt: new Date(yearlyLabels[yearlyLabels.length - 1] + 1, 0, 1) // Start of the year after the last year
          }
        },
      },
      {
        $group: {
          _id: { $year: "$createdAt" },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const salesByYear = new Map(yearlySalesData.map(d => [d._id, d.total]));
    const yearlyValues = yearlyLabels.map(year => salesByYear.get(year) || 0);

    // 2. Monthly Sales Data (current year)
    const currentYear = new Date().getFullYear();
    const monthlySalesData = await Order.aggregate([
      {
        $match: {
          ...excludeFailedOrdersFilter,
          orderStatus: { $nin: ["Cancelled", "Returned", "Failed", "payment-failed"] },
          createdAt: { $gte: new Date(currentYear, 0, 1) }
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthlyLabels = Array.from({ length: 12 }, (_, i) => getMonthName(i + 1));
    const monthlyValues = Array(12).fill(0);
    monthlySalesData.forEach(d => {
      monthlyValues[d._id - 1] = d.total;
    });

    // 3. Weekly Sales Data (current week, Mon-Sun)
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, etc.
    const startOfWeek = new Date(today);
    // Adjust to Monday as the start of the week
    startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weeklySalesData = await Order.aggregate([
      {
        $match: {
          ...excludeFailedOrdersFilter,
          orderStatus: { $nin: ["Cancelled", "Returned", "Failed", "payment-failed"] },
          createdAt: { $gte: startOfWeek, $lte: endOfWeek }
        }
      },
      {
        $group: {
          _id: {
            // Adjust day of week so Monday is 1, Sunday is 7
            day: { $cond: [{ $eq: [{ $dayOfWeek: "$createdAt" }, 1] }, 7, { $subtract: [{ $dayOfWeek: "$createdAt" }, 1] }] }
          },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.day": 1 } }
    ]);

    const weeklyLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyValues = Array(7).fill(0);
    weeklySalesData.forEach(d => {
      weeklyValues[d._id.day - 1] = d.total;
    });

    // --- End Chart Data ---

    // Percentage Calculations (last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Helper functions
    const getPeriodRevenue = async (start, end) => {
      const agg = await Order.aggregate([
        {
          $match: {
            ...excludeFailedOrdersFilter,
            orderStatus: { $nin: ["Cancelled", "Returned", "Failed", "payment-failed"] },
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
        ...excludeFailedOrdersFilter,
        createdAt: { $gte: start, $lt: end },
      });
    };

    const getPeriodNewCustomers = async (start, end) => {
      return await User.countDocuments({
        ...excludeFailedOrdersFilter,
        isAdmin: false,
        createdAt: { $gte: start, $lt: end },
      });
    };

    const getPeriodNewProducts = async (start, end) => {
      return await Product.countDocuments({
        ...excludeFailedOrdersFilter,
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
  soldProducts: totalSoldProducts,
  productsPercentage: `${productsPercentage > 0 ? "+" : ""}${productsPercentage}%`,
  pending,
  processing,
  shipped,
  delivered,
  recentOrdersData: recentSalesData,
  mostOrderedProducts, 
  mostOrderedCategories, 
  chartData: {
    weekly: { labels: weeklyLabels, values: weeklyValues },
    monthly: { labels: monthlyLabels, values: monthlyValues },
    yearly: { labels: yearlyLabels, values: yearlyValues },
  },
  pagination: {
    currentPage: page,
    totalPages: totalPages,
  }
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