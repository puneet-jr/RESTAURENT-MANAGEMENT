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

const router = express.Router();

router.post("/", validate(RestaurantSchema), async (req, res, next) => {
    const data = req.body as Restaurant;

    try {
        const client = await initializeRedisClient();
        const id = nanoid();
        const restaurantKey = restaurantKeyById(id);

        const addResult = await client.hSet(restaurantKey, {
            id: id,
            name: data.name,
            location: data.location,
        });

        console.log(`Added ${addResult} fields`);
        return successResponse(res, { id, name: data.name, location: data.location, cuisines: data.cuisines }, "Added new restaurant");
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
        const [viewCount, restaurant] = await Promise.all([
            // 1. Atomically increment viewCount by 1 and return the NEW count
            client.hIncrBy(restaurantKey, "viewCount", 1),
            // 2. Fetch all restaurant fields as an object
            // This runs at the SAME TIME as the increment operation
            client.hGetAll(restaurantKey)
        ]);
        
        return successResponse(res, { ...restaurant, viewCount }, "Fetched restaurant details");
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
        const reviewData = { id: reviewId, ...data, timestamp: Date.now(), restaurantId };

        await Promise.all([
            client.lPush(reviewKey, reviewId),
            client.hSet(reviewDetailsKey, reviewData)
        ]);

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