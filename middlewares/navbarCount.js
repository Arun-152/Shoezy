const Wishlist = require("../models/wishlistSchema")
const Cart = require("../models/cartSchema")

const navbarCount = async(req,res,next)=>{
    try{
        
        let cartCount= 0
        let wishlistCount=0
        if(req.session.userId){
            const cart = await Cart.findOne({userId:req.session.userId})
            if(cart && cart.items){
                cartCount = cart.items.length
            }
            const wishlist = await Wishlist.findOne({userId:req.session.userId}).populate("products.productId")
            if(wishlist && wishlist.products){
                wishlistCount = wishlist.products.length
                console.log(wishlist.products.length)
            }
        }
        res.locals.cartCount = cartCount
        res.locals.wishlistCount = wishlistCount

        next()

    }catch(error){
        console.error(error)
    }
}
module.exports = navbarCount