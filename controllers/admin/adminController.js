const User=require("../../models/userScheme");
const mongoose=require("mongoose");
const bcrypt=require("bcrypt");

const loadLogin=(req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin")
    }
    res.render("adminLogin",{message:null})
}


const login = async (req, res) => {
    try {
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
                return res.redirect("/admin/login");
            }
        } else {
            req.session.admin = false; // Clear session if no admin found
            return res.redirect("/admin/login");
        }
    } catch (error) {
        console.log("login error", error);
        return res.redirect("/pageerror");
    }
};



const loadDashboard = (req, res) => {
    if (req.session.admin) {
        try {
            res.render("dashboard");
            
        } catch (error) {
            res.redirect("/pageerror");
        }
    } else {
        res.redirect("/admin/login");
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
    pageerror,
    logout
}