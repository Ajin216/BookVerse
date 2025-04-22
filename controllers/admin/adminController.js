const User=require("../../models/userScheme");
const mongoose=require("mongoose");
const Order = require('../../models/orderSchema');
const Category=require("../../models/categorySchema");
const bcrypt=require("bcrypt");
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const loadLogin=(req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin/dashboard")
    }
    res.render("adminLogin",{message:null})
}


const login = async (req, res) => {
    try {
        //Used to receive data sent in the request body (e.g., from a POST or PUT request).Commonly used when sending JSON data or form data.
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });
        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            if (passwordMatch) {
                req.session.admin = true; // successful login
                //return used to stop and nothing want to run under return
                return res.redirect("/admin/dashboard");
            } else {
                req.session.admin = false; // Clear session on failed login
                return res.render("adminLogin", { message: "Invalid username or password" });
            }
        } else {
            req.session.admin = false; // Clear session if no admin found
            return res.render("adminLogin", { message: "Invalid username or password" });
        }
    } catch (error) {
        console.log("login error", error);
        return res.redirect("/pageerror");
    }
};




const loadDashboard = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        // Initialize filter conditions
        let filterConditions = {};
        let filterType = req.query.filter;
        let startDate = req.query.startDate;
        let endDate = req.query.endDate;


        // Current date for validation
const currentDate = new Date();
currentDate.setHours(23, 59, 59, 999); // Set to end of today

// Date validation for future dates
let dateError = null;
if (startDate || endDate) {
    const selectedStartDate = startDate ? new Date(startDate) : null;
    const selectedEndDate = endDate ? new Date(endDate) : null;
    
    // Check if either date is in the future
    if (selectedStartDate && selectedStartDate > currentDate) {
        dateError = "Start date cannot be in the future";
    } 
    // Add this check for start date after end date
    else if (selectedStartDate && selectedEndDate && selectedStartDate > selectedEndDate) {
        dateError = "End date must be after start date";
    }
    
    // If there's a date error, clear the date filter
    if (dateError) {
        startDate = null;
        endDate = null;
    }
}

        // Date-based filtering logic
        if (filterType) {
            // current date and time.
            const now = new Date();
            switch (filterType) {
                case 'daily':
                    filterConditions.createdAt = {
                        //creates a date object for the first moment of today (midnight).
                        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                        // creates a date object for midnight of the next day.
                        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
                    };
                    break;
                case 'weekly':
                    //adjusts the current date (now) to the start of the week (Sunday).
                    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(endOfWeek.getDate() + 7);
                    filterConditions.createdAt = {
                        $gte: startOfWeek,
                        $lt: endOfWeek
                    };
                    break;
                case 'monthly':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
                        $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
                    };
                    break;
                case 'yearly':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), 0, 1),
                        $lt: new Date(now.getFullYear() + 1, 0, 1)
                    };
                    break;
            }
        }

        // Custom date range filtering (only if no date error)
