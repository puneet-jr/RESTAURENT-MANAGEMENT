import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../middlewares/validate.js';
import { RestaurantSchema, type Restaurant } from '../schemas/restaurents.js';
import { initializeRedisClient } from '../utils/client.js';
import { restaurantKeyById,reviewKeyById,reviewDetailsKeyById } from '../utils/keys.js';
import { successResponse } from '../utils/responses.js';
import { nanoid } from 'nanoid';
import { checkRestaurantExists } from '../middlewares/checkRestaurantId.js';
import { ReviewSchema } from '../schemas/review.js';
import { cuisinesKey, cuisineKey, restaurantCuisinesKeyById } from '../utils/keys.js';
import { errorResponse } from '../utils/responses.js';
import { restaurentsByRatingKey } from '../utils/keys.js';

const router = express.Router();


router.get("/", async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1; // ✅ Fix 1: ZRANGE is inclusive, so end should be -1
    
    try {
        const client = await initializeRedisClient();
        
       // Added REV: true to get highest-rated restaurants first
        const restaurantIds = await client.zRange(
            restaurentsByRatingKey, 
            start, 
            end,
            { REV: true } // Descending order (highest rating first)
        );

        //  Fetch both restaurant data AND cuisines
        const restaurants = await Promise.all(
            restaurantIds.map(async (id) => {
                const [restaurant, cuisines] = await Promise.all([
                    client.hGetAll(restaurantKeyById(id)),
                    client.sMembers(restaurantCuisinesKeyById(id))
                ]);
                
                // Parse numeric fields and add cuisines
                return {
                    ...restaurant,
                    cuisines,
                    viewCount: Number(restaurant.viewCount || 0),
                    averageRating: Number(restaurant.averageRating || 0),
                    totalReviews: Number(restaurant.totalReviews || 0)
                };
            })
        );

        return successResponse(
            res, 
            {
                restaurants,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: restaurants.length
                }
            },
            "Fetched restaurants successfully"
        );
    } catch (error) {
        next(error);
    }
});

router.post("/", validate(RestaurantSchema), async (req, res, next) => {
  const data = req.body as Restaurant;
  try {
    const client = await initializeRedisClient();
    const id = nanoid();
    const restaurantKey = restaurantKeyById(id);
    
    const hashData = { id, name: data.name, location: data.location };
    
    await Promise.all([
        ...data.cuisines.map(cuisine=>
            Promise.all([
                client.sAdd(cuisinesKey, cuisine),                    // "cuisines" → {"Italian", "Mexican", ...}
                client.sAdd(cuisineKey(cuisine), id),                // "cuisine:Italian" → {id1, id2, id3}
                client.sAdd(restaurantCuisinesKeyById(id), cuisine), // "restaurant:123:cuisines" → {"Italian", "Pizza"}
            ])
        ),
        client.hSet(restaurantKey, hashData),
        client.zAdd(restaurentsByRatingKey, {score:0,value:id}) // Initial rating is 0
    ])

     
    return successResponse(res, hashData, "Added new restaurant");
  } catch (error) {
    next(error);
  }
});


// GET restaurant details with view count
router.get("/:restaurantId", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;
    
    try {
        const client = await initializeRedisClient();
        const restaurantKey = restaurantKeyById(restaurantId);

        // Promise.all() runs both Redis operations in parallel instead of waiting for each to finish
        // This cuts response time in half (~10ms vs ~20ms)
        const [viewCount, restaurant, cuisines] = await Promise.all([
            // 1. Atomically increment viewCount by 1 and return the NEW count
            client.hIncrBy(restaurantKey, "viewCount", 1),
            // 2. Fetch all restaurant fields as an object
            // This runs at the SAME TIME as the increment operation
            client.hGetAll(restaurantKey),

            client.sMembers(restaurantCuisinesKeyById(restaurantId))
        ]);
        
        return successResponse(res, { ...restaurant, cuisines }, "Fetched restaurant details and cuisines");
    } catch (error) {
        next(error);
    }
});

// POST a review for a restaurant
router.post("/:restaurantId/reviews", checkRestaurantExists, validate(ReviewSchema), async (req: Request<{ restaurantId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;
    const data = req.body;
    
    try {
        const client = await initializeRedisClient();
        const reviewId = nanoid();
        const reviewKey = reviewKeyById(restaurantId);
        const reviewDetailsKey = reviewDetailsKeyById(reviewId);

        const restaurantKey=restaurantKeyById(restaurantId);

        const reviewData = { id: reviewId, ...data, timestamp: Date.now(), restaurantId };

       const [reviewcount,setResult,totalReviews]= await Promise.all([
            client.lPush(reviewKey, reviewId),
            client.hSet(reviewDetailsKey, reviewData),
            client.hIncrBy(restaurantKeyById(restaurantId), "totalReviews", data.rating)
        ]);

        const newAverageRating=Number((totalReviews)/(reviewcount)).toFixed(1);
        await Promise.all([
            client.hSet(restaurantKey, {averageRating:newAverageRating}),
            client.zAdd(restaurentsByRatingKey, {score:Number(newAverageRating),value:restaurantId})

        ])
        return successResponse(res, reviewData, "Added review successfully");
    } catch (error) {
        next(error);
    }
});

// GET reviews for a restaurant with pagination
router.get("/:restaurantId/reviews", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1;

    try {
        const client = await initializeRedisClient();
        const reviewKey = reviewKeyById(restaurantId);
        const reviewIds = await client.lRange(reviewKey, start, end);

      // Update the GET reviews endpoint around line 95:

    const reviews = await Promise.all(
    reviewIds.map(async (id) => {
        const reviewDetailsKey = reviewDetailsKeyById(id);
        const reviewData = await client.hGetAll(reviewDetailsKey);
        
        // Parse numeric fields
        return {
            ...reviewData,
            rating: Number(reviewData.rating),
            timestamp: Number(reviewData.timestamp)
        };
    })
);

        return successResponse(res, reviews, "Fetched reviews successfully");
    } catch (error) {
        next(error);
    }
});


// DELETE a review
router.delete("/:restaurantId/reviews/:reviewId", checkRestaurantExists, async (req: Request<{ restaurantId: string; reviewId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId, reviewId } = req.params;
    
    try {
        const client = await initializeRedisClient();
        const reviewKey = reviewKeyById(restaurantId);
        const reviewDetailsKey = reviewDetailsKeyById(reviewId);
        
        // Check if review exists
        const reviewExists = await client.exists(reviewDetailsKey);
        if (!reviewExists) {
            return res.status(404).json({
                success: false,
                error: "Review not found"
            });
        }
        
        // Verify the review belongs to this restaurant
        const reviewData = await client.hGet(reviewDetailsKey, "restaurantId");
        if (reviewData !== restaurantId) {
            return res.status(400).json({
                success: false,
                error: "Review does not belong to this restaurant"
            });
        }
        
        // Delete review from both list and hash
        await Promise.all([
            client.lRem(reviewKey, 1, reviewId),  // Remove reviewId from list
            client.del(reviewDetailsKey)           // Delete review details hash
        ]);
        
        return successResponse(res, { reviewId }, "Review deleted successfully");
    } catch (error) {
        next(error);
    }
});



export default router;