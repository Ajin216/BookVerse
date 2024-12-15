const Order= require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require("../../models/userScheme");


const getAdminOrderPage = async (req, res) => {
    try {
        // Fetch all orders with populated user and product details
        const orders = await Order.find()
            .populate({
                path: 'userId', 
                select: 'name email'
            })
            .populate({
                path: 'items.productId', 
                select: 'productName productImage'
            })
            .sort({ createdAt: -1 }); // Sort by most recent orders first

        res.render("adminOrder", { orders });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Server error")
    }
}

// New controller method to get order details
const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.query.orderId;
        console.log('Requested Order ID:', orderId);

        // Validate orderId
        if (!orderId) {
            return res.status(400).render('error', { 
                message: 'Order ID is required',
                title: 'Error'
            });
        }

        // Find the specific order and populate related fields
        const order = await Order.findById(orderId)
            .populate({
                path: 'userId',
                select: 'name email' // Select specific user fields
            })
            .populate({
                path: 'items.productId',
                select: 'productName productImage' // Select product fields
            });

        // Log the found order for debugging
        console.log('Found Order:', JSON.stringify(order, null, 2));

        if (!order) {
            return res.status(404).render('error', { 
                message: 'Order not found',
                title: 'Order Not Found'
            });
        }

        // Render the view with order details
        res.render('viewOrders', { 
            order: order,
            title: 'Order Details'
        });
    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).render('error', { 
            message: "Server error occurred while fetching order details",
            title: 'Server Error'
        });
    }
}



const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, newStatus } = req.body;

        // Validate input
        if (!orderId || !newStatus) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID and new status are required',
                icon: 'warning'
            });
        }

        // Define allowed status progression
        const allowedStatusProgression = {
            'Pending': ['Processing'],
            'Processing': ['Shipped'],
            'Shipped': ['Delivered'],
            'Delivered': [],
            'Cancelled': []
        };

        // Find the current order
        const currentOrder = await Order.findById(orderId);

        // Check if the status change is allowed
        const currentStatus = currentOrder.order_status;
        const allowedNextStatuses = allowedStatusProgression[currentStatus] || [];
        
        if (!allowedNextStatuses.includes(newStatus) && newStatus !== 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status progression',
                icon: 'error'
            });
        }

        // Prepare update object
        const updateData = { order_status: newStatus };

        // If status is Delivered, automatically change payment status to Paid
        if (newStatus === 'Delivered') {
            updateData.payment_status = 'Paid';
        }

        // Find and update the order
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId, 
            updateData, 
            { new: true } // Return the updated document
        );

        if (!updatedOrder) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found',
                icon: 'error'
            });
        }

        // Send back a success response
        res.json({ 
            success: true, 
            message: 'Order status updated successfully',
            icon: 'success',
            newStatus: updatedOrder.order_status,
            newPaymentStatus: updatedOrder.payment_status
        });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error occurred while updating order status",
            icon: 'error'
        });
    }
}








module.exports={
    getAdminOrderPage,
    getOrderDetails,
    updateOrderStatus,
    
}