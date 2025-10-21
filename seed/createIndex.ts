import { initializeRedisClient } from '../utils/client.js';
import { indexKey, getKeyName } from '../utils/keys.js';

async function createIndex() {
    const client = await initializeRedisClient();

    try {
        await client.ft.dropIndex(indexKey);
        console.log("Index dropped successfully");
    } catch (err) {
        console.log("Index does not exist, creating a new one...");
    }

    await client.ft.create(
        indexKey,
        {
            '$.id': {
                type: 'TEXT',
                AS: 'id'
            },
            '$.name': {
                type: 'TEXT',
                AS: 'name'
            },
            '$.avgStars': {
                type: 'NUMERIC',
                AS: 'avg_stars',
                SORTABLE: true
            }
        },
        {
            ON: 'HASH',
            PREFIX: getKeyName('restaurant')
        }
    );

    console.log("Index created successfully");
}

createIndex()
    .then(() => {
        console.log("Done!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });