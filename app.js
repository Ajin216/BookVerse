const env=require("dotenv").config();
const express=require("express");
const session=require("express-session");
const app=express();
const path=require("path");
const passport=require("./config/passport")
let port=process.env.PORT 
const db=require("./config/db");
const userRouter=require("./routes/userRouter");
const adminRouter=require("./routes/adminRouter")
db()


app.use(express.json());
app.use(express.urlencoded({extended:true}))


//session() Middleware: Manages user sessions (e.g., storing session data in memory or a database).

app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))

app.use(passport.initialize());
app.use(passport.session());


app.set("view engine","ejs");
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/assets',express.static(path.join(__dirname, './public/user/assets')))
app.use('/dashboard-assets', express.static(path.join(__dirname, './public/admin/dashboard-assets')));

app.use("/",userRouter)
app.use("/admin",adminRouter)



app.listen(port,()=>{
    console.log(`Server is Running at http://localhost:${port}`);
})
