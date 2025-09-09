const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema")
const Product = require("../../models/productSchema")
const Order = require("../../models/orderSchema")
const Coupon = require("../../models/CouponSchema")
const bcrypt = require("bcrypt")
const env = require("dotenv").config()


const applyCoupon = async(req,res)=>{
  try {
    const {couponCode, cartTotal} = req.body;
    const userId = req.session.userId
    if (!userId) {
      return res.status(401).json({success:false, message:"Please login"});
    }
    if (!couponCode || !cartTotal) {
      return res.status(400).json({success:false, message:"Coupon code and cart total are required"});
    }

 
     const coupon = await Coupon.findOne({ name: couponCode, islist: true });


  
    if (!coupon) {
      return res.status(400).json({success:false, message:"Invalid coupon"});
    }

    const currentDate = new Date();
    if (coupon.startDate > currentDate) {
      return res.status(400).json({success:false, message:"This coupon is not yet active"});
    }
    if (coupon.expireOn < currentDate) {
      return res.status(400).json({success:false, message:"This coupon has expired"});
    }
    if (cartTotal < coupon.minimumPrice) {
      return res.status(400).json({success:false, message:`Minimum order amount of ₹${coupon.minimumPrice.toLocaleString('en-IN')} required`});
    }
    if (coupon.totalUsageLimit && coupon.currentUsageCount >= coupon.totalUsageLimit) {
      return res.status(400).json({success:false, message:"This coupon has reached its usage limit"});
    }

    const userUsageCount = await Order.countDocuments({
      userId,
      couponCode: coupon.name,
      status: { $ne: "Cancelled" }
    });
    const maxUsesPerUser = coupon.maxUsesPerUser || 1;
    if (userUsageCount >= maxUsesPerUser) {
      return res.status(400).json({success:false, message:`You have reached the maximum usage limit (${maxUsesPerUser}) for this coupon`});
    }


    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = Math.round(Math.min((cartTotal * coupon.offerPrice) / 100, cartTotal));
    } else {
      discountAmount = Math.round(Math.min(coupon.offerPrice, cartTotal));
    }
    const finalAmount = Math.round(cartTotal - discountAmount);

    req.session.appliedCoupon = {
      couponId: coupon._id,
      couponCode: coupon.name,
      discountAmount,
      originalAmount: cartTotal,
      finalAmount
    }

    req.session.save(err => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ success:false, message:"Failed to save session" });
      }
      res.json({
        success: true,
        message: "Coupon applied successfully",
        couponCode: coupon.name,
        discountAmount,
        originalAmount: cartTotal,
        finalAmount
      });
    });

  } catch (error) {
    console.error("coupon error:", error);
    return { valid:false, message:"Something went wrong" }
  }
};

const removeCoupon = async(req,res)=>{
  try{
    req.session.appliedCoupon = null
    return {valid:true,message:"coupon removed"}

  }catch(error){
    console.error("coupon error",error)
  }
}
const validateCouponForCheckout = async(couponData, userId, req)=>{
  try{
    if(!couponData || !couponData.couponId){
      return {valid:false,message:"No Coupon applied"}
    }
    const coupon = await Coupon.findById(couponData.couponId)
    .populate("applicableCategories applicableProducts")

    if(!coupon || !coupon.islist){
      return {valid:false,message:"Coupon not found"}
    }
    const currentDate = new Date()
    if(coupon.startDate && coupon.startDate > currentDate){
      return {valid:false,message:"Coupon is not yet active"}
    }
    if(coupon.expireOn < currentDate){
      return {valid:false,message:"Coupon has expired"}
    }
    if(coupon.totalUsageLimit && coupon.currentUsageCount >= coupon.totalUsageLimit){
      return {valid:false,message:"Coupon has reached its usage limit"}
    }
    const userUsageCount = await Order.countDocuments({
            userId: userId,
            couponCode: coupon.name,
            status: { $ne: 'Cancelled' } 
        });
    const maxUsesPerUser = coupon.maxUsesPerUser || 1;
 
    if(userUsageCount >= maxUsesPerUser){
      return {valid:false,message:"Maximum usage limit reached for this coupon"}
    }
    const buyNowData  = req && req.session ? req.session.buyNowData : null;

    if(buyNowData){
      const product = await Product.findById(buyNowData.productId).populate('category')
      if(!product){
      return {valid:false,message:"Product not found"}

      }
      if(!coupon.isAllCategories && coupon.applicableCategories.length > 0){
          const productCategoryId =  product.category._id.toString()
          const applicableCategoryIds = coupon.applicableCategories.map(cat => cat._id.toString())
          if(!applicableCategoryIds.includes(productCategoryId)){
            return {valid:false,message:"Coupon not applicable to this product"}
          }
      }
      if (!coupon.isAllProducts && coupon.applicableProducts.length > 0){
        const productId =  product._id.toString()
        const applicableProductIds = coupon.applicableProducts.map(prod => prod._id.toString())

        if(!applicableProductIds.includes(productId)){
          return { valid: false, message: "Coupon not applicable to this product" }
        }
      }
      return { valid: true, coupon: coupon }

    }else{
      
      const cart = await Cart.findOne({ userId }).populate({
          path: 'items.productId',
          populate: {
          path: 'category',
          select: '_id name'
          }
      });
      if(!cart || cart.items.length===0){
        return {valid:false,message:"Cart is empty"}
      }
      if(!coupon.isAllCategories && coupon.applicableCategories.length > 0){
        const cartCategoryIds = cart.items.map(item => item.productId.category._id.toString())
        const applicableCategoryIds = coupon.applicableCategories.map(cat => cat._id.toString())

        const hasApplicableCategory = cartCategoryIds.some(catId =>
              applicableCategoryIds.includes(catId)
          );

        if (!hasApplicableCategory) {
          return { valid: false, message: "Coupon not applicable to cart items" };
        }

      }
       if (!coupon.isAllProducts && coupon.applicableProducts.length > 0) {
                const cartProductIds = cart.items.map(item => item.productId._id.toString());
                const applicableProductIds = coupon.applicableProducts.map(prod => prod._id.toString());

                const hasApplicableProduct = cartProductIds.some(prodId =>
                    applicableProductIds.includes(prodId)
                );

                if (!hasApplicableProduct) {
                    return { valid: false, message: "Coupon not applicable to cart items" };
                }
            }
            return {valid:true,coupon:coupon}
    }


  }catch(error){
    console.error("Error validating coupon:", error);
    return { valid: false, message: "Coupon validation failed" }

  }
}

module.exports = {
    applyCoupon,
    removeCoupon,
    validateCouponForCheckout,

}