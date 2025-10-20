import express from 'express';
import {initializeRedisClient} from '../utils/client.js';
import {restaurantKeyById} from '../utils/keys.js';
import { errorResponse } from '../utils/responses.js';

export const checkRestaurantExists=async(req:express.Request,res:express.Response,next:express.NextFunction)=>{

    const {restaurantId}=req.params;
    if(!restaurantId){
        return errorResponse(res,400,"Restaurant ID is required");
    }
    const client= await initializeRedisClient();
    const restaurantKey=restaurantKeyById(restaurantId);
    const exists=await client.exists(restaurantKey);
    if(!exists){
        return errorResponse(res,404,"Restaurant not found");
    }
    next();
}
