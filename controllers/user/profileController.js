const User = require('../../models/userScheme');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const bcrypt = require('bcrypt');


const getProfilePage = async (req, res) => {
    try {
        // Use the user ID from the session
        const userId = req.session.user;

        // If no user is in the session, redirect to login
        if (!userId) {
            return res.redirect("/login");
        }

        // Find the user by ID
        const user = await User.findById(userId);

        // Check if user exists and is not blocked
        if (!user || user.isBlocked) {
            req.session.destroy(); // Destroy session if user is blocked or not found
            return res.redirect("/login");
        }

        // Render the profile page with user data
        res.render("profile", { 
            user: {
                name: user.name || 'User', 
                email: user.email || 'N/A', 
                phone: user.phone || 'Not provided' 
            }
        });
    } catch (error) {
        console.error("Profile page error:", error);
        res.status(500).send("Server error");
    }
};



const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const { name, phone } = req.body;
        
        // Validate name: Required, only letters and spaces
        if (!name || !name.trim() || !/^[a-zA-Z\s]{2,50}$/.test(name.trim())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name is required and must contain only letters (2-50 characters).' 
            });
        }

        // Validate phone: Optional, must be exactly 10 digits if provided
        if (phone && !/^\d{10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number must be exactly 10 digits.'
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { 
                name: name.trim(), 
                phone: phone ? phone.trim() : null 
            }, 
            { new: true }
        );
        
        if (!updatedUser) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found. Please try again.' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Profile updated successfully!',
            user: {
                name: updatedUser.name,
                phone: updatedUser.phone
            }
        });
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'A server error occurred while updating the profile. Please try again later.' 
        });
    }
};



const changePassword = async (req, res) => {
    try {
        const userId = req.session.user;
        const { currentPassword, newPassword } = req.body;
        
        // Find the user by ID
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found. Please log in again.' 
            });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        
        if (!isPasswordValid) {
            return res.status(400).json({ 
                success: false, 
                message: 'Current password is incorrect.' 
            });
        }

        // Validate new password
        if (currentPassword === newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'New password must be different from current password.' 
            });
        }

        // Hash the new password
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update user's password
        user.password = hashedNewPassword;
        await user.save();

        res.json({ 
            success: true, 
            message: 'Password changed successfully!' 
        });
    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'A server error occurred while changing the password. Please try again later.' 
        });
    }
};





module.exports={
    getProfilePage,
    updateProfile,
    changePassword

}