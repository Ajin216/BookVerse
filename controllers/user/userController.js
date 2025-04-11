const User=require("../../models/userScheme");
const Category=require("../../models/categorySchema");
const Product=require("../../models/productSchema");
const Offer = require('../../models/offerSchema');
const env=require("dotenv").config();
const nodemailer=require("nodemailer");
const bcrypt=require("bcrypt");
const e = require("express");

const pageNotFound=async (req,res)=>{
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}



const loadHomepage = async (req, res) => {
    try {
        const user = req.session.user;
        const categories = await Category.find({ isListed: true, status: "active" });
        
        // Get only active offers that haven't expired
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active', // Using status field from your schema
            validTill: { $gt: currentDate } // Not expired
        });

        // Fetch products with category information
        let productData = await Product.find({
            isBlocked: false,
            // This creates an array of _ids of categories in category collection.
            //The $in operator in MongoDB checks if a field matches any value inside the provided array.
            category: { $in: categories.map(category => category._id) },
        })
        .populate('category')
        .sort({ createdOn: -1 })
        //.lean() converts Mongoose documents into plain JavaScript objects.
        .lean();

        // Add offer information to each product
        productData = productData.map(product => {
            let bestDiscount = 0;

            // Check category offers
            const categoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                //.some(cat => ...) checks if at least one category in the offer matches the product's category.
                offer.category.some(cat => cat.toString() === product.category._id.toString())
            );

            if (categoryOffers.length > 0) {
                const maxCategoryDiscount = Math.max(...categoryOffers.map(o => o.discount));
                bestDiscount = maxCategoryDiscount;
            }

            // Check product-specific offers
            const productOffers = activeOffers.filter(offer => 
                offer.type === 'product' && 
                // .some() ensures we only pick offers relevant to the current product.
                offer.products.some(p => p.toString() === product._id.toString())
            );

            if (productOffers.length > 0) {
                const maxProductDiscount = Math.max(...productOffers.map(o => o.discount));
                bestDiscount = Math.max(bestDiscount, maxProductDiscount);
            }

            // Only add discount information if there's an active discount
            if (bestDiscount > 0) {
                const discountAmount = (product.regularPrice * (bestDiscount/100));
                product.discountedPrice = Math.round(product.regularPrice - discountAmount);
                product.bestDiscount = bestDiscount;
            }

            return product;
        });

        if (user) {
            const userData = await User.findOne({ _id: user });
            if (!userData.isBlocked) {
                res.render("home", { 
                    user: userData, 
                    products: productData
                });
            } else {
                return res.redirect("/login");
            }
        } else {
            res.render("home", { 
                products: productData 
            });
        }
    } catch (error) {
        console.log("Error loading home page:", error);
        res.status(500).send("Server error");
    }
};




const loadLogin = async(req,res)=>{
    try {
        res.render("userLogin")
    } catch (error) {
        console.log("Home page not found");
        res.status(500).send("Server error")
    }
}

const loadRegister = async (req,res)=>{
    try {
        res.render('userSignup')
    } catch (error) {
        console.log("error",error);
        res.status(500).send("Server error")
    }
}
//helper function
function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

