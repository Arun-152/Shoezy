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
        const user = await User.findById(userId);
        const search = req.query.search || '';
        const sort = req.query.sort || 'name_asc'; 
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const query = {isDeleted:false};

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const sortOptions = {};
        switch (sort) {
            case 'name_desc':
                sortOptions.name = -1;
                break;
            case 'expiry_asc':
                sortOptions.expireOn = 1;
                break;
            case 'expiry_desc':
                sortOptions.expireOn = -1;
                break;
            default:
                sortOptions.name = 1; // Default to name ascending
                break;
        }

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);

        const coupons = await Coupon.find(query).sort(sortOptions)
        .skip(skip)
        .limit(limit);

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); 

        const couponsWithStatus = coupons.map(coupon => {
            const couponStartDate = new Date(coupon.startDate);
            couponStartDate.setHours(0, 0, 0, 0);
            const couponExpireDate = new Date(coupon.expireOn);
            couponExpireDate.setHours(0, 0, 0, 0);

            let status;
            if (currentDate > couponExpireDate) {
                status = 'Expired';
            } else if (currentDate >= couponStartDate) {
                status = 'Active';
            } else {
                status = 'Not Started';
            }

            return { ...coupon.toObject(), status };
        });

        res.render("admincoupenPage", { 
            coupons: couponsWithStatus, 
            search, 
            sort,
            currentPage: page,
            totalPages,
            limit,
            skip
        });
    } catch (error) {
        console.error("Error rendering coupons page:", error.message);
        res.redirect("/admin500");
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
      maxAmount,
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
    if (minimumPrice === '' || minimumPrice == null) errors.minimumPrice = "Minimum Order Amount is required";
    if (!startDate) errors.startDate = "Start Date is required";
    if (!expireOn) errors.expireOn = "Expiration Date is required";
    if (!discountType) errors.discountType = "Discount Type is required";

    if (discountType === 'percentage' && !maxAmount) {
      errors.maxAmount = "Max Amount is required for percentage-based coupons";
    }
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
    if (expirationDate < startDateObj) {
      return res.status(400).json({ success: false, message: "Expiration date must be after start date" });
    }
    if (!["flat", "percentage"].includes(discountType)) {
      return res.status(400).json({ success: false, message: "Invalid discount type" });
    }

    const offerPriceNum = parseFloat(offerPrice);
    if (offerPriceNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "The offer price must be greater than 0",
        fieldErrors: { offerPrice: "The offer price must be greater than 0" }
      });
    }
    if (discountType === "percentage" && offerPriceNum > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
        fieldErrors: {
          offerPrice: "Percentage discount cannot exceed 100%"
        }
      });
    }
    
    let maxAmountNum = null;
    if (discountType === 'percentage') {
      maxAmountNum = parseFloat(maxAmount);
      if (isNaN(maxAmountNum) || maxAmountNum <= 0) {
        return res.status(400).json({
          success: false,
          message: "Max amount must be a number greater than 0 for percentage coupons",
          fieldErrors: { maxAmount: "Max amount must be a number greater than 0" }
        });
      }
      const minPriceNum = parseFloat(minimumPrice);
      if (!isNaN(minPriceNum) && maxAmountNum < minPriceNum) {
        return res.status(400).json({
          success: false,
          message: "Max Amount must be greater than or equal to Min Amount.",
          fieldErrors: { maxAmount: "Max Amount must be greater than or equal to Min Amount." }
        });
      }
    }
    const maxUsesPerUserNum = parseInt(maxUsesPerUser) || 1;
    if (maxUsesPerUserNum < 1) {
      return res.status(400).json({ success: false, message: "Maximum uses per user must be at least 1" });
    }

    let totalUsageLimitNum = totalUsageLimit ? parseInt(totalUsageLimit) : null;
    if (totalUsageLimit && (isNaN(totalUsageLimitNum) || totalUsageLimitNum < 1)) {
        return res.status(400).json({ success: false, message: "Total usage limit must be a number greater than 0, or empty for unlimited" });
    }
    if (totalUsageLimit.trim() === '') totalUsageLimitNum = null;

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

    const newCoupon = new Coupon({
      name,
      startDate: startDateObj,
      expireOn: expirationDate,
      discountType,
      offerPrice: offerPriceNum,
      maxAmount: maxAmountNum, // Will be null for 'flat' type
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
    res.json({ success: true, message: "Coupon added successfully." });
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
            maxAmount,
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
    
        const requiredFields = [name, offerPrice, minimumPrice, startDate, expireOn, discountType];
        if (discountType === 'percentage') requiredFields.push(maxAmount);

        if (requiredFields.some(field => !field)) {
            return res.status(400).json({ success: false, message: "All required fields must be filled" });
        }

        const existingCoupon = await Coupon.findOne({name, _id: { $ne: couponId }});
       

        if(existingCoupon){
          return res.status(400).json({success:false,message:"This coupon already exist,Please use different name"})
        }

        const currentCoupon = await Coupon.findById(couponId);
        if (!currentCoupon){
          return res.status(404).json({success:false,message:"Coupon not found"})
        }

        const startDateObj = new Date(startDate);
        const expirationDate = new Date(expireOn);
        const currentDate = new Date();
        const originalStartDate = new Date(currentCoupon.startDate);

        if (startDateObj.getTime() !== originalStartDate.getTime() && startDateObj < currentDate.setHours(0, 0, 0, 0)) {
          return res.status(400).json({success:false,message:"Start date cannot be in the past"})
        }

        if(expirationDate < startDateObj){
          return res.status(400).json({success:false,message:"Expiration date must be after start date"})
        }
        if(!['flat', 'percentage'].includes(discountType)){
          return res.status(400).json({success:false,message:"Invalid discount type"})
        }

        const offerPriceNum = parseFloat(offerPrice)

        if (offerPriceNum <= 0){
          return res.status(400).json({
            success: false,
            message: "Discount amount must be greater than 0",
            fieldErrors: { offerPrice: "Discount amount must be greater than 0" }
          });
        }
        if( (discountType === 'percentage' && offerPriceNum > 100)){
          return res.status(400).json({
            success: false,
            message: "Percentage discount cannot exceed 100%",
            fieldErrors: {
              offerPrice: "Percentage discount cannot exceed 100%"
            }
          });
        }

        const minPriceNum = parseFloat(minimumPrice);
        if (discountType === 'flat' && !isNaN(offerPriceNum) && !isNaN(minPriceNum) && minPriceNum > 0 && offerPriceNum >= minPriceNum) {
          return res.status(400).json({
            success: false,
            message: "Discount amount must be less than the minimum purchase amount.",
            fieldErrors: { offerPrice: "Discount amount must be less than the minimum purchase amount." }
          });
        }

        let maxAmountNum = null;
        if (discountType === 'percentage') {
          maxAmountNum = parseFloat(maxAmount);
          if (isNaN(maxAmountNum) || maxAmountNum <= 0) {
            return res.status(400).json({
              success: false,
              message: "Max amount must be a number greater than 0 for percentage coupons",
              fieldErrors: { maxAmount: "Max amount must be a number greater than 0" }
            });
          }
          if (!isNaN(minPriceNum) && maxAmountNum < minPriceNum) {
            return res.status(400).json({
              success: false,
              message: "Max Amount must be greater than or equal to Min Amount.",
              fieldErrors: { maxAmount: "Max Amount must be greater than or equal to Min Amount." }
            });
          }
        }
        const maxUsesPerUserNum = parseInt(maxUsesPerUser) || 1 ;
        if(maxUsesPerUserNum < 1){
          return res.status(400).json({success:false,message:"Maximum uses per user must be at least 1"})
        }
        const totalUsageLimitNum = totalUsageLimit ? parseInt(totalUsageLimit) : null;
        if(totalUsageLimitNum && totalUsageLimitNum < 1){
          return res.status(400).json({success:false,message:"Total usage limit must be at least 1"})
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
                maxAmount: maxAmountNum, // Will be null for 'flat' type
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
    const result = await Coupon.findByIdAndUpdate({_id:couponId},{isDeleted:true })

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