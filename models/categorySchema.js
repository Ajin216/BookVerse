const mongoose=require("mongoose");
const {Schema}=mongoose;

const categorySchema=new mongoose.Schema({
    name:{
        type:String,
        required:true,
        unique:true
    },
    description:{
        type:String,
        required:true
    },
    isListed:{
        type:Boolean,
        default:true
    },
    categoryOffer:{
        type:Number,
        default:0
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
        status: {  // Add this field for status
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
})


const Category=mongoose.model("Category",categorySchema);

module.exports=Category;




