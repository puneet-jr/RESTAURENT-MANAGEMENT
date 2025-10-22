import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../middlewares/validate.js';
import { RestaurantSchema, type Restaurant } from '../schemas/restaurents.js';
import { initializeRedisClient } from '../utils/client.js';
import { restaurantKeyById, reviewKeyById, reviewDetailsKeyById } from '../utils/keys.js';
import { successResponse, errorResponse } from '../utils/responses.js';
import { nanoid } from 'nanoid';
import { checkRestaurantExists } from '../middlewares/checkRestaurantId.js';
import { ReviewSchema } from '../schemas/review.js';
import { cuisinesKey, cuisineKey, restaurantCuisinesKeyById } from '../utils/keys.js';
import { restaurentsByRatingKey } from '../utils/keys.js';
import { weatherKeyById } from '../utils/keys.js';
import { restaurantDetailsKeyById } from '../utils/keys.js';
import { indexKey } from '../utils/keys.js';
import dotenv from 'dotenv';
import { bloomKey } from '../utils/keys.js';

dotenv.config();
const router = express.Router();

// GET all restaurants with pagination
router.get("/", async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1; 
    
    try {
        const client = await initializeRedisClient();
        
        // Get highest-rated restaurants first
        const restaurantIds = await client.zRange(
            restaurentsByRatingKey, 
            start, 
            end,
            { REV: true } // Get in descending order ie, highest rated first.
        );

        if (restaurantIds.length === 0) {
            return successResponse(
                res,
                { restaurants: [], pagination: { page: Number(page), limit: Number(limit), total: 0 } },
                "No restaurants found"
            );
        }

        // Fetch both restaurant data AND cuisines
        const restaurants = await Promise.all(
            restaurantIds.map(async (id) => {
                try {
                    const [restaurant, cuisines] = await Promise.all([
                        client.hGetAll(restaurantKeyById(id)),
                        client.sMembers(restaurantCuisinesKeyById(id))
                    ]);
                    
                    return {
                        ...restaurant,
                        cuisines,
                        viewCount: Number(restaurant.viewCount || 0),
                        averageRating: Number(restaurant.averageRating || 0),
                        totalReviews: Number(restaurant.totalReviews || 0)
                    };
                } catch (error) {
                    console.error(`Error fetching restaurant ${id}:`, error);
                    return null; // Skip this restaurant if there's an error
                }
            })
        );

        // Filter out null values (failed fetches)
        const validRestaurants = restaurants.filter(r => r !== null);

        return successResponse(
            res, 
            {
                restaurants: validRestaurants,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: validRestaurants.length
                }
            },
            "Fetched restaurants successfully"
        );
    } catch (error) {
        console.error('Error in GET /restaurants:', error);
        next(error);
    }
});

// POST restaurant details
router.post("/:restaurantId/details", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    const data = req.body;

    try {
        const client = await initializeRedisClient();
        const restaurantDetailsKey = restaurantDetailsKeyById(restaurantId);
        
        await client.json.set(restaurantDetailsKey, ".", data);

        return successResponse(res, data, "Added restaurant details successfully");
    } catch (error) {
        console.error(`Error adding details for restaurant ${req.params.restaurantId}:`, error);
        next(error);
    }
});

// GET restaurant details
router.get("/:restaurantId/details", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    
    try {
        const client = await initializeRedisClient();
        const restaurantDetailsKey = restaurantDetailsKeyById(restaurantId);
        const details = await client.json.get(restaurantDetailsKey);
        
        if (!details) {
            return errorResponse(res, 404, "Restaurant details not found");
        }
        
        return successResponse(res, details, "Fetched restaurant details successfully");
    } catch (error) {
        console.error(`Error fetching details for restaurant ${restaurantId}:`, error);
        next(error);
    }
});

// POST new restaurant
router.post("/", validate(RestaurantSchema), async (req, res, next) => {
    const data = req.body as Restaurant;
    
    try {
        const client = await initializeRedisClient();
        const id = nanoid();
        const restaurantKey = restaurantKeyById(id);

        // Check for duplicates using Bloom filter
        const bloomString = `${data.name}|${data.location}`;
        const seenBefore = await client.bf.exists(bloomKey, bloomString);
        
        if (seenBefore) {
            return errorResponse(res, 400, "Restaurant seems to be duplicate");
        }

        const hashData = { 
            id, 
            name: data.name, 
            location: data.location,
            viewCount: 0,
            averageRating: 0,
            totalReviews: 0
        };
        
        await Promise.all([
            ...data.cuisines.map(cuisine =>
                Promise.all([
                    client.sAdd(cuisinesKey, cuisine),
                    client.sAdd(cuisineKey(cuisine), id),
                    client.sAdd(restaurantCuisinesKeyById(id), cuisine),
                ])
            ),
            client.hSet(restaurantKey, hashData),
            client.zAdd(restaurentsByRatingKey, { score: 0, value: id }),
            client.bf.add(bloomKey, bloomString)
        ]);

        return successResponse(res, { ...hashData, cuisines: data.cuisines }, "Added new restaurant");
    } catch (error) {
        console.error('Error creating restaurant:', error);
        next(error);
    }
});

// Search restaurants
router.get("/search", async (req, res, next) => {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
        return errorResponse(res, 400, "Search query is required");
    }

    try {
        const client = await initializeRedisClient();
        const results = await client.ft.search(indexKey, `@name:${q}*`);
        
        return successResponse(res, results, "Search completed successfully");
    } catch (error) {
        console.error('Error searching restaurants:', error);
        next(error);
    }
});

