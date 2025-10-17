const User = require("../../models/userSchema")


const customerPage=async (req,res)=>{
    try {

        const searchRaw=req.query.search
        const search = typeof(searchRaw) === "string" ? searchRaw.trim():"";
        function escapeRegex(string){
            return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
        }
        const escapedSearch=escapeRegex(search)
        const page=parseInt(req.query.page)|| 1
        const limit=5
        const skip=(page-1)*limit

        const searchFilter = escapedSearch ? {
            $or: [
                {fullname: {$regex: escapedSearch, $options: "i"}},
                {email: {$regex: escapedSearch, $options: "i"}}
            ]
        } : {};

        const customerData = await User.find({...searchFilter})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit)

        const totalCustomers= await User.countDocuments({...searchFilter})
        const totalPages=Math.ceil(totalCustomers/limit)
        res.render("customerPage",{
            customers:customerData,
            currentPage:page,
            totalPages:totalPages,
            limit,
            totalCustomers:totalCustomers,
            search,
        })
    } catch (error) {
        console.error(error)
        return res.redirect("/admin/adminErrorPage")
    }

}

const customerBlocked= async(req,res)=>{
    try {
        let {id}=req.query
        if(!id){
            return res.status(404).json({succes:false})
        }
        await User.updateOne({_id:id},{$set:{isBlocked:true}})
        res.redirect("/admin/customers")
    } catch (error) {
        res.redirect("/admin/adminErrorPage")
    }
}

const customerUnblocked= async(req,res)=>{
    try {
        let id=req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
        res.redirect("/admin/customers")
    } catch (error) {
        res.redirect("/admin/adminErrorPage")
    }
}
module.exports={
    customerPage,
    customerBlocked,
    customerUnblocked
}