if (startDate && endDate && !dateError) {
    filterConditions.createdAt = {
        $gte: new Date(startDate),
        $lt: new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1))
    };
}

        // Custom date range filtering
        if (startDate && endDate) {
            filterConditions.createdAt = {
                //new Date(startDate) converts startDate (which might be a string like "2025-03-01") into a JavaScript Date object.
                $gte: new Date(startDate),
                //getDate() gets the day of the month
                //setDate modifies the Date object to move forward by one day.
                $lt: new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1))
            };
        }
        

        // Aggregate stats with filter conditions
        const stats = await Order.aggregate([
            { $match: filterConditions },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSales: { $sum: "$totalPrice" },
                    totalDiscounts: { $sum: "$discount" },
                    totalRevenue: { $sum: { $subtract: ["$totalPrice", "$discount"] } }
                }
            }
        ]);

        // Count filtered orders for pagination
        const totalOrders = await Order.countDocuments(filterConditions);
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch paginated orders with filter
        const orders = await Order.find(filterConditions)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            //In your Order model, userId is a reference to the User collection.
            //'name' means we only fetch the name field from the User collection.
            //Syntax:.populate('fieldName', 'fieldsToSelect'),('fieldName'=The field that references another collection),('fieldsToSelect'=Specify which fields to return.).
            .populate('userId', 'name');

        // === FIXED CODE FOR CHARTS AND BEST SELLING PRODUCTS/CATEGORIES ===
        
        // Determine the time granularity for the chart based on filter type
        let timeGranularity = '%Y-%m-%d'; // Default to daily
        let groupByFormat = { year: "$_id.year", month: "$_id.month", day: "$_id.day" };
        let dateFormat = '%Y-%m-%d';
        
        if (filterType === 'yearly') {
            timeGranularity = '%Y-%m';
            groupByFormat = { year: "$_id.year", month: "$_id.month" };
            dateFormat = '%Y-%m';
        } else if (filterType === 'monthly') {
            timeGranularity = '%Y-%m-%d';
            groupByFormat = { year: "$_id.year", month: "$_id.month", day: "$_id.day" };
            dateFormat = '%Y-%m-%d';
        }

        // Chart data - aggregate sales by time period
        const salesChartData = await Order.aggregate([
            { $match: filterConditions },
            {
                $project: {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                    day: { $dayOfMonth: "$createdAt" },
                    totalPrice: 1,
                    discount: { $ifNull: ["$discount", 0] }
                }
            },
            {
                $group: {
                    _id: {
                        year: "$year",
                        month: "$month",
                        day: "$day"
                    },
                    revenue: { $sum: { $subtract: ["$totalPrice", "$discount"] } },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
            {
                $project: {
                    _id: 0,
                    date: groupByFormat,
                    revenue: 1,
                    orders: 1
                }
            }
        ]);

        // Format chart data for Chart.js
        const labels = [];
        const revenueData = [];
        const ordersData = [];

        salesChartData.forEach(item => {
            // Format date based on granularity
            let dateLabel;
            if (filterType === 'yearly') {
                const month = item.date.month < 10 ? `0${item.date.month}` : item.date.month;
                dateLabel = `${item.date.year}-${month}`;
            } else {
                const month = item.date.month < 10 ? `0${item.date.month}` : item.date.month;
                const day = item.date.day < 10 ? `0${item.date.day}` : item.date.day;
                dateLabel = `${item.date.year}-${month}-${day}`;
            }
            
            labels.push(dateLabel);
            revenueData.push(Math.round(item.revenue));
            ordersData.push(item.orders);
        });

        // Ensure we have at least one data point for charts
        if (labels.length === 0) {
            const today = new Date();
            const month = (today.getMonth() + 1) < 10 ? `0${today.getMonth() + 1}` : (today.getMonth() + 1);
            const day = today.getDate() < 10 ? `0${today.getDate()}` : today.getDate();
            labels.push(`${today.getFullYear()}-${month}-${day}`);
            revenueData.push(0);
            ordersData.push(0);
        }

        // Get best selling products with category information
        // First lookup products to get their category IDs, then lookup categories
        const topProducts = await Order.aggregate([
            { $match: filterConditions },
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products", // This should match your products collection name
                    localField: "items.productId",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            {
                $lookup: {
                    from: "categories", // This should match your categories collection name
                    localField: "productInfo.category", // Use the category field from the product
                    foreignField: "_id",
                    as: "categoryInfo"
                }
            },
            {
                $addFields: {
                    categoryName: {
                        $ifNull: [
                            { $arrayElemAt: ["$categoryInfo.name", 0] },
                            "Uncategorized"
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$items.productId",
                    name: { $first: "$items.name" },
                    category: { $first: "$categoryName" },
                    unitsSold: { $sum: "$items.quantity" },
                    revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                }
            },
            { $sort: { unitsSold: -1 } },
            { $limit: 5 }
        ]);

        // Get top categories using product lookup similar to above
        const categoryChartData = await Order.aggregate([
            { $match: filterConditions },
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.productId",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "productInfo.category",
                    foreignField: "_id", 
                    as: "categoryInfo"
                }
            },
            {
                $addFields: {
                    categoryName: {
                        $ifNull: [
                            { $arrayElemAt: ["$categoryInfo.name", 0] },
                            "Uncategorized"
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$categoryName",
                    total: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 5 }
        ]);

        // Add default data if no categories found
        if (categoryChartData.length === 0) {
            categoryChartData.push({ _id: "No Data", total: 0 });
        }

        // Format category data for Chart.js
        const categoryLabels = categoryChartData.map(item => item._id);
        const categoryValues = categoryChartData.map(item => Math.round(item.total));

        // Prepare chart data objects
        const formattedSalesChartData = {
            labels: labels,
            revenue: revenueData,
            orders: ordersData
        };

        const formattedCategoryChartData = {
            labels: categoryLabels,
            data: categoryValues
        };

        // === END OF FIXED CODE ===

        const data = stats[0] || {
            totalOrders: 0,
            totalSales: 0,
            totalDiscounts: 0,
            totalRevenue: 0
        };

        // Round values and add new data to response
        const roundedData = {
            totalOrders: data.totalOrders || 0,
            totalSales: Math.round(data.totalSales) || 0,
            totalDiscounts: Math.round(data.totalDiscounts) || 0,
            totalRevenue: Math.round(data.totalRevenue) || 0,
            orders: orders,
            currentPage: page,
            totalPages: totalPages,
            filter: filterType,
            startDate,
            endDate,
            dateError: dateError, // Add this line
            // Fix chart data stringification - fix for the quotes and space issue in the script
            salesChartData: JSON.stringify(formattedSalesChartData),
            categoryChartData: JSON.stringify(formattedCategoryChartData),
            topProducts: topProducts
        };

        res.render("dashboard", roundedData);
    } catch (error) {
        console.log("Error loading dashboard:", error);
        res.redirect("/pageerror");
    }
};


const downloadPDFReport = async (req, res) => {
    try {
        // Duplicate filter conditions logic from dashboard controller
        let filterConditions = {};
        //Use req.query when data is sent in the URL
        let filterType = req.query.filter;
        let startDate = req.query.startDate;
        let endDate = req.query.endDate;

        // Date filtering logic (same as in dashboard controller)
        if (filterType) {
            const now = new Date();
            switch (filterType) {
                case 'daily':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
                    };
                    break;
                case 'weekly':
                    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(endOfWeek.getDate() + 7);
                    filterConditions.createdAt = {
                        $gte: startOfWeek,
                        $lt: endOfWeek
                    };
                    break;
                case 'monthly':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
                        $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
                    };
                    break;
                case 'yearly':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), 0, 1),
                        $lt: new Date(now.getFullYear() + 1, 0, 1)
                    };
                    break;
            }
        }

        // Custom date range filtering
        if (startDate && endDate) {
            filterConditions.createdAt = {
                $gte: new Date(startDate),
                $lt: new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1))
            };
        }

        // Fetch filtered orders
        const orders = await Order.find(filterConditions)
            .sort({ createdAt: -1 })
            .populate('userId', 'name');

        // Calculate totals
        const totalSales = orders.reduce((sum, order) => sum + order.totalPrice, 0);
        const totalDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
        const totalRevenue = totalSales - totalDiscount;

        // Create PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true // Enable buffering of pages for page numbering
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');

        // Pipe PDF to response
        doc.pipe(res);

        // Add title and date
        doc.fontSize(22).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
        doc.moveDown(0.5);
        
        // Add report period
        let periodText = "All Time";
        if (filterType) {
            periodText = `Period: ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`;
        } else if (startDate && endDate) {
            periodText = `Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`;
        }
        doc.fontSize(12).font('Helvetica').text(periodText, { align: 'center' });
        doc.moveDown(1);

        // Summary section with styled box
        doc.roundedRect(50, doc.y, doc.page.width - 100, 90, 5).fillAndStroke('#f5f5f5', '#cccccc');
        
        const summaryY = doc.y + 20;
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333').text('Summary', 70, summaryY);
        doc.moveDown(0.5);
        const summaryDataY = doc.y;
        
        doc.fontSize(10).font('Helvetica').fillColor('#000000')
            .text(`Total Orders: ${orders.length}`, 70, summaryDataY)
            .text(`Total Sales: ₹${totalSales.toFixed(2)}`, 220, summaryDataY)
            .text(`Total Discount: ₹${totalDiscount.toFixed(2)}`, 70, summaryDataY + 20)
            .text(`Total Revenue: ₹${totalRevenue.toFixed(2)}`, 220, summaryDataY + 20);
        
        doc.moveDown(5);

        // Define table structure with proper spacing
        const tableWidth = doc.page.width - 100;
        const colWidths = [tableWidth * 0.25, tableWidth * 0.25, tableWidth * 0.25, tableWidth * 0.25]; // Column widths
        const colPadding = 10; // Padding within cells
        
        // Table header with background - this will be repeated on each page
        const drawTableHeader = (y) => {
            doc.fillColor('#333333').rect(50, y, tableWidth, 25).fill();
            
            // Table header text with padding
            doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
                .text('Order ID', 50 + colPadding, y + 8, { width: colWidths[0] - (colPadding * 2) })
                .text('Date', 50 + colWidths[0] + colPadding, y + 8, { width: colWidths[1] - (colPadding * 2) })
                .text('Total Price (₹)', 50 + (colWidths[0] + colWidths[1]) + colPadding, y + 8, { width: colWidths[2] - (colPadding * 2) })
                .text('Discount (₹)', 50 + (colWidths[0] + colWidths[1] + colWidths[2]) + colPadding, y + 8, { width: colWidths[3] - (colPadding * 2) });
            
            return y + 25;
        };

        // Draw initial table header
        let rowY = drawTableHeader(doc.y + 10);
        const rowHeight = 25; // Row height for better spacing
        let alternate = false;

        // Add orders with alternating row colors and proper pagination
        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            
            // Check if we need a new page
            if (rowY + rowHeight > doc.page.height - 50) {
                doc.addPage();
                rowY = 50; // Reset Y position on new page
                alternate = false;
                rowY = drawTableHeader(rowY); // Add header on new page
            }

            // Add alternating background for rows
            if (alternate) {
                doc.fillColor('#f9f9f9').rect(50, rowY, tableWidth, rowHeight).fill();
            }
            alternate = !alternate;
            
            // Draw cell borders
            doc.strokeColor('#dddddd');
            doc.lineWidth(0.5);
            
            // Horizontal lines
            doc.moveTo(50, rowY).lineTo(50 + tableWidth, rowY).stroke();
            doc.moveTo(50, rowY + rowHeight).lineTo(50 + tableWidth, rowY + rowHeight).stroke();
            
            // Vertical lines
            let xPos = 50;
            for (let j = 0; j <= colWidths.length; j++) {
                doc.moveTo(xPos, rowY).lineTo(xPos, rowY + rowHeight).stroke();
                if (j < colWidths.length) {
                    xPos += colWidths[j];
                }
            }
            
            // Cell content with proper padding
            doc.fillColor('#000000').fontSize(9).font('Helvetica')
                .text(order.orderId, 50 + colPadding, rowY + 8, { width: colWidths[0] - (colPadding * 2) })
                .text(order.createdAt.toLocaleDateString(), 50 + colWidths[0] + colPadding, rowY + 8, { width: colWidths[1] - (colPadding * 2) })
                .text(order.totalPrice.toFixed(2), 50 + (colWidths[0] + colWidths[1]) + colPadding, rowY + 8, { width: colWidths[2] - (colPadding * 2) })
                .text((order.discount || 0).toFixed(2), 50 + (colWidths[0] + colWidths[1] + colWidths[2]) + colPadding, rowY + 8, { width: colWidths[3] - (colPadding * 2) });
            
            rowY += rowHeight;
        }

        // Add page numbers to each page
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).fillColor('#777777').text(
                `Page ${i + 1} of ${totalPages}`, 
                0, 
                doc.page.height - 30, 
                { align: 'center' }
            );
        }

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.log("PDF download error:", error);
        res.status(500).send("Error generating PDF");
    }
};


