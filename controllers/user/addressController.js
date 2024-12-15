const User = require('../../models/userScheme');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address=require('../../models/addressSchema')


const getAddressPage = async (req, res) => {
    try {
        // Check if user is in session
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Find addresses for the specific user
        // Use toString() to ensure correct ObjectId comparison
        const addresses = await Address.find({ 
            userId: req.session.user.toString() 
        });

        // Render address page with found addresses
        res.render("address", { 
            addresses: addresses 
        });
    } catch (error) {
        console.error("Error loading address page:", error);
        res.status(500).send("Server error");
    }
};



const addAddress = async (req, res) => {
    try {
        // Validate incoming data
        const { 
            addressName, 
            addressHouse, 
            addressPost, 
            addressDistrict, 
            addressState, 
            addressMobile, 
            addressPin 
        } = req.body;

        // Server-side validation
        if (!req.session.user) {
            return res.status(401).json({ message: 'Please login to add address' });
        }

        if (!addressName || addressName.length < 2) {
            return res.status(400).json({ message: 'Invalid name' });
        }

        // Similar validations for other fields...

        const newAddress = new Address({
            userId: req.session.user.toString(),
            ...req.body,
            addressPin: parseInt(req.body.addressPin)
        });
        
        const savedAddress = await newAddress.save();
        
        res.status(201).json({ 
            success: true, 
            message: 'Address added successfully',
            addressId: savedAddress._id
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to add address'
        });
    }
};



const updateAddress = async (req, res) => {
    try {
        // Destructure and validate incoming data
        const { 
            addressId,
            addressName, 
            addressHouse, 
            addressPost, 
            addressDistrict, 
            addressState, 
            addressMobile, 
            addressPin 
        } = req.body;

        // Comprehensive server-side validations
        const validationErrors = [];

        // Ensure user is logged in
        if (!req.session.user) {
            return res.status(401).json({ message: 'Please login to update address' });
        }

        // Name validation
        if (!addressName || addressName.length < 2) {
            validationErrors.push('Name must be at least 2 characters long');
        }

        // Mobile number validation
        const mobileRegex = /^[6-9]\d{9}$/;
        if (!addressMobile || !mobileRegex.test(addressMobile)) {
            validationErrors.push('Invalid mobile number');
        }

        // PIN code validation
        const pinRegex = /^\d{6}$/;
        if (!addressPin || !pinRegex.test(addressPin)) {
            validationErrors.push('PIN code must be 6 digits');
        }

        // House address validation
        if (!addressHouse || addressHouse.length < 3) {
            validationErrors.push('House address is too short');
        }

        // Return validation errors if any
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // Find and update the address
        const updatedAddress = await Address.findOneAndUpdate(
            { 
                _id: addressId, 
                userId: req.session.user.toString() 
            }, 
            {
                addressName,
                addressHouse,
                addressPost,
                addressDistrict,
                addressState,
                addressMobile,
                addressPin: parseInt(addressPin)
            },
            { 
                new: true,  // Return the updated document
                runValidators: true  // Run model validations
            }
        );

        if (!updatedAddress) {
            return res.status(404).json({ message: 'Address not found or you do not have permission to update' });
        }

        // Successful response with detailed message
        res.status(200).json({ 
            success: true, 
            message: 'Address updated successfully',
            address: updatedAddress
        });
    } catch (error) {
        // Detailed error logging
        console.error('Error updating address:', error);
        
        // Determine the type of error and send appropriate response
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }

        // Generic server error
        res.status(500).json({ 
            message: 'Failed to update address',
            error: error.message || 'Internal server error'
        });
    };
};











const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;

        // Ensure user is logged in
        if (!req.session.user) {
            return res.status(401).json({ message: 'Please login to delete address' });
        }

        const deletedAddress = await Address.findOneAndDelete({ 
            _id: addressId, 
            userId: req.session.user.toString() 
        });

        if (!deletedAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Address deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to delete address'
        });
    }
};





module.exports={
    getAddressPage,
    addAddress,
    updateAddress,
    deleteAddress
}