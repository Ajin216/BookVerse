// const mongoose = require('mongoose');
const env=require("dotenv").config();
const db=require("./config/db");
db()


let port=process.env.PORT 
const express=require("express");
const app=express();




app.listen(port,()=>{
    console.log(`Server is Running at http://localhost:${port}`);
})
