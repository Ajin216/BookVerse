const User = require("../models/userScheme");





//to check a user is loggedin and not blocked
const userAuth = (req, res, next) => {
    if (req.session.user) {
        //User.findById to look up the user in the database 
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    //go to next operation in router near userAuth
                    next();
                } else {
                    // User is blocked, redirect to login page
                    return res.redirect("/login");
                }
            })
            .catch(error => {
                console.log("Error in user auth middleware");
                res.status(500).send("Internal Server Error");
            });
    } else {
        return res.redirect("/login");
    }
};





//already login user cant access  login or registration page 
const userAuthOut = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    return res.redirect("/")
                } else {
                   next();
                }
            })
            .catch(error => {
                console.log("Error in user auth middleware");
                res.status(500).send("Internal Server Error")
            })
    } else {
       next();
    }
}




const adminAuth = (req, res, next) => {
    if(req.session.admin){
        User.findOne({ isAdmin: true })
        .then(data => {
            if (data) {
                next();
            } else {
                res.redirect("/admin/login")
            }
        })
        .catch(error => {
            console.log("Error in adminauth middleware", error);
            res.status(500).send("internalServer Error")
        })
    }else{
       return res.redirect("/admin/login")
    }
    
}

module.exports = {
    userAuth,
    adminAuth,
    userAuthOut

}



