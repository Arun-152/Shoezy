const User=require("../models/userSchema")


const userAuth = async (req,res,next)=>{
    try{
       const userId = req.session.userId
       if(!userId){
        return res.redirect('/login')
       }
       
       // Check if user exists and is not blocked
       const user = await User.findById(userId)
       if(!user || user.isBlocked){
        req.session.destroy()
        return res.redirect('/login')
       }
       
       next()
    }catch(error){
        console.error('Auth middleware error:', error)
        return res.redirect('/login')
    }
}

const adminAuth=(req,res,next)=>{
    try {

        if(req.session && req.session.adminId){
    
            return next()
        }else{
            req.session.destroy()
             res.redirect("/admin/login")
        }
        
    } catch (error) {

        res.redirect("/pageerror")
        
    }
}


module.exports={
    userAuth,
    adminAuth
}