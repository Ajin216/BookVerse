const Order = require('../../models/orderSchema');
const User = require("../../models/userScheme");
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');


const getOrderPage = async (req, res) => {
    try {
        const userId = req.session.user;
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 7; // Number of orders per page
        const skip = (page - 1) * limit;

        // Fetch total count of orders
        const totalOrders = await Order.countDocuments({ userId: userId });

        // Calculate total pages
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch paginated orders
        const orders = await Order.find({ userId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render("orders", { 
            orders: orders,
            title: "My Orders",
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
                nextPage: page + 1,
                previousPage: page - 1
            }
        });
    } catch (error) {
        console.error("Comprehensive Order Page Error:", error);
        res.status(500).render('error', { 
            message: 'Detailed Order Retrieval Error',
            error: error.message,
            fullError: error
        });
    }
};



// const getOrderSummary = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;
        
//         // Find order by the custom orderId
//         const order = await Order.findOne({ orderId: orderId })
//             .populate({
//                 path: 'items.productId',
//                 populate: {
//                     path: 'category',
//                     model: 'Category'
//                 }
//             })
//             .populate('address')
//             .populate('userId');

//         if (!order) {
//             return res.status(404).render('error', { 
//                 message: 'Order not found',
//                 error: 'The requested order could not be found'
//             });
//         }

//         // Calculate subtotals for each item
//         const itemsWithSubtotal = order.items.map(item => ({
//             ...item.toObject(),
//             subtotal: item.quantity * item.price
//         }));

//         res.render('orderSummary', { 
//             order: order,
//             items: itemsWithSubtotal,
//             address: order.address,
//             orderId: order.orderId
//         });
//     } catch (error) {
//         console.error('Error fetching order details:', error);
//         res.status(500).render('error', { 
//             message: 'Error retrieving order details',
//             error: error.message 
//         });
//     }
// };



const getOrderSummary = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        // Find order by the custom orderId
        const order = await Order.findOne({ orderId: orderId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    model: 'Category'
                }
            })
            .populate('userId');

        if (!order) {
            return res.status(404).render('error', { 
                message: 'Order not found',
                error: 'The requested order could not be found'
            });
        }

        // The addresses is now an object, not an array, so directly use it
        const orderAddress = order.addresses;

        // Calculate subtotals for each item (now using the existing total in the schema)
        const itemsWithDetails = order.items.map(item => ({
            ...item.toObject(),
            subtotal: item.total, // Using the total already calculated in the schema
            productName: item.name,
            productStatus: item.status
        }));

        res.render('orderSummary', { 
            order: order,
            items: itemsWithDetails,
            address: orderAddress,
            orderId: order.orderId,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.payment_status,
            orderStatus: order.order_status,
            totalPrice: order.totalPrice,
            shippingCost: order.shipping_cost,
            tax: order.tax,
            discount: order.discount
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', { 
            message: 'Error retrieving order details',
            error: error.message 
        });
    }
};



// const cancelOrderItem = async (req, res) => {
//     try {
//         const { orderId, itemId } = req.params;

//         // Find the order
//         const order = await Order.findOne({ orderId: orderId });

//         if (!order) {
//             return res.status(404).json({ 
//                 success: false, 
//                 message: 'Order not found' 
//             });
//         }

//         // Find the item to be cancelled
//         const item = order.items.find(item => 
//             item._id.toString() === itemId
//         );

//         if (!item) {
//             return res.status(404).json({ 
//                 success: false, 
//                 message: 'Item not found in the order' 
//             });
//         }

//         // Update item status instead of removing it
//         item.status = 'Cancelled';
        
//         // Recalculate total price by excluding cancelled items
//         order.totalPrice = order.items.reduce((total, item) => {
//             return item.status !== 'Cancelled' ? total + (item.quantity * item.price) : total;
//         }, 0);

//         // Return the cancelled item to stock
//         await Product.findByIdAndUpdate(item.productId, {
//             $inc: { stock: item.quantity }
//         });

//         // Check if all items are cancelled
//         const allItemsCancelled = order.items.every(item => item.status === 'Cancelled');
//         if (allItemsCancelled) {
//             order.order_status = 'Cancelled';
//         }

//         await order.save();

//         res.json({ 
//             success: true, 
//             message: 'Item successfully cancelled',
//             updatedTotalPrice: order.totalPrice,
//             orderStatus: order.order_status
//         });
//     } catch (error) {
//         console.error('Error canceling order item:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Error canceling order item',
//             error: error.message 
//         });
//     }
// };




