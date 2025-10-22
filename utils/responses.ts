import type { Response } from "express";

export function successResponse(
  res: Response,
  data: any,
  message: string = "Success"
) {
  return res.status(200).json({ 
    success: true, 
    message, 
    data,
    timestamp: new Date().toISOString() 
  });
}

export function errorResponse(
  res: Response, 
  status: number, 
  error: string,
  details?: any 
) {
  return res.status(status).json({ 
    success: false, 
    error,
    ...(details && { details }), 
    timestamp: new Date().toISOString() 
  });
}