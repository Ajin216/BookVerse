const Category=require("../../models/categorySchema")


const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);
        res.render("category", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};



const addCategory = async (req, res) => {
    const { name, description, status } = req.body;

    // Validate required fields
    if (!name || !description || !status) {
        return res.status(400).json({ 
            error: "All fields are required" 
        });
    }

    // Trim whitespace from name
    const trimmedName = name.trim();
    
    // Validate name format - only letters, numbers, and spaces allowed
    if (!/^[a-zA-Z0-9\s]+$/.test(trimmedName)) {
        return res.status(400).json({ 
            error: "Category name should contain only letters, numbers and spaces" 
        });
    }

    // Validate name length
    if (trimmedName.length < 3 || trimmedName.length > 50) {
        return res.status(400).json({
            error: "Category name must be between 3 and 50 characters"
        });
    }

    // Validate description
    if (description.trim().length < 5 || description.trim().length > 500) {
        return res.status(400).json({
            error: "Description must be between 5 and 500 characters"
        });
    }

    // Validate status
    if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({
            error: "Status must be either 'active' or 'inactive'"
        });
    }

    try {
        // Check for existing category with case-insensitive search
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') } // Case insensitive check
        });
        
        if (existingCategory) {
            return res.status(400).json({ 
                error: "Category with this name already exists" 
            });
        }

        // Create new category
        const newCategory = new Category({
            name: trimmedName,
            description,
            status
        });

        await newCategory.save();
        
        return res.status(200).json({ 
            success: true,
            message: "Category added successfully" 
        });
    } catch (error) {
        console.error('Error adding category:', error);
        return res.status(500).json({ 
            error: "Internal Server Error" 
        });
    }
};






const editCategory = async (req, res) => {
    const { id, name, description, status } = req.body;

    // Basic validation for required fields
    if (!id) {
        return res.status(400).json({ error: "ID is required" });
    }
    if (!name) {
        return res.status(400).json({ error: "Name is required" });
    }
    if (!description) {
        return res.status(400).json({ error: "Description is required" });
    }
    if (!status || (status !== "active" && status !== "inactive")) {
        return res.status(400).json({ error: "Status must be either 'active' or 'inactive'" });
    }

    // Trim whitespace from name
    const trimmedName = name.trim();
    
    // Validate name format - only letters, numbers, and spaces allowed
    if (!/^[a-zA-Z0-9\s]+$/.test(trimmedName)) {
        return res.status(400).json({ 
            error: "Category name should contain only letters, numbers and spaces" 
        });
    }

    // Validate name length
    if (trimmedName.length < 3 || trimmedName.length > 50) {
        return res.status(400).json({
            error: "Category name must be between 3 and 50 characters"
        });
    }

    // Validate description
    if (description.trim().length < 5 || description.trim().length > 500) {
        return res.status(400).json({
            error: "Description must be between 5 and 500 characters"
        });
    }

    try {
        // Check if this category exists
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        // Check if name already exists (excluding the current category)
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
            _id: { $ne: id } // Exclude the current category
        });

        if (existingCategory) {
            return res.status(400).json({
                error: "Another category with this name already exists"
            });
        }

        // Update category fields
        category.name = trimmedName;
        category.description = description;
        category.status = status;

        await category.save();
        return res.json({ message: "Category updated successfully" });
    } catch (error) {
        console.error("Error updating category:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};



module.exports={
    categoryInfo,
    addCategory,
    editCategory 
}