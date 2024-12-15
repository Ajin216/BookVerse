const mongoose=require("mongoose");
const {Schema}=mongoose;

const bannerSchema=new Schema({
    image:{
        type:String,
        requires:true
    },
    title:{
        type:String,
        required:true
    },
    description:{
        type:String,
        required:true
    },
    link:{
        type:String
    },
    startDate:{
        type:Date,
        required:true
    },
    endDate:{
        type:Date,
        required:true
    }
})

const Banner=mongoose.Model("Banner",bannerSchema);

module.exports=Banner;