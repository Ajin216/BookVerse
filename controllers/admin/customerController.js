
const User = require("../../models/userScheme");

const customerInfo = async (req, res) => {
    try {
        let search = "";
        if (req.query.search) {
            search = req.query.search;
        }

        let page = 1;
        if (req.query.page) {
            page = parseInt(req.query.page); // Ensure page is an integer
        }

        const limit = 5;

        // Fetch user data based on search query and pagination
        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } }, // Added case-insensitive option
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();

        // Count total documents matching the search query
        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        });

        const totalPages = Math.ceil(count / limit); // Calculate total pages

        // Render the customers view with user data and pagination info
        res.render("customers", {
            data: userData,        // Pass the user data
            totalPages: totalPages, // Pass total pages for pagination
            currentPage: page       // Pass current page
        });
    } catch (error) {
        console.error(error); // Log the error for debugging
        res.status(500).send('Server Error'); // Send an error response
    }
};


const customerBlocked=async(req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id: id},{ $set:{isBlocked:true}});
        res.redirect("/admin/customers");
    } catch (error) {
        res.redirect("/pageerror")
        
    }  
};

const customerUnblocked=async(req,res)=>{
    try {
        let id=req.query.id;
        await User.updateOne({_id: id},{ $set:{isBlocked:false}});
        res.redirect("/admin/customers");
    } catch (error) {
        res.redirect("/pageerror")
        
    }  
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked
};
