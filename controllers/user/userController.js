const User=require("../../models/userScheme");
const Category=require("../../models/categorySchema");
const Product=require("../../models/productSchema");
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
        const productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            // quantity: { $gt: 0 }
        }).sort({ createdOn: -1 });

        if (user) {
            const userData = await User.findOne({ _id: user });
            if (!userData.isBlocked) {
                res.render("home", { user: userData, products: productData });
            } else {
                // User is blocked, redirect to login page
                return res.redirect("/login");
            }
        } else {
            res.render("home", { products: productData });
        }
    } catch (error) {
        console.log("Home page not found");
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
                password:passwordHash
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
        
        // Extract query parameters for filtering and sorting
        const { 
            category = '', 
            sortBy = 'createdAt-desc', 
            minPrice = 0, 
            maxPrice = 1000000,
            q = '' // Add search query parameter
        } = req.query;

        // Build query conditions
        const query = {
            isBlocked: false,
            salePrice: { 
                $gte: parseFloat(minPrice || 0), 
                $lte: parseFloat(maxPrice || 1000000) 
            }
        };

        // Fetch categories
        const categories = await Category.find({ isListed: true, status: "active" });
        
        // Category filter logic
        if (category) {
            const selectedCategory = await Category.findOne({ name: category, isListed: true });
            if (selectedCategory) {
                query.category = selectedCategory._id;
            }
        } else {
            query.category = { $in: categories.map(cat => cat._id) };
        }

        // Search logic
        if (q) {
            query.$or = [
                { productName: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } }
            ];
        }

        // Sorting logic
        const sortMapping = {
            'createdAt-desc': { createdAt: -1 },
            'price-asc': { salePrice: 1 },
            'price-desc': { salePrice: -1 },
            'name-asc': { productName: 1 },
            'name-desc': { productName: -1 }
        };

        // Get sort configuration
        const sort = sortMapping[sortBy] || { createdAt: -1 };

        // Fetch products with sorting and filtering
        const productData = await Product.find(query)
            .populate('category')
            .sort(sort);

        // Prepare view data
        const viewData = {
            products: productData,
            categories: categories,
            selectedCategory: category,
            sortBy: sortBy,
            minPrice: parseFloat(minPrice || 0),
            maxPrice: parseFloat(maxPrice || 1000000),
            searchQuery: q // Pass search query to the view
        };

        // Add user data if logged in
        if (user) {
            const userData = await User.findOne({ _id: user });
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

        // Get the current product with category details
        const product = await Product.findById(productId).populate('category');

        if (!product) {
            return res.status(404).send('Product not found');
        }

        // Find related products from the same category
        const relatedProducts = await Product.find({
            category: product.category._id,  // Same category
            _id: { $ne: productId }         // Exclude current product
        })
        .populate('category')
        .limit(4);  // Limit to 4 related products

        // Pass both product and related products data to the view
        res.render('productDetails', { 
            product,
            relatedProducts
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).send('Server error');
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