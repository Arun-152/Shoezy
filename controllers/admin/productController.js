const Products = require("../../models/productSchema")
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema")
const MulterError = require('multer').MulterError;
const calculateBestOffer = require("../../helpers/calculatorBestOffer");


const productsPage = async (req, res) => {
    try {
        const searchRaw = req.query.search;
        const search = typeof searchRaw === "string" ? searchRaw.trim() : "";
        const escapeRegex = (string) => string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        const escapedSearch = escapeRegex(search);
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const searchFilter = escapedSearch ? { productName: { $regex: escapedSearch, $options: "i" } } : {};
        const productsData = await Products.find({ ...searchFilter, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .populate("category")
            .limit(limit);
        const totalProducts = await Products.countDocuments({ ...searchFilter, isDeleted: false });
        const totalPages = Math.ceil(totalProducts / limit)
        return res.render("productsPage", {
            products: productsData,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            search: search
        });
    } catch (error) {
        console.error("Error in productsPage:", error);
        return res.redirect("/admin/adminErrorPage");
    }
};

const loadAddProductPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true, isDeleted: false });
        return res.render("adminaddproductPage", {
            cat: category,
            message: "",
            error: null,
        });
    } catch (error) {
        console.error("Error loading Add products page:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to load add product page",
        });
    }
};


const addProduct = async (req, res) => {
    try {
        const {
            productName,
            description,
            productOffer,
            color,
            category,
            variants,
        } = req.body;

        const trimmedProductName = productName ? productName.trim() : '';
        if (!trimmedProductName) return res.status(400).json({ error: 'Product name cannot be empty.' });
        if (trimmedProductName.length < 2 || trimmedProductName.length > 100)
            return res.status(400).json({ error: 'Product name must be 2-100 characters' });

        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(trimmedProductName))
            return res.status(400).json({ error: 'Product name contains invalid characters' });

        const existingProduct = await Products.findOne({
            productName: { $regex: new RegExp(`^${trimmedProductName}$`, 'i') },
            isDeleted: false,
        });
        if (existingProduct) return res.status(400).json({ error: 'This product already exists.' });

        if (!description || description.trim().length < 10 || description.trim().length > 500)
            return res.status(400).json({ error: 'Description must be 10-500 characters' });

        let parsedProductOffer = productOffer ? parseFloat(productOffer) : 0;
        if (productOffer && (isNaN(parsedProductOffer) || parsedProductOffer < 0 || parsedProductOffer > 100)) {
            return res.status(400).json({ error: 'Offer must be between 0 and 100' });
        }

        if (!color || !/^[A-Za-z, ]{1,50}$/.test(color.trim()))
            return res.status(400).json({ error: 'Color must be letters, spaces, or commas (max 50 chars)' });

        const categoryDoc = await Category.findById(category);
        if (!categoryDoc || categoryDoc.isDeleted || !categoryDoc.isListed)
            return res.status(400).json({ error: 'Invalid category' });

        const parsedCategoryOffer = categoryDoc.categoryOffer || 0;

        if (!variants || !variants.size || !Array.isArray(variants.size) || variants.size.length === 0)
            return res.status(400).json({ error: 'At least one valid variant is required' });

        const sizes = variants.size;
        const regularPrices = variants.regularPrice.map(Number);
        const quantities = variants.variantQuantity.map(Number);

        if (sizes.length !== regularPrices.length || sizes.length !== quantities.length)
            return res.status(400).json({ error: 'Variant fields mismatch' });

        const selectedSizes = new Set();
        const formattedVariants = sizes.map((size, index) => {
            const regularPrice = regularPrices[index];
            const quantity = quantities[index];

            if (!size || !['6', '7', '8', '9', '10'].includes(size))
                throw new Error('Invalid size');
            if (isNaN(regularPrice) || regularPrice < 0 || isNaN(quantity) || quantity < 0)
                throw new Error('Invalid variant details');
            if (selectedSizes.has(size)) throw new Error('Duplicate sizes are not allowed');

            selectedSizes.add(size);

            const { salePrice, appliedOffer } = calculateBestOffer(regularPrice, parsedProductOffer, parsedCategoryOffer);

            return {
                size,
                regularPrice,
                salePrice,
                variantQuantity: quantity,
                appliedOffer,
            };
        });

        const totalQuantity = quantities.reduce((sum, qty) => sum + qty, 0);
        const newStatus = totalQuantity > 0 ? 'Available' : 'out of stock';

        if (!req.files || req.files.length !== 3)
            return res.status(400).json({ error: 'Exactly 3 images are required' });

        const imagePaths = req.files.map(file => `/uploads/products/${file.filename}`);

        const newProduct = new Products({
            productName: trimmedProductName,
            description: description.trim(),
            productOffer: parsedProductOffer,
            bestOffer: Math.max(parsedProductOffer, parsedCategoryOffer),
            color: color.trim(),
            category: categoryDoc._id,
            status: newStatus,
            variants: formattedVariants,
            images: imagePaths,
            isBlocked: false,
            isDeleted: false,
            ratings: { average: 0, count: 0 },
            tags: [],
        });

        await newProduct.save();

        res.status(201).json({ success: true, message: 'Product added successfully', product: newProduct });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: error.message || 'Something went wrong' });
    }
};




