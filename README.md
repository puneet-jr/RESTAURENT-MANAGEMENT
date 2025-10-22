# 🍽️ Restaurant Review API with Redis

A  RESTful API built with Express.js and Redis for managing restaurants, reviews, and cuisines. Features advanced Redis data structures including sorted sets, sets, hashes, JSON, bloom filters, and full-text search.

## 🚀 Features

- **Restaurant Management**: CRUD operations for restaurants with real-time view tracking
- **Review System**: Add, retrieve, and delete restaurant reviews with pagination
- **Cuisine Filtering**: Query restaurants by cuisine type
- **Rating System**: Automatic rating calculation with sorted set for top-rated restaurants
- **Weather Integration**: Cached weather data for restaurant locations
- **Full-Text Search**: Fast restaurant search using Redis Search
- **Bloom Filter**: Duplicate restaurant detection
- **Detailed Restaurant Info**: JSON-based storage for rich metadata

## 🛠️ Tech Stack

- **Node.js** with **TypeScript**
- **Express.js** - Web framework
- **Redis** - Primary database with advanced features:
  - Hashes for restaurant data
  - Lists for reviews
  - Sets for cuisines
  - Sorted Sets for ratings
  - JSON for complex data
  - Bloom Filters for deduplication
  - RedisSearch for full-text search
- **Zod** - Schema validation
- **Nanoid** - Unique ID generation

## 📋 Prerequisites

- Node.js (v18 or higher)
- Redis Server (v7.0 or higher with RedisSearch and RedisBloom modules)
- npm or yarn

## ⚙️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd REDIS-ONE
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
PORT=3000
WEATHER_API_KEY=your_openweathermap_api_key
```

4. Initialize Redis indexes and bloom filter:
```bash
npm run dev
# In separate terminal:
npx tsx seed/createIndex.ts
npx tsx seed/bloomFilter.ts
```

## 🏃 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

## 📚 API Endpoints

### Restaurants

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/restaurents` | Get paginated list of restaurants (sorted by rating) |
| `POST` | `/restaurents` | Create a new restaurant |
| `GET` | `/restaurents/search?q={query}` | Search restaurants by name |
| `GET` | `/restaurents/:id` | Get restaurant details (increments view count) |
| `POST` | `/restaurents/:id/details` | Add detailed restaurant information |
| `GET` | `/restaurents/:id/details` | Get restaurant detailed information |
| `GET` | `/restaurents/:id/weather` | Get cached weather data for restaurant location |

### Reviews

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/restaurents/:id/reviews` | Add a review for a restaurant |
| `GET` | `/restaurents/:id/reviews` | Get paginated reviews for a restaurant |
| `DELETE` | `/restaurents/:id/reviews/:reviewId` | Delete a specific review |

### Cuisines

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/cuisines` | Get all available cuisines |
| `GET` | `/cuisines/:cuisine` | Get restaurants by cuisine type |

## 📝 Request Examples

### Create a Restaurant
```json
POST /restaurents
{
  "name": "Pizza Palace",
  "location": "New York, NY",
  "cuisines": ["Italian", "Pizza"]
}
```

### Add a Review
```json
POST /restaurents/:id/reviews
{
  "review": "Amazing pizza! Best I've ever had.",
  "rating": 5
}
```

### Add Restaurant Details
```json
POST /restaurents/:id/details
{
  "links": [
    {
      "name": "Website",
      "url": "https://pizzapalace.com"
    }
  ],
  "contact": {
    "phone": "1234567890",
    "email": "info@pizzapalace.com"
  }
}
```

## 🔑 Redis Key Structure

The application uses a consistent key naming pattern: `bites:{type}:{identifier}`

- `bites:restaurant:{id}` - Restaurant hash
- `bites:reviews:{restaurantId}` - List of review IDs
- `bites:review_details:{reviewId}` - Review data hash
- `bites:cuisines` - Set of all cuisines
- `bites:cuisine:{name}` - Set of restaurant IDs for cuisine
- `bites:restaurant_cuisines:{id}` - Set of cuisines for restaurant
- `bites:restaurants_by_rating` - Sorted set of restaurants by rating
- `bites:weather:{id}` - Cached weather data (60s TTL)
- `bites:restaurant_details:{id}` - JSON document with rich metadata
- `bites:bloom:restaurents` - Bloom filter for duplicate detection

## 🏗️ Project Structure

```
├── index.ts                    # Application entry point
├── routes/
│   ├── restaurents.ts         # Restaurant routes
│   └── cusines.ts             # Cuisine routes
├── middlewares/
│   ├── validate.ts            # Zod validation middleware
│   ├── checkRestaurantId.ts   # Restaurant existence check
│   └── errorHandler.ts        # Global error handler
├── schemas/
│   ├── restaurents.ts         # Restaurant validation schemas
│   └── review.ts              # Review validation schema
├── utils/
│   ├── client.ts              # Redis client initialization
│   ├── keys.ts                # Redis key generators
│   └── responses.ts           # Standardized response helpers
└── seed/
    ├── createIndex.ts         # RedisSearch index creation
    └── bloomFilter.ts         # Bloom filter initialization
```

## 🔒 Error Handling

The API uses standardized error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

All endpoints include proper error handling and validation.

## 🎯 Performance Features

- **Parallel Operations**: Uses `Promise.all()` for concurrent Redis operations
- **Caching**: Weather data cached for 60 seconds
- **Bloom Filters**: O(1) duplicate detection
- **Sorted Sets**: Efficient top-rated restaurant queries
- **Connection Pooling**: Singleton Redis client pattern



Built  using Redis and TypeScript
