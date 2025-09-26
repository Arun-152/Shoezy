const express = require("express");
const router = express.Router();
const adminController = require("../../controllers/admin/adminController");
const customerController = require("../../controllers/admin/customerController");
const categoryController = require("../../controllers/admin/categoryController");
const productsController = require("../../controllers/admin/productController");
const salesReportController = require("../../controllers/admin/salesReportController");
const { upload } = require("../../helpers/multerConfig");
const { adminAuth } = require("../../middlewares/auth");
const multer = require("multer");


const adminOrderRouter = require("./adminOrderRouter")
const adminCouponRouter = require("./adminCouponRouter")

// Admin Login Management
router.get("/login", adminController.adminLoginPage);
router.post("/login", adminController.postLogin);

// Dashboard Management
router.get("/dashboard", adminAuth, adminController.dashboard);

// Customer Management
router.get("/customers", adminAuth, customerController.customerPage);
router.get("/blockCustomer", adminAuth, customerController.customerBlocked);
router.get("/unblockCustomer", adminAuth, customerController.customerUnblocked);

// Category Management
router.get("/category", adminAuth, categoryController.categoryPage);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.patch("/deleteCategory/:id", adminAuth, categoryController.categoryDelete);
router.post("/listCategory", adminAuth, categoryController.categoryToggle);
router.patch("/editCategory/:id", adminAuth, categoryController.categoryEdit);

// Product Management
router.get("/products", adminAuth, productsController.productsPage);
router.get("/addProduct", adminAuth, productsController.loadAddProductPage);
router.post("/addProduct", adminAuth, upload.array("images", 3), productsController.addProduct);
router.get("/unblockedProduct", adminAuth, productsController.unblockProduct);
router.get("/blockedProduct", adminAuth, productsController.blockProduct);
router.get("/editProducts", adminAuth, productsController.loadEditProduct);
router.post("/editProducts/:id", adminAuth, upload.array("images", 3), productsController.editProducts);
router.patch("/deleteProducts/:id", adminAuth, productsController.deleteProducts);

// Sales Report Management
router.get("/salesReport", adminAuth, salesReportController.loadSalesReport);
router.get("/salesreport/export/pdf", adminAuth, salesReportController.exportPdfReport);
router.get("/salesreport/export/excel", adminAuth, salesReportController.exportExcelReport);
router.get("/salesreport/export/csv", adminAuth, salesReportController.exportCsvReport);


// Admin Logout
router.get("/logout", adminAuth, adminController.adminLogout);

// Admin Error Page
router.get("/adminErrorPage", adminAuth,adminController.adminErrorPage);

router.use("/orders",adminOrderRouter)
router.use("/coupons",adminCouponRouter)

module.exports = router;