import { get } from "http";

export function getKeyName(...args: string[]){
    return 'bites:' + args.join(":");
}

export const restaurantKeyById = (id: string) => {
    return getKeyName('restaurant', id);
}

export const reviewKeyById = (id: string) => {
    return getKeyName('reviews', id);
}

export const reviewDetailsKeyById = (id: string) => {
    return getKeyName('review_details', id);
}


export const cuisinesKey=getKeyName('cuisines');
export const cuisineKey =(name:string)=>getKeyName('cuisine',name);
export const restaurantCuisinesKeyById=(id:string)=>getKeyName('restaurant_cuisines',id);


export const restaurentsByRatingKey=getKeyName('restaurents_by_rating');
