const Offer = require('../../models/offerSchema');
const Category=require("../../models/categorySchema")
const Product=require("../../models/productSchema");




const getOfferPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Current page
        const limit = 5; // Items per page
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalOffers = await Offer.countDocuments();
        const totalPages = Math.ceil(totalOffers / limit);

        // Get paginated offers
        const offers = await Offer.find()
            .populate('products')
            .populate('category')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Update status of expired offers
        const currentDate = new Date();
        for (const offer of offers) {
            if (currentDate > new Date(offer.validTill) && offer.status === 'active') {
                await Offer.findByIdAndUpdate(offer._id, { status: 'inactive' });
                offer.status = 'inactive';
            }
        }

        res.render("offers", { 
            offers,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};




const getProductOfferPage = async (req, res) => {
    try {
        // Fetch only unblocked products
        const data = await Product.find({ isBlocked: false })
            .select('_id productName price'); // Only fetch needed fields
        
        res.render("productOffer", { data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
}

const addProductOffer = async (req, res) => {
    try {
        const { offerName, discountPercentage, productIds, expiryDate } = req.body;

        // Check for duplicate offer name
        const existingOffer = await Offer.findOne({ 
            title: { $regex: new RegExp(`^${offerName}$`, 'i') } // Case-insensitive check
        });

        if (existingOffer) {
            return res.json({ 
                success: false, 
                message: 'An offer with this name already exists. Please choose a different name.' 
            });
        }

        // Validate input
        if (!offerName || !discountPercentage || !productIds || !expiryDate) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Validate products exist
        const productsExist = await Product.countDocuments({
            _id: { $in: productIds },
            isBlocked: false
        });

        if (productsExist !== productIds.length) {
            return res.json({ 
                success: false, 
                message: 'One or more selected products are invalid or blocked' 
            });
        }

        // Create new offer
        const offer = new Offer({
            title: offerName,
            description: `${discountPercentage}% off on selected products`,
            discount: discountPercentage,
            type: 'product',
            products: productIds,
            validTill: expiryDate,
            status: 'active'
        });

        await offer.save();

        res.json({ 
            success: true,
            message: 'Offer created successfully',
            offerId: offer._id
        });

    } catch (error) {
        console.error('Error creating offer:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Error creating offer'
        });
    }
};





const getEditProductOfferPage = async (req, res) => {
    try {
        const offerId = req.params.id;
        
        // Fetch the offer details with populated products
        const offer = await Offer.findById(offerId)
            .populate('products', '_id productName');
        
        if (!offer) {
            return res.redirect('/admin/offers');
        }

        // Get array of product IDs that are already in the offer
        const existingProductIds = offer.products.map(p => p._id);

        // Fetch all unblocked products that aren't already in the offer
        const availableProducts = await Product.find({
            isBlocked: false,
            _id: { $nin: existingProductIds }
        }).select('_id productName');

        res.render('editProductOffer', { 
            offer,
            availableProducts // This was missing in your controller
        });
    } catch (error) {
        console.error('Error fetching offer details:', error);
        res.redirect('/admin/offers');
    }
};



const updateProductOffer = async (req, res) => {
    try {
        const { offerId, offerName, discountPercentage, productIds, expiryDate, status } = req.body;

        // Check for duplicate name excluding current offer
        const existingOffer = await Offer.findOne({ 
            _id: { $ne: offerId },
            title: { $regex: new RegExp(`^${offerName}$`, 'i') }
        });

        if (existingOffer) {
            return res.json({ 
                success: false, 
                message: 'An offer with this name already exists'
            });
        }

        // Validate products exist
        const productsExist = await Product.countDocuments({
            _id: { $in: productIds },
            isBlocked: false
        });

        if (productsExist !== productIds.length) {
            return res.json({ 
                success: false, 
                message: 'One or more selected products are invalid or blocked'
            });
        }

        // Update offer
        const updatedOffer = await Offer.findByIdAndUpdate(
            offerId,
            {
                title: offerName,
                description: `${discountPercentage}% off on selected products`,
                discount: discountPercentage,
                products: productIds,
                validTill: expiryDate,
                status
            },
            { new: true }
        );

        if (!updatedOffer) {
            return res.json({
                success: false,
                message: 'Offer not found'
            });
        }

        res.json({
            success: true,
            message: 'Offer updated successfully'
        });

    } catch (error) {
        console.error('Error updating offer:', error);
        res.json({
            success: false,
            message: error.message || 'Error updating offer'
        });
    }
};





//category

const getCategoryOfferPage = async (req, res) => {
    try {
        // Fetch active categories using your existing structure
        const cat = await Category.find({ 
            isListed: true,
            status: 'active'
        }).sort({ createdAt: -1 });
        
        res.render("categoryOffer", {
            cat: cat,  // Match the variable name you use
            title: "Category Offer"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
}




const addCategoryOffer = async (req, res) => {
    try {
        const { offerName, discountPercentage, categoryIds, expiryDate } = req.body;

        // Check for duplicate offer name
        const existingOffer = await Offer.findOne({ 
            title: { $regex: new RegExp(`^${offerName}$`, 'i') }
        });

        if (existingOffer) {
            return res.json({ 
                success: false, 
                message: 'An offer with this name already exists. Please choose a different name.' 
            });
        }

        // Validate input
        if (!offerName || !discountPercentage || !categoryIds || !expiryDate) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Validate categories exist and are active
        const validCategories = await Category.find({
            _id: { $in: categoryIds },
            isListed: true,
            status: 'active'
        });

        if (validCategories.length !== categoryIds.length) {
            return res.json({ 
                success: false, 
                message: 'One or more selected categories are invalid or inactive' 
            });
        }

        // Create new offer
        const offer = new Offer({
            title: offerName,
            description: `${discountPercentage}% off on selected categories`,
            discount: discountPercentage,
            type: 'category',
            category: categoryIds,
            validTill: expiryDate,
            status: 'active'
        });

        await offer.save();

        // Update categoryOffer field for all selected categories
        await Category.updateMany(
            { _id: { $in: categoryIds } },
            { $set: { categoryOffer: discountPercentage } }
        );

        res.json({ 
            success: true,
            message: 'Category offer created successfully',
            offerId: offer._id
        });

    } catch (error) {
        console.error('Error creating category offer:', error);
        
        // Attempt to rollback category updates if offer creation fails
        if (error && categoryIds) {
            try {
                await Category.updateMany(
                    { _id: { $in: categoryIds } },
                    { $set: { categoryOffer: 0 } }
                );
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
            }
        }

        res.json({ 
            success: false, 
            message: error.message || 'Error creating category offer'
        });
    }
};




const getEditCategoryOfferPage = async (req, res) => {
    try {
        const offerId = req.params.id;
        
        // Fetch the offer details with populated categories
        const offer = await Offer.findById(offerId)
            .populate('category', '_id name');
        
        if (!offer) {
            return res.redirect('/admin/categoryOffer');
        }

        // Get array of category IDs that are already in the offer
        const existingCategoryIds = offer.category.map(c => c._id);

        // Fetch all active categories that aren't already in the offer
        const availableCategories = await Category.find({
            isListed: true,
            status: 'active',
            _id: { $nin: existingCategoryIds }
        }).select('_id name');

        res.render('editCategoryOffer', { 
            offer,
            availableCategories
        });
    } catch (error) {
        console.error('Error fetching offer details:', error);
        res.redirect('/admin/categoryOffer');
    }
};

const updateCategoryOffer = async (req, res) => {
    try {
        const { offerId, offerName, discountPercentage, categoryIds, expiryDate, status } = req.body;

        // Check for duplicate name excluding current offer
        const existingOffer = await Offer.findOne({ 
            _id: { $ne: offerId },
            title: { $regex: new RegExp(`^${offerName}$`, 'i') }
        });

        if (existingOffer) {
            return res.json({ 
                success: false, 
                message: 'An offer with this name already exists'
            });
        }

        // Validate categories exist and are active
        const validCategories = await Category.find({
            _id: { $in: categoryIds },
            isListed: true,
            status: 'active'
        });

        if (validCategories.length !== categoryIds.length) {
            return res.json({ 
                success: false, 
                message: 'One or more selected categories are invalid or inactive'
            });
        }

        // Reset categoryOffer for previously selected categories
        const currentOffer = await Offer.findById(offerId);
        if (currentOffer && currentOffer.category) {
            await Category.updateMany(
                { _id: { $in: currentOffer.category } },
                { $set: { categoryOffer: 0 } }
            );
        }

        // Update offer
        const updatedOffer = await Offer.findByIdAndUpdate(
            offerId,
            {
                title: offerName,
                description: `${discountPercentage}% off on selected categories`,
                discount: discountPercentage,
                category: categoryIds,
                validTill: expiryDate,
                status
            },
            { new: true }
        );

        if (!updatedOffer) {
            return res.json({
                success: false,
                message: 'Offer not found'
            });
        }

        // Update categoryOffer for newly selected categories
        await Category.updateMany(
            { _id: { $in: categoryIds } },
            { $set: { categoryOffer: discountPercentage } }
        );

        res.json({
            success: true,
            message: 'Offer updated successfully'
        });

    } catch (error) {
        console.error('Error updating offer:', error);
        res.json({
            success: false,
            message: error.message || 'Error updating offer'
        });
    }
};





module.exports={
    getOfferPage,
    getProductOfferPage,
    addProductOffer,
    getCategoryOfferPage,
    addCategoryOffer,
    updateProductOffer,
    getEditProductOfferPage,
    getEditCategoryOfferPage,
    updateCategoryOffer
}