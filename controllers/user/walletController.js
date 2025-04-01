const User=require("../../models/userScheme");
const Wallet = require('../../models/walletSchema')
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const Order = require('../../models/orderSchema');







const getWalletPage = async (req, res) => {
    try {
        const userId = req.session.user; // Changed from user_id to user to match profile controller
        
        if (!userId) {
            return res.redirect('/login');
        }

        // Find the user first
        const user = await User.findById(userId);
        if (!user || user.isBlocked) {
            req.session.destroy(); // Match profile controller's behavior
            return res.redirect('/login');
        }

        // Find or create wallet for the user
        let wallet = await Wallet.findOne({ user_id: user._id }); // Use user._id since we already have the user object
        
        if (!wallet) {
            // Create new wallet
            wallet = new Wallet({
                user_id: user._id,
                balance: 0,
                history: []
            });
            await wallet.save();

            // Update user's wallet reference
            user.wallet = wallet._id;
            await user.save();
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get total count of transactions for pagination
        const totalTransactions = wallet.history ? wallet.history.length : 0;
        const totalPages = Math.ceil(totalTransactions / limit);

        // Find wallet with user data
        wallet = await Wallet.findOne({ user_id: user._id })
            .populate({
                path: 'user_id',
                select: 'name email'
            });

        // If wallet exists and has history, apply pagination to the history array
        if (wallet && wallet.history && wallet.history.length > 0) {
            // Sort history by date (newest first)
            wallet.history.sort((a, b) => b.date - a.date);
            
            // Create a copy of the full history for pagination
            const fullHistory = [...wallet.history];
            
            // Apply pagination on the history array
            wallet.history = fullHistory.slice(skip, skip + limit);
        }

        res.render("wallet", { 
            wallet,
            user: {
                name: user.name || 'User',
                email: user.email || 'N/A',
                phone: user.phone || 'Not provided'
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                limit: limit,
                totalItems: totalTransactions
            }
        });

    } catch (error) {
        console.log("Error loading wallet page:", error);
        res.status(500).send("Server error");
    }
};





module.exports={
    getWalletPage
}