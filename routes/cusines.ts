import express from 'express';
import {initializeRedisClient} from '../utils/client.js';
import {cuisineKey, cuisinesKey} from '../utils/keys.js';

const router= express.Router();


router.get("/",async(req,res,next)=>{
    try{
        const client=await initializeRedisClient();
        const cuisines=await client.sMembers(cuisinesKey);
        return res.status(200).json({
            success:true,
            data:cuisines,
            message:"Fetched all cuisines"
        });
    }catch(error){
        next(error);
    }
});

router.get("/:cuisine",async(req,res,next)=>{
    const {cuisine}=req.params;
    try{
        const client=await initializeRedisClient(); 
        const restaurentIds= await client.sMembers(cuisineKey(cuisine));
        const restaurents= await Promise.all(
            restaurentIds.map(async(id)=>{
                const restaurantKey=`restaurant:${id}`;
                return await client.hGetAll(restaurantKey);
            })
        );
    }catch(error){
        next(error);
    }
});

export default router;