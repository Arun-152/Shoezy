const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema")
const Wishlist = require("../../models/wishlistSchema")

const loadAddToCart= async (req, res) => {
    try {
        const userData = req.session.userId
        if (!userData) {
            return res.redirect("/login");
        }

         return res.render("addToCartPage", {
            user: userData,
        });
    } catch (error) {
        console.error("Add to cart page error:", error);
        res.status(500).json({success:false,message:"server error"});
    }        
}   


 const addToCart = async(req,res)=>{
    try {
       const userId = req.session.userId
       const {productId} = req.body
       const product = await Product.findById(productId).populate("category")
       if(!product || product.status === "blocked" || product.category.status === "blocked"){
        return res.status(400).json({success:false,message:"This product is unavailable"})
       }
       const cart = await cart.findOne({userId}) 
       cart = new Cart({userId,products:[]})
       const existingProduct = cart.products.find(p => p.productId.equals(productId))
       if(existingProduct){
        existingProduct.quantity +=1
       }
       cart.products.push({productId,quantity:1})
       await Wishlist.updateOne({userId}, {$pull: {products: productId}})
       await cart.save()
       return res.redirect("/cart")

    } catch (error) {
        console.error(error)
        return res.redirect("/usererrorPage")
    }
 }
const updateQuantity = async(req,res)=>{
    try {
        const userId = req.session.userId
        const {productId,action} = req.body

        const cart = await Cart.findOne({userId})
        const product = await Product.findById({productId})

        if(!cart || !product){
            return res.status(404).json({success:false,message:"Page not found"})

        }
        const item = cart.items.find(item=>item.productId.equals(productId))
        if(!item){
            return res.status(404).json({success:false,message:"Item not in cart"})
        
        }
        if(action==="inc"){
            if(item.quantity<product.stock){
                item.quantity += 1
            }
            return res.status(400).json({success:false,message:"Reached max stock"})

        }else if(action === "dec"){
            if(item.quantity >1){
                item.quantity -= 1
            }
            cart.items = cart.items.filyter(i=>!i.productId.equals(productId))
        }
        await cart.save()
        return res.status(200).json({success:true,message:" Quantity updated"})
    } catch (error) {
        console.error(error)
        return res.redirect("/usererrorPage")
    }
}
const removeCart = async(req,res)=>{
    try {
        const userId = req.session.userId
        const productId = req.body.productId

        await Cart.updateOne(
            {userId},
            {$pull:{items:{productId}}}
        )
        return res.status(200).json({success:true,message:" Product removed successfully"})
    } catch (error) {
        console.error(error)
        return res.redirect("/usererrorPage")
    }
}

module.exports = {
    loadAddToCart,
    addToCart,
    updateQuantity,
    removeCart
}