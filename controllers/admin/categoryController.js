const Category=require("../../models/categorySchema")


const categoryInfo=async(req,res)=>{
    try {
        const page=parseInt(req.query.page) || 1;
        const limit=10;
        const skip=(page-1)*limit;

        const categoryData=await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories=await Category.countDocuments();
        const totalPages=Math.ceil(totalCategories / limit);
        res.render("category",{
            cat:categoryData,
            currentPage:page,
            totalPages:totalPages,
            totalCategories:totalCategories
        })
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
    }
}


const addCategory = async (req, res) => {
    const { name, description, status } = req.body;

    // Validate required fields
    if (!name || !description || !status) {
        return res.status(400).json({ 
            error: "All fields are required" 
        });
    }

    // Validate name format
    if (!/^[a-zA-Z0-9\s]+$/.test(name)) {
        return res.status(400).json({ 
            error: "Category name should contain only letters, numbers and spaces" 
        });
    }

    try {
        // Check for existing category
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') } // Case insensitive check
        });
        
        if (existingCategory) {
            return res.status(400).json({ 
                error: "Category already exists" 
            });
        }

        // Create new category
        const newCategory = new Category({
            name,
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

    // Basic validation
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

    try {
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        // Update category fields
        category.name = name;
        category.description = description;
        category.status = status;

        await category.save();
        return res.json({ message: "Category updated successfully" });
    } catch (error) {
        console.error("Error updating category:", error); // Log the error for debugging
        return res.status(500).json({ error: "Internal Server Error" });
    }
};






module.exports={
    categoryInfo,
    addCategory,
    editCategory 
}