const blockProduct = async (req, res) => {
    try {
        let id = req.query.id

        await Products.updateOne({ _id: id }, { $set: { isBlocked: true } })
        res.redirect("/admin/products")
    } catch (error) {
        res.redirect("/admin/adminErrorPage")
    }

}

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id
        await Products.updateOne({ _id: id }, { $set: { isBlocked: false } })
        res.redirect("/admin/products")

    } catch (error) {
        res.redirect("/admin/adminErrorPage")

    }

}
const loadEditProduct = async (req, res) => {
    try {
        const id = req.query.id
        const product = await Products.findOne({ _id: id })
        const category = await Category.find({ isListed: true })

        res.render("editproduct", {
            products: product,
            cat: category,

        })

    } catch (error) {
        res.redirect("/admin/adminErrorPage")

    }
}

const editProducts = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;

        if (!data) return res.status(400).json({ success: false, message: "All fields required" });

        const trimmedName = data.productName?.trim();
        if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
            return res.status(400).json({ success: false, error: "Invalid product name" });
        }

        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(trimmedName)) {
            return res.status(400).json({ success: false, error: "Product name contains invalid characters" });
        }

        const existingProduct = await Products.findOne({ productName: { $regex: `^${trimmedName}$`, $options: 'i' }, _id: { $ne: id }, isDeleted: false });
        if (existingProduct) return res.status(400).json({ success: false, error: "This product already exists" });

        if (!data.description || data.description.length < 10 || data.description.length > 500) {
            return res.status(400).json({ success: false, error: "Description must be 10-500 characters" });
        }

        let parsedProductOffer = data.productOffer ? parseFloat(data.productOffer) : 0;
        if (data.productOffer && (isNaN(parsedProductOffer) || parsedProductOffer < 0 || parsedProductOffer > 100)) {
            return res.status(400).json({ success: false, error: "Product offer must be 0-100%" });
        }

        if (!data.color || !/^[A-Za-z, ]{1,50}$/.test(data.color.trim())) {
            return res.status(400).json({ success: false, error: "Invalid color" });
        }
        
        const variants = data.variants;
        if (!variants?.size?.length) return res.status(400).json({ success: false, error: "At least one variant required" });

        const categoryDoc = await Category.findById(data.category);
        if (!categoryDoc || categoryDoc.isDeleted || !categoryDoc.isListed) {
            return res.status(400).json({ success: false, error: "Invalid category" });
        }

        const variantData = [];
        const selectedSizes = new Set();
        let overallBestOfferValue = 0;
        let totalQuantity = 0;

        for (let i = 0; i < variants.size.length; i++) {
            const size = variants.size[i];
            const regularPrice = parseFloat(variants.regularPrice[i]);
            const variantQuantity = parseInt(variants.variantQuantity[i]);

            if (!size || selectedSizes.has(size) || !['6','7','8','9','10'].includes(size)) {
                return res.status(400).json({ success: false, error: "Invalid or duplicate size" });
            }
            selectedSizes.add(size);

            if (isNaN(regularPrice) || regularPrice < 0 || isNaN(variantQuantity) || variantQuantity < 0) {
                return res.status(400).json({ success: false, error: "Invalid variant details" });
            }

            totalQuantity += variantQuantity;

            const { salePrice, appliedOffer } = calculateBestOffer(regularPrice, parsedProductOffer, categoryDoc.categoryOffer || 0);
            overallBestOfferValue = Math.max(overallBestOfferValue, appliedOffer?.value || 0);

            variantData.push({ size, regularPrice, salePrice, variantQuantity, appliedOffer });
        }

        const newStatus = totalQuantity > 0 ? 'Available' : 'out of stock';

        let existingImages = req.body.existingImages || [];
        if (typeof existingImages === 'string') {
            existingImages = [existingImages];
        }

        let newImagePaths = [];
        if (req.files && req.files.length > 0) {
            newImagePaths = req.files.map(file => `/uploads/products/${file.filename}`);
        }

        const imagePaths = [...existingImages, ...newImagePaths];

        const updatedProduct = await Products.findByIdAndUpdate(
            id,
            {
                productName: trimmedName,
                description: data.description.trim(),
                productOffer: parsedProductOffer,
                color: data.color.trim(),
                bestOffer: overallBestOfferValue,
                category: categoryDoc._id,
                variants: variantData,
                images: imagePaths,
                status: newStatus
            },
            { new: true, runValidators: true }
        );

        return res.status(200).json({ success: true, message: "Product updated", product: updatedProduct });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};



const deleteProducts = async (req, res) => {
    try {
        const id = req.params.id
        const products = await Products.findOne({ _id: id })

        if (!products) {
            return res.status(400).json({ success: false, message: "Products not found" })
        }
        await Products.findByIdAndUpdate(id, { isDeleted: true })
        res.json({ success: true, message: "Product deleted successfully" })

    } catch (error) {
        console.error(error.message)
        res.status(500).json({ success: false, message: " Internal server Error " })
    }
}

module.exports = {
    productsPage,
    loadAddProductPage,
    addProduct,
    blockProduct,
    unblockProduct,
    loadEditProduct,
    editProducts,
    deleteProducts
};
