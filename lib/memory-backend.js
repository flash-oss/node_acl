/*
  Memory Backend.

  In-memory implementation of the storage.
*/

const contract = require("./contract"),
    _ = require("lodash");

function MemoryBackend() {
    this._buckets = {};
}

MemoryBackend.prototype = {
    async close() {},

    /**
     Begins a transaction.
  */
    begin() {
        // returns a transaction object(just an array of functions will do here.)
        return [];
    },

    /**
     Ends a transaction (and executes it)
  */
    async end(transaction) {
        // Execute transaction
        for (let i = 0, len = transaction.length; i < len; i++) {
            await transaction[i]();
        }
    },

    /**
    Cleans the whole storage.
  */
    async clean() {
        this._buckets = {};
    },

    /**
     Gets the contents at the bucket's key.
  */
    async get(bucket, key) {
        contract(arguments).params("string", "string").end();

        if (this._buckets[bucket]) {
            return this._buckets[bucket][key] || [];
        } else {
            return [];
        }
    },

    /**
     Gets the union of the keys in each of the specified buckets
  */
    async unions(buckets, keys) {
        contract(arguments).params("array", "array").end();

        const results = {};

        for (const bucket of buckets) {
            if (this._buckets[bucket]) {
                results[bucket] = _.uniq(_.flatten(_.values(_.pick(this._buckets[bucket], keys))));
            } else {
                results[bucket] = [];
            }
        }

        return results;
    },

    /**
    Returns the union of the values in the given keys.
  */
    async union(bucket, keys) {
        contract(arguments).params("string", "array").end();

        let match, re;
        if (!this._buckets[bucket]) {
            Object.keys(this._buckets).some(function (b) {
                re = new RegExp("^" + b + "$");
                match = re.test(bucket);
                if (match) bucket = b;
                return match;
            });
        }

        if (this._buckets[bucket]) {
            const keyArrays = [];
            for (let i = 0, len = keys.length; i < len; i++) {
                if (this._buckets[bucket][keys[i]]) {
                    keyArrays.push.apply(keyArrays, this._buckets[bucket][keys[i]]);
                }
            }
            return _.union(keyArrays);
        } else {
            return [];
        }
    },

    /**
    Adds values to a given key inside a bucket.
  */
    add(transaction, bucket, key, values) {
        contract(arguments).params("array", "string", "string", "string|array").end();

        values = makeArray(values);

        transaction.push(() => {
            if (!this._buckets[bucket]) {
                this._buckets[bucket] = {};
            }
            if (!this._buckets[bucket][key]) {
                this._buckets[bucket][key] = values;
            } else {
                this._buckets[bucket][key] = _.union(values, this._buckets[bucket][key]);
            }
        });
    },

    /**
     Delete the given key(s) at the bucket
  */
    del(transaction, bucket, keys) {
        contract(arguments).params("array", "string", "string|array").end();

        keys = makeArray(keys);

        transaction.push(() => {
            if (this._buckets[bucket]) {
                for (let i = 0, len = keys.length; i < len; i++) {
                    delete this._buckets[bucket][keys[i]];
                }
            }
        });
    },

    /**
    Removes values from a given key inside a bucket.
  */
    remove(transaction, bucket, key, values) {
        contract(arguments).params("array", "string", "string", "string|array").end();

        values = makeArray(values);
        transaction.push(() => {
            if (this._buckets[bucket] && this._buckets[bucket][key]) {
                let old = this._buckets[bucket][key];
                this._buckets[bucket][key] = _.difference(old, values);
            }
        });
    },
};

function makeArray(arr) {
    return Array.isArray(arr) ? arr : [arr];
}

exports = module.exports = MemoryBackend;
