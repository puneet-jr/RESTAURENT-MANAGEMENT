import type { Request, Response, NextFunction } from "express";
import { errorResponse } from "../utils/responses.js";
import { ZodError } from "zod";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    // Log full error details for debugging
    console.error('=== Error Details ===');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Path:', req.path);
    console.error('Method:', req.method);
    console.error('Error:', err);
    console.error('Stack:', err.stack);
    console.error('===================');

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            error: "Validation failed",
            details: err.issues.map(e => ({
                field: e.path.join('.'),
                message: e.message
            }))
        });
    }

    // Handle Redis connection errors
    if (err.code === 'ECONNREFUSED' || err.message?.includes('Redis')) {
        return errorResponse(res, 503, "Database connection failed. Please try again later.");
    }

    // Handle duplicate key errors (if using unique constraints)
    if (err.code === 'DUPLICATE_KEY') {
        return errorResponse(res, 409, "Resource already exists");
    }

    // Handle Not Found errors
    if (err.status === 404 || err.message?.includes('not found')) {
        return errorResponse(res, 404, err.message || "Resource not found");
    }

    // Generic server error (don't expose internal details in production)
    const message = process.env.NODE_ENV === 'production' 
        ? "An unexpected error occurred" 
        : err.message || "Internal server error";
    
    return errorResponse(res, err.status || 500, message);
}