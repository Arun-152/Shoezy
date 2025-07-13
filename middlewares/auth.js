const User=require("../models/userSchema")


const userAuth=(req,res,next)=>{
    if(req.session.userId){
        User.findById(req.session.userId)
        .then(data=>{
            if(data && !data.isBlocked){
                next()
            }else{
                res.render("loginPage")
            }
        }).catch(error=>{
            res.status(500).send("server error")
        })
    }else{
        res.redirect("/login")
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