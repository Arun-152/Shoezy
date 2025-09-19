const Category = require("../../models/categorySchema");

const categoryPage = async (req, res) => {
    try {
       const searchRaw = req.query.search
       const search = typeof(searchRaw) === "string" ? searchRaw.trim() : "";
        function escapeRegex(string) {
            return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");   
        }      
        const escapedSearch =escapeRegex(search);
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page-1) * limit;

        const searchFilter = escapedSearch ? {name:{$regex:escapedSearch,$options:"i"}} : {};

        const categoryData = await Category.find({...searchFilter,isDeleted:false})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments({...searchFilter,isDeleted:false});
        const totalPages = Math.ceil(totalCategories / limit);
        res.render("admincategoryPage", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            search:search
        });
    } catch (error) {
        console.error(error);
        return res.redirect("/adminerrorPage");
    }
}
const addCategory = async (req, res) => {
    try {
        const { name, description, categoryOffer } = req.body;

        // Validation for required fields
        if (!name || !description) {
            return res.status(400).json({ error: "Name and description are required" });
        }

        // Validate category offer
        let parsedCategoryOffer = categoryOffer ? parseFloat(categoryOffer) : null;
        if (categoryOffer && (isNaN(parsedCategoryOffer) || parsedCategoryOffer < 0 || parsedCategoryOffer > 100)) {
            return res.status(400).json({ error: "Category offer must be a percentage between 0 and 100" });
        }

        // Check for existing category
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        // Create new category
        const category = new Category({
            name,
            description,
            categoryOffer: parsedCategoryOffer || undefined
        });

        await category.save();
        res.status(201).json({ success: true, message: "Category added successfully", id: category._id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};


const categoryDelete = async (req, res) => {
    try {
        const { id } = req.params
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }
        await Category.findByIdAndUpdate(id, { isDeleted: true });
        res.json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const categoryToggle = async (req, res) => {
    try {
        const { id } = req.body;

        if(!id){
            return res.status(400).json({success:false,message:"Category id is required"})
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }
       
        category.isListed=!category.isListed
        await category.save()

        return res.json({
            success: true,
            message: `Category ${category.isListed ? "Listed": "Unlisted"} successfully`,
            categoryId: id,
            isListed: false,
        });
    } catch (error) {
        console.error("Error unlisting category:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}
const categoryEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, categoryOffer } = req.body;

        // Validation for required fields
        if (!name || !description) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Validate category offer
        let parsedCategoryOffer = categoryOffer ? parseFloat(categoryOffer) : null;
        if (categoryOffer && (isNaN(parsedCategoryOffer) || parsedCategoryOffer < 0 || parsedCategoryOffer > 100)) {
            return res.status(400).json({ message: "Category offer must be a percentage between 0 and 100" });
        }

        // Check for existing category with the same name
        const existing = await Category.findOne({ name: name.trim(), _id: { $ne: id } });
        if (existing) {
            return res.status(400).json({ message: "Category name already existing" });
        }

        // Update category
        const updated = await Category.findByIdAndUpdate(
            id,
            {
                name: name.trim(),
                description: description.trim(),
                categoryOffer: parsedCategoryOffer !== null ? parsedCategoryOffer : undefined
            },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json({ message: "Category updated successfully" });

    } catch (error) {
        console.error("Edit category error", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    categoryPage,
    addCategory,
    categoryDelete,
    categoryToggle,
    categoryEdit
};