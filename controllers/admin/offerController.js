const Offer = require('../../models/offerSchema');
const Category=require("../../models/categorySchema")
const Product=require("../../models/productSchema");



// const getOfferPage = async (req, res) => {
//     try {
//         const offers = await Offer.find()
//             .populate('products')
//             .populate('category')
//             .sort({ createdAt: -1 });
//         res.render("offers", { offers });
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Server Error');
//     }
// }


// const getProductOfferPage = async (req, res) => {
//     try {
//         // Fetch products and store as 'data' to match your other views
//         const data = await Product.find({ isBlocked: false });
        
//         // Pass data to the template
//         res.render("productOffer", { data: data });
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Server Error');
//     }
// }



// //add offer

// const addProductOffer = async (req, res) => {
//     try {
//         const { offerName, discountPercentage, productId, expiryDate } = req.body;

//         const offer = new Offer({
//             title: offerName,
//             description: `${discountPercentage}% off on selected product`,
//             discount: discountPercentage,
//             type: 'product',
//             products: [productId],
//             validTill: expiryDate,
//             status: 'active'
//         });

//         await offer.save();
//         res.json({ success: true });
//     } catch (error) {
//         console.error(error);
//         res.json({ success: false, message: error.message });
//     }
// };





const getOfferPage = async (req, res) => {
    try {
        const offers = await Offer.find()
            .populate('products')
            .populate('category')
            .sort({ createdAt: -1 });
        res.render("offers", { offers });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
}

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
        
        // Fetch the offer with populated products
        const offer = await Offer.findById(offerId).populate('products');
        
        if (!offer) {
            return res.redirect('/admin/offers');
        }

        // Fetch all unblocked products
        const data = await Product.find({ 
            isBlocked: false,
            _id: { $nin: offer.products.map(p => p._id) } // Exclude already selected products
        }).select('_id productName price');
        
        res.render("editProductOffer", { offer, data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

const updateProductOffer = async (req, res) => {
    try {
        const { offerId, offerName, discountPercentage, productIds, expiryDate, status } = req.body;

        // Validate input
        if (!offerId || !offerName || !discountPercentage || !productIds || !expiryDate || !status) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Check for duplicate offer name excluding current offer
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
                status: status
            },
            { new: true }
        ).populate('products');

        if (!updatedOffer) {
            return res.json({
                success: false,
                message: 'Offer not found'
            });
        }

        res.json({ 
            success: true,
            message: 'Offer updated successfully',
            offer: updatedOffer
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
        const { offerName, discountPercentage, categoryId, expiryDate } = req.body;

        // Create new offer
        const newOffer = new Offer({
            title: offerName,
            description: `${offerName} - Category Offer`,
            discount: discountPercentage,
            type: 'category',
            category: [categoryId],
            validTill: expiryDate,
            status: 'active'
        });

        await newOffer.save();

        // Update category with offer
        await Category.findByIdAndUpdate(categoryId, {
            categoryOffer: discountPercentage
        });

        res.json({ success: true, message: 'Offer created successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error creating offer' 
        });
    }
};




// const getOfferById = async (req, res) => {
//     try {
//         const offer = await Offer.findById(req.params.id)
//             .populate('products')
//             .populate('category');
        
//         if (!offer) {
//             return res.status(404).json({ success: false, message: 'Offer not found' });
//         }

//         res.json({ success: true, offer });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// };

// const updateOffer = async (req, res) => {
//     try {
//         const { title, discount, validTill, status } = req.body;
//         const offerId = req.params.id;

//         const offer = await Offer.findById(offerId);
//         if (!offer) {
//             return res.status(404).json({ success: false, message: 'Offer not found' });
//         }

//         // Update offer details
//         offer.title = title;
//         offer.discount = discount;
//         offer.validTill = validTill;
//         offer.status = status;

//         // If it's a category offer, update the category
//         if (offer.type === 'category' && offer.category.length > 0) {
//             await Category.findByIdAndUpdate(offer.category[0], {
//                 categoryOffer: discount
//             });
//         }

//         await offer.save();

//         res.json({ success: true, message: 'Offer updated successfully' });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };



module.exports={
    getOfferPage,
    getProductOfferPage,
    addProductOffer,
    getCategoryOfferPage,
    addCategoryOffer,
    // getOfferById,
    // updateOffer
    updateProductOffer,
    getEditProductOfferPage 
}