async function sendVerificationEmail(email,otp){
    try {
        const transporter=nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const info=await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Varify your Account",
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP:${otp}</b>`,
        })
        return info.accepted.length>0

    } catch (error) {
        console.error("Error sending email",error); 
        return false;
    }
}

const signup= async (req,res)=>{
    try {
        const {name,email,phone,password,cPassword}=req.body;
        if(password !== cPassword){
            return res.render("userSignup",{message:"Password not match"});
        }

        const findUser=await User.findOne({email});
        if(findUser){
            return res.render("userSignup",{message:"User with this email already exists"})
        }

        const otp=generateOtp();

        const emailSend=await sendVerificationEmail(email,otp);
        if(!emailSend){
            return res.json("email-error")
        }
        //Stores OTP and user data in session so it can be used later for verification.
        req.session.userOtp=otp;
        req.session.userData={name,email,phone,password};

        res.render("verify-otp");
        console.log("OTP Send",otp);

    } catch (error) {
        console.error("signup error",error);
        res.redirect("/pageNotFound")
    }
   
}

const securePassword = async (password) => { 
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error("Error hashing password", error);
        throw error; 
    }
};


const verifyOtp=async(req,res)=>{
    try {
        const {otp}=req.body;
        console.log(otp);

        if(otp===req.session.userOtp){ 
            const user=req.session.userData
            const passwordHash=await securePassword(user.password)

            const saveUserData=new User({
                name:user.name,
                email:user.email,
                phone:user.phone,
                password:passwordHash,
                
            })
            console.log(saveUserData);

            await saveUserData.save();
            req.session.user=saveUserData._id;
            res.json({success:true,redirectUrl:"/"})
        }else{
            res.status(400).json({success:false,message:"Invalid OTP, Please try again"})
        }
    } catch (error) {
        console.error("Error Verifying OTP",error);
        res.status(500).json({success:false,message:"An error occured"})
    }
}

const resendOtp=async(req,res)=>{
    try {
        const {email}=req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }

        const otp=generateOtp();
        req.session.userOtp=otp;

        const emailSend=await sendVerificationEmail(email,otp);
        if(emailSend){
            console.log("Resend OTP",otp);
            res.status(200).json({success:true,message:"OTP Resend Successfully"})
        }else{
            console.error("Error resending OTP",error)
            res.status(500).json({success:false,message:"Internal Server Error.Please try again"})
        }
    } catch (error) {
        
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render("userLogin", { message: "Email and password are required" });
        }

        const findUser = await User.findOne({ email: email });

        if (!findUser) {
            return res.render("userLogin", { message: "User not found" });
        }

        if (findUser.isBlocked) {
            return res.render("userLogin", { message: "User is blocked by Admin" });
        }

        if (!findUser.password) {
            return res.render("userLogin", { message: "Password not set for this user" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render("userLogin", { message: "Incorrect Password" });
        }

        req.session.user = findUser._id;
        console.log(req.session.user);
        return res.redirect("/");

    } catch (error) {
        console.error("Login error", error);
        res.render("userLogin", { message: "Login failed. Please try again later" });
    }
};


const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log("Session destruction error", err.message);
                return res.redirect("/pageNotFound");
            }
            return res.redirect("/login");
        });
    } catch (error) {
        console.log("Logout error", error);
        res.redirect("/pageNotFound");
    }
};





const getShopPage = async (req, res) => {
    try {
        const user = req.session.user;
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;
        
        const { 
            category = '', 
            sortBy = 'createdAt-desc', 
            minPrice = 0, 
            maxPrice = 1000000,
            q = ''
        } = req.query;

        // Get current date for offer validation
        const currentDate = new Date();

        // Fetch active offers
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Build base query
        const query = {
            isBlocked: false,
            regularPrice: { 
                $gte: parseFloat(minPrice || 0), 
                $lte: parseFloat(maxPrice || 1000000) 
            }
        };

        // Fetch categories
        const categories = await Category.find({ isListed: true });

        // Enhanced ordered search logic
        if (q.trim()) {
            const searchTerm = q.trim();
            const orderedPattern = searchTerm.split('').map(char => {
                const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return `${escapedChar}.*?`;
            }).join('');
            
            query.productName = new RegExp(orderedPattern, 'i');
        }

        // Category filter
        if (category) {
            const selectedCategory = await Category.findOne({ name: category, isListed: true });
            if (selectedCategory) {
                query.category = selectedCategory._id;
            }
        }

        // Sorting configuration
        const sortMapping = {
            'createdAt-desc': { createdAt: -1 },
            'price-asc': { regularPrice: 1 },
            'price-desc': { regularPrice: -1 },
            'name-asc': { productName: 1 },
            'name-desc': { productName: -1 }
        };
        const sort = sortMapping[sortBy] || { createdAt: -1 };

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Fetch products
        let products = await Product.find(query)
            .populate('category')
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(); // Using lean() for better performance

        // Calculate best offer for each product
        products = products.map(product => {
            let bestDiscount = 0;

            // Check category offers
            const categoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                offer.category.some(cat => cat.toString() === product.category._id.toString())
            );

            if (categoryOffers.length > 0) {
                const maxCategoryDiscount = Math.max(...categoryOffers.map(o => o.discount));
                bestDiscount = maxCategoryDiscount;
            }

            // Check product-specific offers
            const productOffers = activeOffers.filter(offer => 
                offer.type === 'product' && 
                offer.products.some(p => p.toString() === product._id.toString())
            );

            if (productOffers.length > 0) {
                const maxProductDiscount = Math.max(...productOffers.map(o => o.discount));
                bestDiscount = Math.max(bestDiscount, maxProductDiscount);
            }

            // Calculate discounted price if there's an active discount
            if (bestDiscount > 0) {
                const discountAmount = (product.regularPrice * (bestDiscount/100));
                product.discountedPrice = Math.round(product.regularPrice - discountAmount);
                product.bestDiscount = bestDiscount;
            }

            return product;
        });

        // Prepare view data
        const viewData = {
            products,
            categories,
            selectedCategory: category,
            sortBy,
            minPrice: parseFloat(minPrice || 0),
            maxPrice: parseFloat(maxPrice || 1000000),
            searchQuery: q,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            paginationUrl: (pageNum) => {
                const params = new URLSearchParams(req.query);
                params.set('page', pageNum);
                return `?${params.toString()}`;
            }
        };

        if (user) {
            const userData = await User.findById(user);
            viewData.user = userData;
        }

        res.render("shop", viewData);

    } catch (error) {
        console.error("Shop page error:", error);
        res.status(500).send("Server error");
        
    }
};




const getProductDetails = async (req, res) => {
    try {
        const productId = req.params.productId;
        const currentDate = new Date();

        // Get the current product with category details
        const product = await Product.findById(productId).populate('category').lean();

        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Fetch active offers
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Calculate best offer for the product
        let bestDiscount = 0;

        // Check category offers
        const categoryOffers = activeOffers.filter(offer => 
            offer.type === 'category' && 
            offer.category.some(cat => cat.toString() === product.category._id.toString())
        );

        if (categoryOffers.length > 0) {
            const maxCategoryDiscount = Math.max(...categoryOffers.map(o => o.discount));
            bestDiscount = maxCategoryDiscount;
        }

        // Check product-specific offers
        const productOffers = activeOffers.filter(offer => 
            offer.type === 'product' && 
            offer.products.some(p => p.toString() === product._id.toString())
        );

        if (productOffers.length > 0) {
            const maxProductDiscount = Math.max(...productOffers.map(o => o.discount));
            bestDiscount = Math.max(bestDiscount, maxProductDiscount);
        }

        // Calculate discounted price if there's an active discount
        if (bestDiscount > 0) {
            const discountAmount = (product.regularPrice * (bestDiscount/100));
            product.discountedPrice = Math.round(product.regularPrice - discountAmount);
            product.bestDiscount = bestDiscount;
        }

        // Find related products from the same category
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId }
        })
        .populate('category')
        .limit(4)
        .lean();

        // Calculate offers for related products
        const relatedProductsWithOffers = relatedProducts.map(relatedProduct => {
            let bestRelatedDiscount = 0;

            // Check category offers for related product
            const relatedCategoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                offer.category.some(cat => cat.toString() === relatedProduct.category._id.toString())
            );

            if (relatedCategoryOffers.length > 0) {
                const maxCategoryDiscount = Math.max(...relatedCategoryOffers.map(o => o.discount));
                bestRelatedDiscount = maxCategoryDiscount;
            }

            // Check product-specific offers for related product
            const relatedProductOffers = activeOffers.filter(offer => 
                offer.type === 'product' && 
                offer.products.some(p => p.toString() === relatedProduct._id.toString())
            );

            if (relatedProductOffers.length > 0) {
                const maxProductDiscount = Math.max(...relatedProductOffers.map(o => o.discount));
                bestRelatedDiscount = Math.max(bestRelatedDiscount, maxProductDiscount);
            }

            if (bestRelatedDiscount > 0) {
                const discountAmount = (relatedProduct.regularPrice * (bestRelatedDiscount/100));
                relatedProduct.discountedPrice = Math.round(relatedProduct.regularPrice - discountAmount);
                relatedProduct.bestDiscount = bestRelatedDiscount;
            }

            return relatedProduct;
        });

        // Pass product and related products data to the view
        res.render('productDetails', { 
            product,
            relatedProducts: relatedProductsWithOffers
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        // res.status(500).send('Server error');
        res.render("page-404")
    }
};


//Forgot Password

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("forgotPassword", { 
                message: "No account found with this email address" 
            });
        }

        // Generate OTP
        const otp = generateOtp();
        console.log(otp);

        // Store OTP in session with expiry
        req.session.resetPasswordOtp = {
            email: email,
            otp: otp,
            createdAt: Date.now()
        };

        // Send OTP via email
        const emailSent = await sendVerificationEmail(email, otp);
        
        if (emailSent) {
            // Render OTP verification page
            return res.render("verifyResetOtp", { email });
        } else {
            return res.render("forgotPassword", { 
                message: "Failed to send OTP. Please try again." 
            });
        }
    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).render("forgotPassword", { 
            message: "Server error. Please try again later." 
        });
    }
};



const verifyResetOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const sessionOtp = req.session.resetPasswordOtp;

        // Check if OTP session exists and is valid
        if (!sessionOtp || 
            otp !== sessionOtp.otp || 
            (Date.now() - sessionOtp.createdAt > 1 * 60 * 1000)) {  // 10 minutes expiry
            return res.render("verifyResetOtp", { 
                email: sessionOtp?.email, 
                message: "Invalid or expired OTP" 
            });
        }

        // Render new password page
        res.render("resetPassword", { email: sessionOtp.email });
    } catch (error) {
        console.error("OTP Verification Error:", error);
        res.status(500).render("verifyResetOtp", { 
            message: "Server error. Please try again." 
        });
    }
};



const resetPassword = async (req, res) => {
    try {
        const { email, newPassword, confirmPassword } = req.body;

        // Validate passwords
        if (newPassword !== confirmPassword) {
            return res.render("resetPassword", { 
                email, 
                message: "Passwords do not match" 
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("resetPassword", { 
                message: "User not found" 
            });
        }

        // Hash new password
        const hashedPassword = await securePassword(newPassword);

        // Update user password
        user.password = hashedPassword;
        await user.save();

        // Clear reset password session
        delete req.session.resetPasswordOtp;

        // Redirect to login with success message
        res.render("userLogin", { 
            message: "Password reset successfully. Please login." 
        });
    } catch (error) {
        console.error("Password Reset Error:", error);
        res.status(500).render("resetPassword", { 
            message: "Server error. Please try again." 
        });
    }
};



const resendResetOtp = async (req, res) => {
    try {
        const { email } = req.body;
        
        // Generate new OTP
        const otp = generateOtp();
        console.log(otp);

        // Update session with new OTP
        req.session.resetPasswordOtp = {
            email: email,
            otp: otp,
            createdAt: Date.now()
        };

        // Send new OTP
        const emailSent = await sendVerificationEmail(email, otp);
        
        if (emailSent) {
            return res.json({ 
                success: true, 
                message: "New OTP sent successfully" 
            });
        } else {
            return res.status(500).json({ 
                success: false, 
                message: "Failed to send OTP" 
            });
        }
    } catch (error) {
        console.error("Resend Reset OTP Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error" 
        });
    }
};



module.exports={
    loadHomepage,
    loadLogin,
    pageNotFound,
    loadRegister,
    signup,
    verifyOtp,
    resendOtp,
    login,
    logout,
    getShopPage,
    getProductDetails,
    forgotPassword,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    resendResetOtp
} 