const Coupon = require('../../models/couponSchema');



const getCouponPage = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1; // Current page (default: 1)
        const limit = parseInt(req.query.limit) || 10; // Items per page (default: 10)
        const skip = (page - 1) * limit;
        
        // Get total count of coupons for pagination
        const totalCoupons = await Coupon.countDocuments({});
        const totalPages = Math.ceil(totalCoupons / limit);
        
        // Get paginated coupons
        const coupons = await Coupon.find({})
            .skip(skip)
            .limit(limit);
        
        // Get current date
        const currentDate = new Date();
        
        // Update expired coupons and prepare them for display
        const updatedCoupons = await Promise.all(coupons.map(async (coupon) => {
            const expiryDate = new Date(coupon.expiryDate);
            const isExpired = currentDate > expiryDate;
            
            // If coupon is expired and still active, update it to inactive
            if (isExpired && coupon.is_active) {
                await Coupon.findByIdAndUpdate(coupon._id, { is_active: false });
                coupon.is_active = false;
            }
            
            // Add isExpired property to coupon object
            coupon = coupon.toObject(); // Convert to plain object to add new property
            coupon.isExpired = isExpired;
            return coupon;
        }));

        res.render("coupons", { 
            coupons: updatedCoupons,
            pagination: {
                page,
                limit,
                totalPages,
                totalItems: totalCoupons
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
}




const addCoupon = async (req, res) => {
    try {
        const {
            couponName,
            couponId,
            description,
            validFrom,
            expiryDate,
            discount,
            min_purchase_amount,
            max_amount
        } = req.body;


        // Server-side validations
        if (!/^[a-zA-Z][a-zA-Z0-9\s]*$/.test(couponName)) {
            return res.status(400).json({
                success: false,
                message: 'Coupon name must start with a letter '
            });
        }

        if (!/^[A-Z0-9]{6,}$/.test(couponId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code format'
            });
        }

        if (discount < 1 || discount > 50) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 1 and 50 percent'
            });
        }


        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ couponId });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
        }

        // Create new coupon
        const newCoupon = new Coupon({
            couponName,
            couponId,
            description,
            validFrom,
            expiryDate,
            discount,
            min_purchase_amount,
            max_amount,
            is_active: true
        });

        await newCoupon.save();
        
        res.json({
            success: true,
            message: 'Coupon added successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error adding coupon'
        });
    }
}



const getCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }
        
        res.json({
            success: true,
            coupon
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching coupon'
        });
    }
}

const updateCoupon = async (req, res) => {
    try {
        const {
            couponId,
            couponName,
            couponCode,
            description,
            validFrom,
            expiryDate,
            discount,
            min_purchase_amount,
            max_amount,
            is_active
        } = req.body;

        // Server-side validations
        if (!/^[a-zA-Z][a-zA-Z0-9\s]*$/.test(couponName)) {
            return res.status(400).json({
                success: false,
                message: 'Coupon name must start with a letter '
            });
        }

        if (!/^[A-Z0-9]{6,}$/.test(couponCode)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coupon code format. Must be at least 6 characters of uppercase letters and numbers.'
            });
        }

        if (discount < 1 || discount > 50) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 1 and 50 percent'
            });
        }

        // Date validations
        const currentDate = new Date();
        const validFromDate = new Date(validFrom);
        const expiryDateTime = new Date(expiryDate);

        // Remove time component for date comparison
        currentDate.setHours(0, 0, 0, 0);
        validFromDate.setHours(0, 0, 0, 0);
        expiryDateTime.setHours(23, 59, 59, 999);

        if (validFromDate < currentDate) {
            return res.status(400).json({
                success: false,
                message: 'Valid from date cannot be in the past'
            });
        }

        if (expiryDateTime <= validFromDate) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be after valid from date'
            });
        }

        // Check if coupon name already exists (excluding current coupon)
        const existingCouponName = await Coupon.findOne({
            couponName: { $regex: new RegExp(`^${couponName}$`, 'i') }, // Case-insensitive match
            _id: { $ne: couponId }
        });

        if (existingCouponName) {
            return res.status(400).json({
                success: false,
                message: 'Coupon name already exists'
            });
        }

        // Check if coupon code already exists (excluding current coupon)
        const existingCouponCode = await Coupon.findOne({
            couponId: couponCode,
            _id: { $ne: couponId }
        });
        
        if (existingCouponCode) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
        }

        // Update coupon
        const updatedCoupon = await Coupon.findByIdAndUpdate(
            couponId,
            {
                couponName,
                couponId: couponCode,
                description,
                validFrom,
                expiryDate,
                discount,
                min_purchase_amount,
                max_amount,
                is_active
            },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.json({
            success: true,
            message: 'Coupon updated successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating coupon'
        });
    }
}


const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        
        // Delete the coupon from database
        const result = await Coupon.findByIdAndDelete(couponId);
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        res.json({
            success: true,
            message: "Coupon deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete coupon"
        });
    }
};


module.exports={
    getCouponPage,
    addCoupon,
    getCoupon,
    updateCoupon,
    deleteCoupon 
}
