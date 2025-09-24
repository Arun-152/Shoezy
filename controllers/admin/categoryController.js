const Category = require("../../models/categorySchema");
const Products = require("../../models/productSchema")
const MulterError = require('multer').MulterError;
const calculateBestOffer = require("../../helpers/calculatorBestOffer");

const categoryPage = async (req, res) => {
    try {
        const searchRaw = req.query.search
        const search = typeof (searchRaw) === "string" ? searchRaw.trim() : "";
        function escapeRegex(string) {
            return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        }
        const escapedSearch = escapeRegex(search);
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const searchFilter = escapedSearch ? { name: { $regex: escapedSearch, $options: "i" } } : {};

        const categoryData = await Category.find({ ...searchFilter, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments({ ...searchFilter, isDeleted: false });
        const totalPages = Math.ceil(totalCategories / limit);
        res.render("admincategoryPage", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            search: search
        });
    } catch (error) {
        console.error(error);
        return res.redirect("/adminerrorPage");
    }
}

const addCategory = async (req, res) => {
    try {
        const { name, description, categoryOffer } = req.body;

        // 1️⃣ Validation for required fields
        if (!name || !description) {
            return res.status(400).json({ error: "Name and description are required" });
        }

        // 2️⃣ Validate name length and allowed characters
        const trimmedName = name.trim();
        if (trimmedName.length < 2 || trimmedName.length > 100) {
            return res.status(400).json({ error: "Category name must be 2-100 characters" });
        }

        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(trimmedName)) {
            return res.status(400).json({ error: "Category name contains invalid characters" });
        }

        // 3️⃣ Validate description length
        const trimmedDescription = description.trim();
        if (trimmedDescription.length < 10 || trimmedDescription.length > 500) {
            return res.status(400).json({ error: "Description must be 10-500 characters" });
        }

        // 4️⃣ Validate category offer
        let parsedCategoryOffer = null;
        if (categoryOffer !== undefined && categoryOffer !== '') {
            parsedCategoryOffer = parseFloat(categoryOffer);
            if (isNaN(parsedCategoryOffer) || parsedCategoryOffer < 0 || parsedCategoryOffer > 100) {
                return res.status(400).json({ error: "Category offer must be a percentage between 0 and 100" });
            }
        }

        // 5️⃣ Check for existing category with same name
        const existingCategory = await Category.findOne({ name: trimmedName });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        // 6️⃣ Create new category
        const category = new Category({
            name: trimmedName,
            description: trimmedDescription,
            categoryOffer: parsedCategoryOffer !== null ? parsedCategoryOffer : undefined
        });

        await category.save();

        res.status(201).json({
            success: true,
            message: "Category added successfully",
            categoryId: category._id,
            category: category
        });

    } catch (error) {
        console.error("Add category error:", error);
        res.status(500).json({ error: "Internal server error" });
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

        if (!id) {
            return res.status(400).json({ success: false, message: "Category id is required" })
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        category.isListed = !category.isListed
        await category.save()

        return res.json({
            success: true,
            message: `Category ${category.isListed ? "Listed" : "Unlisted"} successfully`,
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

        // Validation
        if (!name || !description) {
            return res.status(400).json({ message: "All fields are required" });
        }

        let parsedCategoryOffer = null;
        if (categoryOffer !== undefined && categoryOffer.toString().trim() !== '') {
            parsedCategoryOffer = parseFloat(categoryOffer);
            if (isNaN(parsedCategoryOffer) || parsedCategoryOffer < 0 || parsedCategoryOffer > 100) {
                return res.status(400).json({ message: "Category offer must be a number between 0 and 100" });
            }
        }


        const existing = await Category.findOne({ name: name.trim(), _id: { $ne: id } });
        if (existing) return res.status(400).json({ message: "Category name already exists" });

        const updateObj = {
            name: name.trim(),
            description: description.trim()
        };
        updateObj.categoryOffer = parsedCategoryOffer; 

        const updatedCategory = await Category.findByIdAndUpdate(id, updateObj, { new: true, runValidators: true });
        if (!updatedCategory) return res.status(404).json({ message: "Category not found" });
        const products = await Products.find({ category: id, isDeleted: false });

        for (const product of products) {
            let overallBestOfferValue = 0;
            const variantData = [];

            for (const variant of product.variants) {
                const { salePrice, appliedOffer } = calculateBestOffer(
                    variant.regularPrice,
                    product.productOffer || 0,
                    parsedCategoryOffer || 0
                );

                overallBestOfferValue = Math.max(overallBestOfferValue, appliedOffer?.value || 0);

                variantData.push({
                    ...variant.toObject(),
                    salePrice,
                    appliedOffer
                });
            }

            await Products.findByIdAndUpdate(
                product._id,
                {
                    variants: variantData,
                    bestOffer: overallBestOfferValue
                },
                { new: true, runValidators: true }
            );
        }

        res.json({ message: "Category updated successfully", category: updatedCategory });

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