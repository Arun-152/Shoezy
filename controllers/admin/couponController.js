const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Coupon = require('../../models/CouponSchema');
const Order = require("../../models/orderSchema")
const bcrypt = require("bcrypt");
require("dotenv").config();



const couponPage = async (req, res) => {
    try {
       const userId = req.session.userId;
        const user = await User.findById(userId)
        const coupons = await Coupon.find({})
        res.render("admincoupenPage", { coupons });
    } catch (error) {
        console.error("Error rendering coupons page:", error.message);
        res.redirect("/admin500")
    }
};
const getCreateCoponPage = async (req, res) => {
    try {
        const categories = await Category.find({isDeleted:false,isListed:true})
        const products = await Product.find({isDeleted:false,isBlocked:false})
        const orders = await Order.find({})
        res.render("addCouponPage",{categories,products,orders})
    

    } catch (error) {
        console.error("coupon created error", error)
        return res.status(500).json({ success: false, message: "Something went wrong" })

    }
}
const getCustomers = async(req,res)=>{
  try{
    const couponId = req.params.couponId;
    const userId = req.session.userId;
    const user = await User.findById(userId)

    if(!user){
      return res.status(404).json({success:false,message:"User not found"})
    }
   
    const coupon = await Coupon.findById(couponId)
  }catch(error){
    console.error("getCustomers error",error)
    return res.status(500).json({success:false,message:"Something went wrong"})
  }
}

