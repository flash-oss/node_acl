/*
	Redis Backend.

  Implementation of the storage backend using Redis
*/

var contract = require("./contract");

function noop() {}

function RedisBackend({ redis, prefix }) {
    this.redis = redis;
    this.prefix = prefix || "acl_";
}

RedisBackend.prototype = {
    async close() {
        await this.redis.quit();
    },

    /**
     Begins a transaction
  */
    async begin() {
        return await this.redis.multi();
    },

    /**
     Ends a transaction (and executes it)
  */
    async end(transaction) {
        await transaction.exec();
    },

    /**
    Cleans the whole storage.
  */
    async clean() {
        const keys = await this.redis.keys(this.prefix + "*");
        if (keys && keys.length) this.redis.del(keys);
    },

    /**
     Gets the contents at the bucket's key.
  */
    async get(bucket, key) {
        contract(arguments).params("string", "string|number").end();

        key = this.bucketKey(bucket, key);

        return await this.redis.sMembers(key);
    },

    /**
    Gets an object mapping each passed bucket to the union of the specified keys inside that bucket.
  */
    async unions(buckets, keys) {
        contract(arguments).params("array", "array").end();

        var redisKeys = {};
        var multi = this.redis.multi();

        for (const bucket of buckets) {
            redisKeys[bucket] = this.bucketKey(bucket, keys);
            multi.sUnion(redisKeys[bucket], noop);
        }

        const replies = await multi.exec();
        if (!Array.isArray(replies)) {
            return {};
        }

        var result = {};
        for (let index = 0; index < replies.length; index++) {
            let reply = replies[index];
            if (reply instanceof Error) throw reply;

            result[buckets[index]] = reply;
        }
        return result;
    },

    /**
		Returns the union of the values in the given keys.
	*/
    async union(bucket, keys) {
        contract(arguments).params("string", "array").end();

        keys = this.bucketKey(bucket, keys);
        return await this.redis.sUnion(keys);
    },

    /**
		Adds values to a given key inside a bucket.
	*/
    async add(transaction, bucket, key, values) {
        contract(arguments).params("object", "string", "string|number", "string|array|number").end();

        key = this.bucketKey(bucket, key);

        if (Array.isArray(values)) {
            for (const value of values) {
                transaction.sAdd(key, value);
            }
        } else {
            transaction.sAdd(key, values);
        }
    },

    /**
     Delete the given key(s) at the bucket
  */
    async del(transaction, bucket, keys) {
        contract(arguments).params("object", "string", "string|array").end();

        keys = Array.isArray(keys) ? keys : [keys];

        keys = keys.map((key) => this.bucketKey(bucket, key));

        await transaction.del(keys);
    },

    /**
		Removes values from a given key inside a bucket.
	*/
    async remove(transaction, bucket, key, values) {
        contract(arguments).params("object", "string", "string|number", "string|array|number").end();

        key = this.bucketKey(bucket, key);

        if (Array.isArray(values)) {
            for (const value of values) {
                transaction.sRem(key, value);
            }
        } else {
            transaction.sRem(key, values);
        }
    },

    //
    // Private methods
    //

    bucketKey(bucket, keys) {
        if (Array.isArray(keys)) {
            return keys.map((key) => this.prefix + "_" + bucket + "@" + key);
        } else {
            return this.prefix + "_" + bucket + "@" + keys;
        }
    },
};

exports = module.exports = RedisBackend;
