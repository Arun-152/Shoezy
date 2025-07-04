const User=require("../../models/userSchema")
const bcrypt=require("bcrypt")
const env = require("dotenv").config()



const adminloginpage=async(req,res)=>{
    try{
        if(req.session.adminId){
           return res.redirect("/admin/dashboard")
        }
        res.render("adminloginPage")

    }catch(error){
        res.status(500).send("server not found")

    }
   
}
const postLogin=async(req,res)=>{
    try{
        const {email,password}=req.body
        const admin=await User.findOne({email,isAdmin:true})
        if(!admin){
            return res.redirect("/adminloginPage")
        }
        const matchpass=await bcrypt.compare(password,admin.password)
        if(!matchpass){
            return res.redirect("/adminloginPage")
        }
        req.session.adminId=admin._id
        return res.redirect("/admin/dashboard")
    }catch(error){
        console.log(error)
        res.status(500).json({error:"Fail loading"})
    }
}
const dashboardPage=async(req,res)=>{
    try{
        res.render("dashboardPage")
    }catch(error){
        res.status(500).send("server error")

    }
}
const productsPage=(req,res)=>{
    try {
        res.render("productsPage")
    } catch (error) {
        res.status(500).send("server error")
        
    }
}
const addproductPage=(req,res)=>{
    try {
        res.render("adminaddproductPage")
    } catch (error) {
        res.status(500).send("server error")
    }
}
const ordersPage=(req,res)=>{
    try {
        res.render("adminordersPage")
    } catch (error) {
        res.status(500).send("server error")
        
    }
}
const coupenPage=(req,res)=>{
    try {
        res.render("admincoupenPage")
    } catch (error) {
        res.status(500).send("server error")
        
    }
}
const salesPage=(req,res)=>{
    try {
        res.render("adminsalesreportPage")
    } catch (error) {
        res.status(500).send("server error")
        
    }
}
const categoryPage=(req,res)=>{
    try {
        res.render("admincategoryPage")
    } catch (error) {
        res.status(500).send("server error")
    }
}
const offersPage=(req,res)=>{
    try {
        res.render("adminoffersPage")
    } catch (error) {
        res.status(500).send("server error")
    }
}
const settingsPage=(req,res)=>{
    try {
        res.render("settingsPage")
    } catch (error) {
        res.status(500).send("server error")
    }
}
const adminLogout=(req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.redirect("/admin/login")
  });
}
module.exports={
    adminloginpage,
    postLogin,
    dashboardPage,
    productsPage,
    ordersPage,
    coupenPage,
    salesPage,
    categoryPage,
    offersPage,
    settingsPage,
    addproductPage,
    adminLogout
}