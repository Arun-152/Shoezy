const express=require("express")
const router=express.Router()
const adminController=require("../controllers/admin/adminController")
const customerController=require("../controllers/admin/customerController")
const categoryController=require("../controllers/admin/categoryController")
const {userAuth,adminAuth}=require("../middlewares/auth")
// const productController=require("../controllers/admin/productController")

// adminlogin management

router.get("/login",adminController.adminloginpage)
router.post("/login",adminController.postLogin)

// dashboard management
router.get("/dashboard",adminAuth,adminController.dashboardPage)

// customer management
router.get("/customers",adminAuth,customerController.customerPage)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked)

// products management
router.get("/products",adminAuth,adminController.productsPage)

// category management
router.get("/category",adminAuth,categoryController.categoryPage)
router.post("/addCategory",adminAuth,categoryController.addCategory)
router.post("/deleteCategory",adminAuth,categoryController.categoryDelete)
router.post("/listCategory", adminAuth, categoryController.categoryToggle)
router.patch("/editCategory/:id",adminAuth,categoryController.categoryEdit) 

// addproduct management
router.get("/addproduct",adminAuth,adminController.addproductPage)
// orders management
router.get("/orders",adminAuth,adminController.ordersPage)

// coupen management
router.get("/coupons",adminAuth,adminController.coupenPage)

// salesreport management
router.get("/salesreport",adminAuth,adminController.salesPage)

// offers management
router.get("/offers",adminAuth,adminController.offersPage)

// adminlogout
router.get("/logout",adminAuth,adminController.adminLogout)




module.exports=router