// const cancelAllOrders = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;
//         const { cancelReason } = req.body;

//         // Find the order
//         const order = await Order.findOne({ orderId: orderId });

//         if (!order) {
//             return res.status(404).json({ 
//                 success: false, 
//                 message: 'Order not found' 
//             });
//         }

//         // Check if order is already cancelled
//         if (order.order_status === 'Cancelled') {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Order is already cancelled' 
//             });
//         }

//         // Update order status to Cancelled and mark all items as cancelled
//         order.order_status = 'Cancelled';
//         order.cancelReason = cancelReason || 'Customer request';
        
//         // Update all items to cancelled status
//         order.items.forEach(item => {
//             item.status = 'Cancelled';
//         });

//         // Return items to stock
//         for (const item of order.items) {
//             await Product.findByIdAndUpdate(item.productId, {
//                 $inc: { stock: item.quantity }
//             });
//         }

//         // Set total price to 0
//         order.totalPrice = 0;

//         // Save the updated order
//         await order.save();

//         res.json({ 
//             success: true, 
//             message: 'Order successfully cancelled'
//         });
//     } catch (error) {
//         console.error('Error canceling entire order:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Error canceling order',
//             error: error.message 
//         });
//     }
// };






const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        const item = order.items.find(item => 
            item._id.toString() === itemId
        );

        if (!item) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found in the order' 
            });
        }

        // Only update stock if item wasn't already cancelled
        if (item.status !== 'Cancelled') {
            // Update quantity instead of stock
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: item.quantity }
            });
            
            // Update item status
            item.status = 'Cancelled';
            
            // Recalculate total price
            order.totalPrice = order.items.reduce((total, item) => {
                return item.status !== 'Cancelled' ? total + (item.quantity * item.price) : total;
            }, 0);

            // Check if all items are cancelled
            const allItemsCancelled = order.items.every(item => item.status === 'Cancelled');
            if (allItemsCancelled) {
                order.order_status = 'Cancelled';
            }

            await order.save();
        }

        res.json({ 
            success: true, 
            message: 'Item successfully cancelled',
            updatedTotalPrice: order.totalPrice,
            orderStatus: order.order_status
        });
    } catch (error) {
        console.error('Error canceling order item:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error canceling order item',
            error: error.message 
        });
    }
};

const cancelAllOrders = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { cancelReason } = req.body;

        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        if (order.order_status === 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order is already cancelled' 
            });
        }

        // Return items to stock only if they weren't already cancelled
        for (const item of order.items) {
            if (item.status !== 'Cancelled') {
                await Product.findByIdAndUpdate(item.productId, {
                    $inc: { quantity: item.quantity }
                });
                item.status = 'Cancelled';
            }
        }

        order.order_status = 'Cancelled';
        order.cancelReason = cancelReason || 'Customer request';
        order.totalPrice = 0;

        await order.save();

        res.json({ 
            success: true, 
            message: 'Order successfully cancelled'
        });
    } catch (error) {
        console.error('Error canceling entire order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error canceling order',
            error: error.message 
        });
    }
};



//return order

const returnOrderItem = async (req, res) => {
    try {
        const itemId = req.params.itemId;

        // Find the order and populate product information
        const order = await Order.findOne({ "items._id": itemId })
            .populate('items.productId');
            
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Find the specific item in the order
        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const item = order.items[itemIndex];

        // Check if item is already returned
        if (item.status === 'Returned') {
            return res.status(400).json({ success: false, message: 'Item is already returned' });
        }

        // Update item status to Returned
        item.status = 'Returned';

        // Find and update product quantity
        const product = await Product.findById(item.productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Increment the product quantity
        product.quantity += item.quantity;

        // Update product availability status if needed
        if (product.status === 'Out Of Stock' && product.quantity > 0) {
            product.status = 'Available';
        }

        // Save both order and product changes
        try {
            await Promise.all([
                order.save({ validateBeforeSave: true }),
                product.save()
            ]);
        } catch (saveError) {
            console.error('Save Error:', saveError);
            return res.status(500).json({ 
                success: false, 
                message: 'Error saving changes',
                error: saveError.message 
            });
        }

        res.json({ 
            success: true, 
            message: 'Item returned successfully',
            newQuantity: product.quantity
        });

    } catch (error) {
        console.error('Error returning item:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to return item',
            error: error.message 
        });
    }
};




module.exports={
    getOrderPage,
    getOrderSummary,
    cancelOrderItem,
    cancelAllOrders,
    returnOrderItem

}