const downloadExcelReport = async (req, res) => {
    try {
        // Initialize filter conditions
        let filterConditions = {};
        let filterType = req.query.filter;
        let startDate = req.query.startDate;
        let endDate = req.query.endDate;

        // Date-based filtering logic
        if (filterType) {
            const now = new Date();
            switch (filterType) {
                case 'daily':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
                    };
                    break;
                case 'weekly':
                    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(endOfWeek.getDate() + 7);
                    filterConditions.createdAt = {
                        $gte: startOfWeek,
                        $lt: endOfWeek
                    };
                    break;
                case 'monthly':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
                        $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
                    };
                    break;
                case 'yearly':
                    filterConditions.createdAt = {
                        $gte: new Date(now.getFullYear(), 0, 1),
                        $lt: new Date(now.getFullYear() + 1, 0, 1)
                    };
                    break;
            }
        }

        // Custom date range filtering
        if (startDate && endDate) {
            filterConditions.createdAt = {
                $gte: new Date(startDate),
                $lt: new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1))
            };
        }

        // Fetch filtered orders
        const orders = await Order.find(filterConditions)
            .sort({ createdAt: -1 })
            .populate('userId', 'name');

        // Calculate totals
        const totalSales = orders.reduce((sum, order) => sum + order.totalPrice, 0);
        const totalDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
        const totalRevenue = totalSales - totalDiscount;

        // Prepare Excel data
        const worksheet = XLSX.utils.json_to_sheet(orders.map(order => ({
            'Order ID': order.orderId,
            'Date': order.createdAt.toLocaleDateString(),
            'Total Price': order.totalPrice,
            'Discount': order.discount || 0
        })));

        // Add summary rows
        XLSX.utils.sheet_add_aoa(worksheet, [
            ['Total Sales', totalSales.toFixed(2)],
            ['Total Discount', totalDiscount.toFixed(2)],
            ['Total Revenue', totalRevenue.toFixed(2)]
        ], { origin: -1 });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Report');

        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(excelBuffer);

    } catch (error) {
        console.log("Excel download error:", error);
        res.status(500).send("Error generating Excel");
    }
};



const pageerror=async(req,res)=>{
    res.render("admin-error")
}




const logout=async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session",err);
                
            }
            return res.redirect("/admin/login")
        })
    } catch (error) {
        console.log("unexpected error during logout",error);
        res.redirect("/pageerror")
        
    }
}

module.exports={
    loadLogin,
    login,
    loadDashboard,
    downloadPDFReport,
    downloadExcelReport,
    pageerror,
    logout
}