// GET restaurant by ID
router.get("/:restaurantId", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;
    
    try {
        const client = await initializeRedisClient();
        const restaurantKey = restaurantKeyById(restaurantId);

        const [viewCount, restaurant, cuisines] = await Promise.all([
            client.hIncrBy(restaurantKey, "viewCount", 1),
            client.hGetAll(restaurantKey),
            client.sMembers(restaurantCuisinesKeyById(restaurantId))
        ]);
        
        return successResponse(
            res, 
            { 
                ...restaurant, 
                cuisines,
                viewCount: Number(viewCount),
                averageRating: Number(restaurant.averageRating || 0),
                totalReviews: Number(restaurant.totalReviews || 0)
            }, 
            "Fetched restaurant details and cuisines"
        );
    } catch (error) {
        console.error(`Error fetching restaurant ${restaurantId}:`, error);
        next(error);
    }
});

// POST review
router.post("/:restaurantId/reviews", checkRestaurantExists, validate(ReviewSchema), async (req: Request<{ restaurantId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;
    const data = req.body;
    
    try {
        const client = await initializeRedisClient();
        const reviewId = nanoid();
        const reviewKey = reviewKeyById(restaurantId);
        const reviewDetailsKey = reviewDetailsKeyById(reviewId);
        const restaurantKey = restaurantKeyById(restaurantId);

        const reviewData = { 
            id: reviewId, 
            ...data, 
            timestamp: Date.now(), 
            restaurantId 
        };

        const [reviewCount, , totalRating] = await Promise.all([
            client.lPush(reviewKey, reviewId),
            client.hSet(reviewDetailsKey, reviewData),
            client.hIncrBy(restaurantKey, "totalReviews", data.rating)
        ]);

        // Calculate new average rating
        const newAverageRating = Number((totalRating / reviewCount).toFixed(1));
        
        await Promise.all([
            client.hSet(restaurantKey, { averageRating: newAverageRating }),
            client.zAdd(restaurentsByRatingKey, { score: newAverageRating, value: restaurantId })
        ]);
        
        return successResponse(res, reviewData, "Added review successfully");
    } catch (error) {
        console.error(`Error adding review for restaurant ${restaurantId}:`, error);
        next(error);
    }
});

// GET reviews with pagination
router.get("/:restaurantId/reviews", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1;

    try {
        const client = await initializeRedisClient();
        const reviewKey = reviewKeyById(restaurantId);
        const reviewIds = await client.lRange(reviewKey, start, end);

        if (reviewIds.length === 0) {
            return successResponse(res, [], "No reviews found");
        }

        const reviews = await Promise.all(
            reviewIds.map(async (id) => {
                try {
                    const reviewDetailsKey = reviewDetailsKeyById(id);
                    const reviewData = await client.hGetAll(reviewDetailsKey);
                    
                    return {
                        ...reviewData,
                        rating: Number(reviewData.rating),
                        timestamp: Number(reviewData.timestamp)
                    };
                } catch (error) {
                    console.error(`Error fetching review ${id}:`, error);
                    return null;
                }
            })
        );

        const validReviews = reviews.filter(r => r !== null);

        return successResponse(res, validReviews, "Fetched reviews successfully");
    } catch (error) {
        console.error(`Error fetching reviews for restaurant ${restaurantId}:`, error);
        next(error);
    }
});

// GET weather
router.get("/:restaurantId/weather", checkRestaurantExists, async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;

    try {
        const client = await initializeRedisClient();
        const restaurantKey = restaurantKeyById(restaurantId);
        const cachedWeather = await client.get(weatherKeyById(restaurantId));

        if (cachedWeather) {
            return successResponse(res, JSON.parse(cachedWeather), 'Cache HIT');
        }

        const [latitude, longitude] = await Promise.all([
            client.hGet(restaurantKey, 'latitude'),
            client.hGet(restaurantKey, 'longitude')
        ]);

        if (!latitude || !longitude) {
            return errorResponse(res, 404, 'Coordinates not found for restaurant');
        }

        const apiResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${process.env.WEATHER_API_KEY}&units=metric`
        );
        
        if (!apiResponse.ok) {
            throw new Error(`Weather API returned status ${apiResponse.status}`);
        }

        const json = await apiResponse.json();
        await client.set(weatherKeyById(restaurantId), JSON.stringify(json), { EX: 60 });
        
        return successResponse(res, json, 'Weather data fetched successfully');
    } catch (error) {
        console.error(`Error fetching weather for restaurant ${restaurantId}:`, error);
        next(error);
    }
});

// DELETE review
router.delete("/:restaurantId/reviews/:reviewId", checkRestaurantExists, async (req: Request<{ restaurantId: string; reviewId: string }>, res: Response, next: NextFunction) => {
    const { restaurantId, reviewId } = req.params;
    
    try {
        const client = await initializeRedisClient();
        const reviewKey = reviewKeyById(restaurantId);
        const reviewDetailsKey = reviewDetailsKeyById(reviewId);
        
        const reviewExists = await client.exists(reviewDetailsKey);
        if (!reviewExists) {
            return errorResponse(res, 404, "Review not found");
        }
        
        const reviewData = await client.hGet(reviewDetailsKey, "restaurantId");
        if (reviewData !== restaurantId) {
            return errorResponse(res, 400, "Review does not belong to this restaurant");
        }
        
        await Promise.all([
            client.lRem(reviewKey, 1, reviewId),
            client.del(reviewDetailsKey)
        ]);
        
        return successResponse(res, { reviewId }, "Review deleted successfully");
    } catch (error) {
        console.error(`Error deleting review ${reviewId} for restaurant ${restaurantId}:`, error);
        next(error);
    }
});

export default router;