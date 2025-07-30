const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const loadWishlist = async(req,res)=>{
    try{
    const userId = req.session.userId
    const user = await User.findById(userId)
     const products = await Product.find({_id:{$in:user.wishlist}}).populate("category")
    if(!user){
        return res.redirect("/login")
    }
    return res.render("wishlistPage",{
        user,
         wishlist:products,
    })
    }catch(error){
        console.error(error)
        return res.redirect("/usererrorPage")
    }
}


const addToWishlist = async(req,res)=>{
    try {
        const productId = req.body.productId
        const userId = req.body.user
        const user = await User.findById(userId)
        if(user.wishlist.includes(productId)){
            return res.status(200).json({success:false,message:"Product already in wishlist"})
        }
        user.wishlist.push(productId)
        await user.save()
        return res.status(200).json({success:true,message:"Product added to wishlist"})
    } catch (error) {
        console.error(error)
        return res.redirect("/usererrorPage")
    }
}

const removeWishlist = async(req,res)=>{
    try {
        const productId = req.query.productId
        const userId = req.session.user
        const user = await User.findById(userId)
        const index = user.wishlist.indexOf(productId)
        user.wishlist.splice(index,1)
        await user.save()
        return res.redirect("/wishlist")
    } catch (error) {
        console.error(error)
        return res.redirect("/usererrorPage") 
    }
}

module.exports = {
    loadWishlist,
    addToWishlist,
    removeWishlist,
}