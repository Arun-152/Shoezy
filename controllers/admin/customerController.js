const User=require("../../models/userSchema")


const customerPage=async (req,res)=>{
    try {

        const users= await User.find({isAdmin:false})
        res.render("customerPage",{users})
    } catch (error) {
        res.status(500).send("server error") 
    }

}

const customerBlocked= async(req,res)=>{
    try {
        let {id}=req.query
        if(!id){
            return res.status(404).json({succes:false})
        }
        console.log(id)
        await User.updateOne({_id:id},{$set:{isBlocked:true}})
        res.redirect("/admin/customers")
    } catch (error) {
        res.redirect("/pageerror")
    }
}

const customerunBlocked= async(req,res)=>{
    try {
        let id=req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
        res.redirect("/admin/customers")
    } catch (error) {
        res.send("errrorr")
    }
   
}

const customerPagination= async(req,res)=>{
    try {
        const page=parseInt(req.query.page) || 1
        const limit=parseInt(req.query.limit) || 10
        const skip=(page-1)*limit

        const users= await User.find()
        .skip(skip)
        .limit(limit)
        .sort({createdAt:-1})

        const total = await User.countDocuments()

        res.json({
            currentPage:page,
            totalPages:Math.ceil(total/limit),
            totalItems:total,
            users
        })
    } catch (error) {
        console.error('Pagination error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
       }
    }

module.exports={
    customerPage,
    customerBlocked,
    customerunBlocked,
    customerPagination
}