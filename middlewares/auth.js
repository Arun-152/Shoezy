const User=require("../models/userSchema")


const userAuth=(req,res,next)=>{
    console.log("user",req.session.userId)
    try{
       const user = req.session.userId
       if(!user){
        return res.redirect('/login')
       }
       if(user.isBlocked){
        return res.redirect('/login')
       }
       next()
    }catch(error){

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