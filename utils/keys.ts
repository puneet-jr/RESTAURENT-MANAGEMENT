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