const createCoupon = async (req, res) => {
  try {
    const {
      couponCode: name,
      offerPrice,
      minimumPrice,
      startDate,
      expireOn,
      discountType,
      applicableCategories,
      applicableProducts,
      isAllCategories,
      isAllProducts,
      maxUsesPerUser,
      totalUsageLimit,
      islist
    } = req.body;

    const errors = {};

    if (!name) errors.couponCode = "Coupon Code is required";
    if (!offerPrice) errors.offerPrice = "Discount Amount is required";
    if (!minimumPrice && minimumPrice !== 0) errors.minimumPrice = "Minimum Order Amount is required";
    if (!startDate) errors.startDate = "Start Date is required";
    if (!expireOn) errors.expirationDate = "Expiration Date is required";
    if (!discountType) errors.discountType = "Discount Type is required";

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
        fieldErrors: errors
      });
    }

    const existingCoupon = await Coupon.findOne({ name });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: "Coupon already exists, please use another name" });
    }

    const startDateObj = new Date(startDate);
    const expirationDate = new Date(expireOn);
    const currentDate = new Date();

    if (startDateObj < currentDate.setHours(0, 0, 0, 0)) {
      return res.status(400).json({ success: false, message: "Start date cannot be in the past" });
    }
    if (expirationDate <= startDateObj) {
      return res.status(400).json({ success: false, message: "Expiration date must be after start date" });
    }
    if (!["flat", "percentage"].includes(discountType)) {
      return res.status(400).json({ success: false, message: "Invalid discount type" });
    }

    const offerPriceNum = parseFloat(offerPrice);
    if (offerPriceNum <= 0) {
      return res.status(400).json({ success: false, message: "The offer price must be greater than 0" });
    }
    if (discountType === "percentage" && offerPriceNum > 100) {
      return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
    }

    const maxUsesPerUserNum = parseInt(maxUsesPerUser) || 1;
    if (maxUsesPerUserNum < 1) {
      return res.status(400).json({ success: false, message: "Maximum uses per user must be at least 1" });
    }

    const totalUsageLimitNum = totalUsageLimit ? parseInt(totalUsageLimit) : null;
    
    // Enhanced Total Usage Limit validation with specific prompts
    if (!totalUsageLimit || totalUsageLimit.trim() === '') {
      return res.status(400).json({ success: false, message: "Total Usage Limit is required. Please enter a valid number." });
    }
    
    if (isNaN(totalUsageLimitNum) || totalUsageLimitNum === null) {
      return res.status(400).json({ success: false, message: "Enter a valid Total Usage Limit to proceed." });
    }
    
    if (totalUsageLimitNum < 1) {
      return res.status(400).json({ success: false, message: "Please provide a valid Total Usage Limit (greater than 0)." });
    }
    if (totalUsageLimitNum && maxUsesPerUserNum > totalUsageLimitNum) {
      return res.status(400).json({ success: false, message: "Invalid Total Usage Limit. Kindly check and try again." });
    }
    if (parseFloat(minimumPrice) < 0) {
      return res.status(400).json({ success: false, message: "Minimum order amount cannot be negative" });
    }
    if (!isAllCategories && (!applicableCategories || applicableCategories.length === 0)) {
      return res.status(400).json({ success: false, message: "Please select at least one category or choose 'Apply to All Categories'" });
    }
    if (!isAllProducts && (!applicableProducts || applicableProducts.length === 0)) {
      return res.status(400).json({ success: false, message: "Please select at least one product or choose 'Apply to All Products'" });
    }

    // Final validation check for Total Usage Limit
    if (!totalUsageLimitNum) {
      return res.status(400).json({ success: false, message: "Coupon cannot be added without a valid Total Usage Limit." });
    }

    const newCoupon = new Coupon({
      name,
      startDate: startDateObj,
      expireOn: expirationDate,
      discountType,
      offerPrice: offerPriceNum,
      minimumPrice: parseFloat(minimumPrice),
      applicableCategories: isAllCategories ? [] : (Array.isArray(applicableCategories) ? applicableCategories : [applicableCategories]),
      applicableProducts: isAllProducts ? [] : (Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts]),
      isAllCategories: isAllCategories === 'true' || isAllCategories === true,
      isAllProducts: isAllProducts === 'true' || isAllProducts === true,
      maxUsesPerUser: maxUsesPerUserNum,
      totalUsageLimit: totalUsageLimitNum,
      currentUsageCount: 0,
      islist: islist === 'true' || islist === true,
      userId: []
    });

    await newCoupon.save();
    res.json({ success: true, message: "Coupon added successfully with Total Usage Limit applied." });
  } catch (error) {
    console.error("Coupon creation error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
const loadEditCoupon = async(req,res)=>{
  try{
    const couponId = req.query.id;

        if (!couponId) {
            return res.redirect("/admin/coupons");
        }

        const coupon = await Coupon.findById(couponId)
            .populate('applicableCategories', '_id name')
            .populate('applicableProducts', '_id productName');

        if (!coupon) {
            return res.redirect("/admin/coupons");
        }

        // Load categories and products for the edit form
        const categories = await Category.find({isDeleted:false,isListed:true});
        const products = await Product.find({isDeleted:false,isBlocked:false});

        res.render("editCouponPage", { 
            coupon: coupon,
            categories: categories,
            products: products
        });

  }catch(error){
    console.error("loadedit page error",error)
    return res.redirect("/admin500");

  }
}
const editCoupon = async(req,res)=>{
  try{
    const couponId = req.query.id
    const {
            name,
            offerPrice,
            minimumPrice,
            startDate,
            expireOn,
            discountType,
            applicableCategories,
            applicableProducts,
            isAllCategories,
            isAllProducts,
            maxUsesPerUser,
            totalUsageLimit,
            islist
        } = req.body;

        if(!name||!offerPrice||!minimumPrice||!startDate||!expireOn||!discountType){
          return res.status(400).json({success:false,message:"All required fields must be filled"})
        }

        // Check if coupon exists but exclude the current coupon being edited
        const existingCoupon = await Coupon.findOne({name, _id: { $ne: couponId }});

        if(existingCoupon){
          return res.status(400).json({success:false,message:"This coupon already exist,Please use different name"})
        }

        const startDateObj = new Date(startDate);
        const expirationDate = new Date(expireOn);
        const currentDate = new Date();

        if (startDateObj < currentDate.setHours(0, 0, 0, 0)){
          return res.status(400).json({success:false,message:"Start date cannot be in the past"})
        }

        if(expirationDate <= startDateObj){
          return res.status(400).json({success:false,message:"Expiration date must be after start date"})
        }
        
        if(!['flat', 'percentage'].includes(discountType)){
          return res.status(400).json({success:false,message:"Invalid discount type"})
        }

        const offerPriceNum = parseFloat(offerPrice)

        if (offerPriceNum <= 0){
          return res.status(400).json({success:false,message:"Discount amount must be greater than 0"})
        }
        if( (discountType === 'percentage' && offerPriceNum > 100)){
          return res.status(400).json({success:false,message:"Percentage discount cannot exceed 100%"})
        }
       const maxUsesPerUserNum = parseInt(maxUsesPerUser) || 1 ;
        if(maxUsesPerUserNum < 1){
          return res.status(400).json({success:false,message:"Maximum uses per user must be at least 1"})
        }
        const totalUsageLimitNum = totalUsageLimit ? parseInt(totalUsageLimit) : null;
        if(totalUsageLimitNum && totalUsageLimitNum < 1){
          return res.status(400).json({success:false,message:"Total usage limit must be at least 1"})
        }

        const currentCoupon = await Coupon.findById(couponId);
        if (!currentCoupon){
          return res.status(400).json({success:false,message:"Coupon not found"})
        }

        if(totalUsageLimitNum && totalUsageLimitNum < (currentCoupon.currentUsageCount || 0)){
          return res.status(400).json({success:false,message:"Total usage limit cannot be less than current usage"})
        }
        if(totalUsageLimitNum&&maxUsesPerUserNum>totalUsageLimitNum){
          return res.status(400).json({success:false,message:"Maximum uses per user cannot be greater than total usage limit"})
        }
        if(parseFloat(minimumPrice) < 0){
          return res.status(400).json({success:false,message:"Minimum order amount cannot be negative"})
        }
        if(!isAllCategories && (!applicableCategories || applicableCategories.length === 0)){
          return res.status(400).json({success:false,message:"Please select at least one category or choose 'Apply to All Categories'"})

        }
        if (!isAllProducts && (!applicableProducts || applicableProducts.length === 0)){
          return res.status(400).json({success:false,message:"Please select at least one product or choose 'Apply to All Products'"})
        }
        
        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId,{
                name: name.toUpperCase().trim(),
                startDate: startDateObj,
                expireOn: expirationDate,
                discountType: discountType,
                offerPrice: offerPriceNum,
                minimumPrice: parseFloat(minimumPrice),
                applicableCategories: isAllCategories ? [] : (Array.isArray(applicableCategories) ? applicableCategories : [applicableCategories]),
                applicableProducts: isAllProducts ? [] : (Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts]),
                isAllCategories: isAllCategories === 'true' || isAllCategories === true,
                isAllProducts: isAllProducts === 'true' || isAllProducts === true,
                maxUsesPerUser: maxUsesPerUserNum,
                totalUsageLimit: totalUsageLimitNum,
                islist: islist === 'true' || islist === true
            },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({success:false,message:"Coupon not found"})
        }

        return res.status(200).json({success:true,message:"Coupon updated successfully", redirect: "/admin/coupons"})

  }catch(error){
    console.error("coupon update error",error)
    return res.status(500).json({success:false,message:"Failed to update coupon. Please try again"})

  }
}
const deleteCoupon = async(req,res)=>{
  try{
    const couponId = req.params.id
    const result = await Coupon.findByIdAndUpdate(couponId,{islist:false},{new:true})

    if(!result){
      return res.status(404).json({success:false,message:"Coupon not found"})
    }
    return res.status(200).json({success:true,message:"Coupon deleted successfully"})

  }catch(error){
    console.error("coupon deleted error",error)
    return res.status(500).json({success:false,message:"Something went wrong"})
  }
}
const couponToggle = async (req, res) => {
    try {
        const { id } = req.body;
        console.log(id)

        if (!id) {
            return res.status(400).json({ success: false, message: "Coupon id is required" });
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        
        coupon.islist = !coupon.islist;
        await coupon.save();

        return res.json({
            success: true,
            message: `Coupon ${coupon.islist ? "Listed" : "Unlisted"} successfully`,
            couponId: id,
            islist: coupon.islist,
        });
    } catch (error) {
        console.error("Error toggling coupon:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};
const getCategories = async(req,res)=>{
  try{
    const category = await Category.find({isListed:true})
    if(category){
      return res.status({success:true,category:category})
    }

  }catch(error){
    console.error("getCategories error",error)
    return res.status(500).json({success:false,message:"Failed to fetch categories"})
  }
}
const getProducts = async(req,res)=>{
  try{
    const products = await Product.find({isBlocked:false,status:"Availble",isDeleted:false})

    if(products){
      return res.status({success:true,products:products})
    }

  }catch(errror){
    console.error("get products error",error)
    return res.status(500).json({success:false,message:"Failed to fetch Products"})
  }
}
module.exports = {
    couponPage,
    createCoupon,
    getCreateCoponPage,
    loadEditCoupon,
    editCoupon,
    deleteCoupon,
    getCategories,
    getProducts,
    couponToggle,
    getCustomers,
}